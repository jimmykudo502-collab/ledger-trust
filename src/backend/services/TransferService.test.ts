import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpreadsheetReader } from "../import/SpreadsheetReader";
import { SqliteBankAccountRepository } from "../repositories/BankAccountRepository";
import { SqliteCodingRuleRepository } from "../repositories/CodingRuleRepository";
import { SqliteJournalRepository } from "../repositories/JournalRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { SqliteStagingRepository } from "../repositories/StagingRepository";
import { SqliteTransferMatchRepository } from "../repositories/TransferMatchRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { BankAccountService } from "./BankAccountService";
import { BankPostingService } from "./BankPostingService";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { CodingRuleService } from "./CodingRuleService";
import { CodingService } from "./CodingService";
import { ImportService } from "./ImportService";
import { JournalService } from "./JournalService";
import { TransferService } from "./TransferService";

let workspace: TempClientWorkspace;
let chart: ChartOfAccountsService;
let bankAccounts: BankAccountService;
let coding: CodingService;
let posting: BankPostingService;
let transfers: TransferService;
let imports: ImportService;

beforeEach(() => {
  workspace = new TempClientWorkspace();
  const pool = workspace.pool;
  chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(pool.get(id)));
  bankAccounts = new BankAccountService((id) => new SqliteBankAccountRepository(pool.get(id)), chart);
  const stagingFor = (id: string) => new SqliteStagingRepository(pool.get(id));
  const journal = new JournalService((id) => new SqliteJournalRepository(pool.get(id)), chart);
  coding = new CodingService(stagingFor, bankAccounts, chart);
  posting = new BankPostingService(stagingFor, bankAccounts, journal, workspace.inTransaction);
  transfers = new TransferService(
    stagingFor,
    (id) => new SqliteTransferMatchRepository(pool.get(id)),
    bankAccounts,
    chart,
    journal,
    workspace.inTransaction,
  );
  const rules = new CodingRuleService((id) => new SqliteCodingRuleRepository(pool.get(id)), stagingFor, bankAccounts, chart);
  imports = new ImportService(new SpreadsheetReader(), bankAccounts, stagingFor, rules, transfers);
});

afterEach(() => {
  workspace.dispose();
});

const newClient = () => {
  const clientId = new ClientService(workspace.clients, [chart]).create({ name: "Made-up Rentals", fiscalYearEnd: "2026-12-31" }).id;
  const chequing = bankAccounts.create(clientId, { name: "Chequing", kind: "bank", ledger: { mode: "new", code: "1000" } });
  const savings = bankAccounts.create(clientId, { name: "Savings", kind: "bank", ledger: { mode: "new", code: "1010" } });
  const visa = bankAccounts.create(clientId, { name: "Visa", kind: "credit_card", ledger: { mode: "new", code: "2100" } });
  chart.create(clientId, { code: "5900", name: "Other expense", type: "expense" });
  return { clientId, chequing, savings, visa };
};

/** Pastes rows (Date, Description, Amount; positive = money in) into a tab. */
const paste = (clientId: string, tabId: number, rows: [string, string, number][]) => {
  const text = ["Date\tDescription\tAmount", ...rows.map((r) => r.join("\t"))].join("\n");
  const source = imports.openPaste(text);
  const ref = { clientId, bankAccountId: tabId, token: source.token, sheetIndex: 0 };
  const { suggestedMapping } = imports.analyze(ref);
  return imports.stage(ref, { ...suggestedMapping, amount: { kind: "signed", column: 2, positiveIsMoneyIn: true } }, []);
};

