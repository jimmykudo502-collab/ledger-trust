import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AccountType } from "../../common/accounts/accountSchemas";
import type { JournalLineInput } from "../../common/journal/journalSchemas";
import { SqliteJournalRepository } from "../repositories/JournalRepository";
import { SqliteReportRepository } from "../repositories/ReportRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { JournalService } from "./JournalService";
import { ReportService } from "./ReportService";

let workspace: TempClientWorkspace;
let chart: ChartOfAccountsService;
let journal: JournalService;
let reports: ReportService;

beforeEach(() => {
  workspace = new TempClientWorkspace();
  chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(workspace.pool.get(id)));
  journal = new JournalService((id) => new SqliteJournalRepository(workspace.pool.get(id)), chart);
  reports = new ReportService((id) => new SqliteReportRepository(workspace.pool.get(id)));
});

afterEach(() => {
  workspace.dispose();
});

const ACCOUNTS: [string, string, AccountType][] = [
  ["1000", "Chequing", "asset"],
  ["1500", "Building", "asset"],
  ["2500", "Mortgage", "liability"],
  ["3000", "Owner equity", "equity"],
  ["4000", "Rent income", "revenue"],
  ["5100", "Repairs", "expense"],
  ["5200", "Utilities", "expense"],
];

const setup = () => {
  const clientId = new ClientService(workspace.clients, [chart]).create({ name: "Made-up Rentals", fiscalYearEnd: "2026-12-31" }).id;
  const ids = ACCOUNTS.map(([code, name, type]) => chart.create(clientId, { code, name, type }).id);
  return { clientId, ids };
};

const dayArb = fc.integer({ min: 1, max: 28 }).map((d) => `2026-03-${String(d).padStart(2, "0")}`);

/** A balanced entry: random debits on random accounts, credited to one account. */
const entryArb = fc.record({
  date: dayArb,
  debits: fc.array(fc.tuple(fc.nat(6), fc.integer({ min: 1, max: 500_000 })), { minLength: 1, maxLength: 3 }),
  creditTo: fc.nat(6),
});

const toLines = (ids: number[], entry: { debits: [number, number][]; creditTo: number }): JournalLineInput[] => [
  ...entry.debits.map(([pick, cents]) => ({ accountId: ids[pick], debitCents: cents, creditCents: 0 })),
  { accountId: ids[entry.creditTo], debitCents: 0, creditCents: entry.debits.reduce((s, [, c]) => s + c, 0) },
];

describe("ReportService (FR-29 to FR-31)", () => {
  it("keeps every report consistent with the journal and with each other", () => {
    fc.assert(
      fc.property(fc.array(entryArb, { minLength: 1, maxLength: 12 }), dayArb, dayArb, (entries, a, b) => {
        const { clientId, ids } = setup();
        entries.forEach((entry) => journal.post(clientId, { date: entry.date, description: "Made-up", source: "manual", lines: toLines(ids, entry) }));
        const [from, to] = a <= b ? [a, b] : [b, a];
        const options = { from, to };

        // Reference: closing balance per account straight from the inputs.
        const expected = new Map<number, number>();
        for (const entry of entries.filter((e) => e.date <= to)) {
          for (const line of toLines(ids, entry)) {
            expected.set(line.accountId, (expected.get(line.accountId) ?? 0) + line.debitCents - line.creditCents);
          }
        }

        const tb = reports.trialBalance(clientId, options);
        expect(tb.totals.debitCents).toBe(tb.totals.creditCents);
        expect(tb.totals.closingDebitCents).toBe(tb.totals.closingCreditCents);
        for (const row of tb.rows) expect(row.closingCents).toBe(expected.get(row.accountId) ?? 0);

        const bs = reports.balanceSheet(clientId, options);
        expect(bs.totalAssetsCents).toBe(bs.totalLiabilitiesCents + bs.totalEquityCents);

        const gl = reports.generalLedger(clientId, options);
        for (const account of gl.accounts) {
          const tbRow = tb.rows.find((row) => row.accountId === account.accountId);
          expect(account.closingCents).toBe(tbRow.closingCents);
          expect(account.lines.at(-1)?.balanceCents ?? account.openingCents).toBe(account.closingCents);
        }

        // From the very start, net income is exactly the balance sheet's current earnings.
        const fromStart = { from: "2026-01-01", to };
        expect(reports.incomeStatement(clientId, fromStart).netIncomeCents).toBe(reports.balanceSheet(clientId, fromStart).currentEarningsCents);
      }),
      { numRuns: 40 },
    );
  }, 60_000);

  it("drills into one account's ledger with opening balance and running balance", () => {
    const { clientId, ids } = setup();
    const [chequing, , , equity, rent, repairs] = ids;
    journal.post(clientId, { date: "2026-02-15", description: "Owner deposit", source: "manual", lines: [
      { accountId: chequing, debitCents: 500000, creditCents: 0 },
      { accountId: equity, debitCents: 0, creditCents: 500000 },
    ] });
    journal.post(clientId, { date: "2026-03-01", description: "Rent", source: "manual", lines: [
      { accountId: chequing, debitCents: 145000, creditCents: 0 },
      { accountId: rent, debitCents: 0, creditCents: 145000 },
    ] });
    journal.post(clientId, { date: "2026-03-08", description: "Repairs", source: "manual", lines: [
      { accountId: repairs, debitCents: 21377, creditCents: 0 },
      { accountId: chequing, debitCents: 0, creditCents: 21377 },
    ] });

    const gl = reports.generalLedger(clientId, { from: "2026-03-01", to: "2026-03-31", accountId: chequing });
    expect(gl.accounts).toHaveLength(1);
    expect(gl.accounts[0]).toMatchObject({ code: "1000", openingCents: 500000, debitCents: 145000, creditCents: 21377, closingCents: 623623 });
    expect(gl.accounts[0].lines.map((line) => [line.description, line.sourceLabel, line.balanceCents])).toEqual([
      ["Rent", "Manual entry", 645000],
      ["Repairs", "Manual entry", 623623],
    ]);

    const is = reports.incomeStatement(clientId, { from: "2026-03-01", to: "2026-03-31" });
    expect(is).toMatchObject({ totalRevenueCents: 145000, totalExpensesCents: 21377, netIncomeCents: 123623 });
    const bs = reports.balanceSheet(clientId, { from: "2026-03-01", to: "2026-03-31" });
    expect(bs).toMatchObject({ totalAssetsCents: 623623, totalEquityCents: 623623, currentEarningsCents: 123623 });
  });

  it("rejects a start date after the end date", () => {
    const { clientId } = setup();
    expect(() => reports.trialBalance(clientId, { from: "2026-04-01", to: "2026-03-01" })).toThrow(/start date/);
  });
});
