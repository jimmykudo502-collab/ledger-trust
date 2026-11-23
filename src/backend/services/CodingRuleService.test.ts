import * as fc from "fast-check";
import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CodingRule } from "../../common/rules/ruleSchemas";
import { SpreadsheetReader } from "../import/SpreadsheetReader";
import { pickRule } from "../posting/ruleMatching";
import { SqliteBankAccountRepository } from "../repositories/BankAccountRepository";
import { SqliteCodingRuleRepository } from "../repositories/CodingRuleRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { SqliteStagingRepository } from "../repositories/StagingRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { BankAccountService } from "./BankAccountService";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { CodingRuleService } from "./CodingRuleService";
import { CodingService } from "./CodingService";
import { ImportService } from "./ImportService";

describe("pickRule", () => {
  const ruleArb: fc.Arbitrary<CodingRule> = fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    matchText: fc.constantFrom("hydro", "HYDRO ONE", "rent", "home hardware", "e-transfer"),
    accountId: fc.integer({ min: 1, max: 9 }),
    bankAccountId: fc.option(fc.constantFrom(1, 2), { nil: null }),
  });
  const descriptionArb = fc.constantFrom("HYDRO ONE BILL", "E-TRANSFER RENT UNIT 2", "Home  Hardware #221", "Coffee");

  it("only picks a rule whose text the description contains, for this tab or all tabs", () => {
    fc.assert(
      fc.property(descriptionArb, fc.constantFrom(1, 2), fc.uniqueArray(ruleArb, { selector: (r) => r.id, maxLength: 8 }), (description, tab, rules) => {
        const picked = pickRule(description, tab, rules);
        const matches = rules.filter(
          (rule) =>
            (rule.bankAccountId === null || rule.bankAccountId === tab) &&
            description.replace(/\s+/g, " ").toLowerCase().includes(rule.matchText.toLowerCase()),
        );
        if (matches.length === 0) {
          expect(picked).toBeUndefined();
        } else {
          expect(matches).toContain(picked);
          // The most specific (longest) matching text always wins.
          expect(picked.matchText.length).toBe(Math.max(...matches.map((r) => r.matchText.length)));
        }
      }),
    );
  });

  it("prefers the longer match and the tab-specific rule", () => {
    const rules: CodingRule[] = [
      { id: 1, matchText: "hydro", accountId: 5, bankAccountId: null },
      { id: 2, matchText: "hydro one", accountId: 6, bankAccountId: null },
      { id: 3, matchText: "hydro one", accountId: 7, bankAccountId: 1 },
    ];
    expect(pickRule("HYDRO ONE BILL", 1, rules)?.accountId).toBe(7);
    expect(pickRule("HYDRO ONE BILL", 2, rules)?.accountId).toBe(6);
    expect(pickRule("Hydro Quebec", 2, rules)?.accountId).toBe(5);
  });
});

describe("CodingRuleService", () => {
  let workspace: TempClientWorkspace;
  let chart: ChartOfAccountsService;
  let bankAccounts: BankAccountService;
  let rules: CodingRuleService;
  let coding: CodingService;
  let imports: ImportService;
  let clientId: string;
  let tabId: number;

  beforeEach(() => {
    workspace = new TempClientWorkspace();
    chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(workspace.pool.get(id)));
    bankAccounts = new BankAccountService((id) => new SqliteBankAccountRepository(workspace.pool.get(id)), chart);
    const stagingFor = (id: string) => new SqliteStagingRepository(workspace.pool.get(id));
    rules = new CodingRuleService((id) => new SqliteCodingRuleRepository(workspace.pool.get(id)), stagingFor, bankAccounts, chart);
    coding = new CodingService(stagingFor, bankAccounts, chart);
    imports = new ImportService(new SpreadsheetReader(), bankAccounts, stagingFor, rules, { autoMatch: () => 0 });
    clientId = new ClientService(workspace.clients, [chart]).create({ name: "Made-up Rentals", fiscalYearEnd: "2026-12-31" }).id;
    tabId = bankAccounts.create(clientId, { name: "Chequing", kind: "bank", ledger: { mode: "new", code: "1000" } }).id;
    chart.create(clientId, { code: "5200", name: "Utilities", type: "expense" });
    chart.create(clientId, { code: "4000", name: "Rent income", type: "revenue" });
  });

  afterEach(() => {
    workspace.dispose();
  });

  const importRows = (rows: unknown[][]) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Date", "Description", "Amount"], ...rows]), "S");
    const source = imports.openFile("made-up.xlsx", XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    const ref = { clientId, bankAccountId: tabId, token: source.token, sheetIndex: 0 };
    imports.stage(ref, imports.analyze(ref).suggestedMapping, []);
  };

  const codes = () =>
    coding.rows(clientId, tabId).map((row) => (row.offsetAccountId === null ? null : chart.find(clientId, row.offsetAccountId).code));

  it("codes later imports automatically (FR-18)", () => {
    rules.create(clientId, { matchText: "hydro", code: "5200", bankAccountId: null }, false);
    rules.create(clientId, { matchText: "e-transfer rent", code: "4000", bankAccountId: tabId }, false);

    importRows([
      ["2026-02-01", "HYDRO ONE BILL", -85],
      ["2026-02-03", "E-TRANSFER RENT UNIT 2", 1325],
      ["2026-02-05", "COFFEE", -4.5],
    ]);

    expect(codes()).toEqual(["5200", "4000", null]);
  });

  it("applies a new rule to uncoded rows only, never overwriting a code", () => {
    importRows([
      ["2026-02-01", "HYDRO ONE BILL", -85],
      ["2026-02-02", "Hydro deposit refund", 40],
    ]);
    const [, second] = coding.rows(clientId, tabId);
    coding.setCode(clientId, tabId, [second.id], "4000");

    expect(rules.create(clientId, { matchText: "HYDRO", code: "5200", bankAccountId: tabId }, true)).toEqual({ codedCount: 1 });
    expect(codes()).toEqual(["5200", "4000"]);
  });

  it("replaces a rule with the same text and scope, and deletes rules", () => {
    rules.create(clientId, { matchText: "Hydro", code: "5200", bankAccountId: null }, false);
    rules.create(clientId, { matchText: "hydro", code: "4000", bankAccountId: null }, false);

    const [only] = rules.list(clientId);
    expect(rules.list(clientId)).toHaveLength(1);
    expect(only.accountId).toBe(chart.findByCode(clientId, "4000").id);

    rules.delete(clientId, only.id);
    expect(rules.list(clientId)).toEqual([]);
    expect(() => rules.delete(clientId, only.id)).toThrow(/no longer exists/);
  });

  it("refuses unknown codes and the tab's own account", () => {
    expect(() => rules.create(clientId, { matchText: "fee", code: "9999", bankAccountId: null }, false)).toThrow(/No account has code 9999/);
    expect(() => rules.create(clientId, { matchText: "fee", code: "1000", bankAccountId: tabId }, false)).toThrow(/own account/);
    expect(() => rules.create(clientId, { matchText: " ", code: "5200", bankAccountId: null }, false)).toThrow(/at least two characters/);
  });
});