describe("TransferService", () => {
  it("matches a transfer automatically when the second side is imported (FR-19)", () => {
    const { clientId, chequing, savings } = newClient();
    expect(paste(clientId, chequing.id, [["2026-01-15", "TRANSFER TO SAVINGS", -500]]).matchedTransfers).toBe(0);
    expect(paste(clientId, savings.id, [["2026-01-16", "TRANSFER FROM CHEQUING", 500]]).matchedTransfers).toBe(1);

    const review = transfers.review(clientId);
    expect(review.matched).toHaveLength(1);
    expect(review.matched[0]).toMatchObject({
      from: { bankAccountName: "Chequing", amountCents: -50000 },
      to: { bankAccountName: "Savings", amountCents: 50000 },
      daysApart: 1,
    });
    const control = chart.findByCode(clientId, "1999");
    for (const tab of [chequing, savings]) {
      expect(coding.rows(clientId, tab.id)[0].offsetAccountId).toBe(control.id);
    }
  });

  it("only suggests ambiguous pairs, and confirms them with Match all", () => {
    const { clientId, chequing, savings, visa } = newClient();
    paste(clientId, savings.id, [["2026-01-16", "FROM CHEQUING", 500]]);
    paste(clientId, visa.id, [["2026-01-15", "PAYMENT RECEIVED", 500]]);
    expect(paste(clientId, chequing.id, [["2026-01-15", "OUT 500", -500]]).matchedTransfers).toBe(0);

    const before = transfers.review(clientId);
    expect(before.suggestions).toHaveLength(1);
    expect(before.suggestions[0].to.bankAccountName).toBe("Visa");

    expect(transfers.matchAll(clientId)).toEqual({ matchedCount: 1 });
    expect(transfers.review(clientId).suggestions).toEqual([]);
  });

  it("nets Bank Transfer Control to zero once matched transfers are posted (FR-20)", () => {
    const amountArb = fc.integer({ min: 1, max: 200_000 });
    fc.assert(
      fc.property(fc.array(fc.tuple(amountArb, fc.integer({ min: 0, max: 3 })), { minLength: 1, maxLength: 6 }), (transfersOut) => {
        const { clientId, chequing, savings } = newClient();
        paste(clientId, chequing.id, transfersOut.map(([cents], i) => [`2026-02-${String(i + 1).padStart(2, "0")}`, `TRANSFER ${i}`, -cents / 100]));
        paste(clientId, savings.id, transfersOut.map(([cents, lag], i) => [`2026-02-${String(i + 1 + lag).padStart(2, "0")}`, `FROM CHQ ${i}`, cents / 100]));
        transfers.matchAll(clientId);

        // Anything not matched gets a real code so it can be posted too.
        for (const tab of [chequing, savings]) {
          const uncoded = coding.rows(clientId, tab.id).filter((r) => r.offsetAccountId === null).map((r) => r.id);
          if (uncoded.length > 0) coding.setCode(clientId, tab.id, uncoded, "5900");
          posting.post(clientId, tab.id);
        }

        const review = transfers.review(clientId);
        expect(review.unmatched).toEqual([]);
        expect(review.postedBalanceCents).toBe(0);
      }),
      { numRuns: 15 },
    );
  }, 30_000);

  it("shows unmatched control items, lets them be paired by hand or cleared", () => {
    const { clientId, chequing, savings } = newClient();
    paste(clientId, chequing.id, [["2026-03-01", "TRANSFER", -250]]);
    paste(clientId, savings.id, [["2026-03-20", "LATE TRANSFER IN", 250]]);
    const [out] = coding.rows(clientId, chequing.id);
    const [late] = coding.rows(clientId, savings.id);
    coding.setCode(clientId, chequing.id, [out.id], "1999");

    // 19 days apart is outside the window, so it isn't suggested.
    const review = transfers.review(clientId);
    expect(review.suggestions).toEqual([]);
    expect(review.unmatched.map((r) => r.rowId)).toEqual([out.id]);

    transfers.match(clientId, late.id, out.id);
    expect(transfers.review(clientId).unmatched).toEqual([]);

    const [match] = transfers.review(clientId).matched;
    transfers.unmatch(clientId, match.matchId);
    expect(coding.rows(clientId, chequing.id)[0].offsetAccountId).toBeNull();

    coding.setCode(clientId, chequing.id, [out.id], "1999");
    transfers.notTransfer(clientId, out.id);
    expect(coding.rows(clientId, chequing.id)[0].offsetAccountId).toBeNull();
  });

  it("refuses bad pairs and never recodes rows posted elsewhere", () => {
    const { clientId, chequing, savings } = newClient();
    paste(clientId, chequing.id, [["2026-03-01", "A", -100], ["2026-03-02", "B", 100]]);
    paste(clientId, savings.id, [["2026-03-09", "C", 90], ["2026-03-10", "D", 100]]);
    const [a, b] = coding.rows(clientId, chequing.id);
    const [c, d] = coding.rows(clientId, savings.id);

    expect(() => transfers.match(clientId, a.id, b.id)).toThrow(/same tab/);
    expect(() => transfers.match(clientId, a.id, c.id)).toThrow(/same amount/);

    coding.setCode(clientId, savings.id, [d.id], "5900");
    posting.post(clientId, savings.id);
    expect(() => transfers.match(clientId, a.id, d.id)).toThrow(/already posted to another account/);
    expect(transfers.review(clientId).suggestions).toEqual([]);
  });
});
