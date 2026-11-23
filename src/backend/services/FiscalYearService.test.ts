import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteFiscalYearRepository } from "../repositories/FiscalYearRepository";
import { SqliteJournalRepository } from "../repositories/JournalRepository";
import { SqliteReportRepository } from "../repositories/ReportRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { FiscalYearService } from "./FiscalYearService";
import { JournalService } from "./JournalService";
import { ManualEntryService } from "./ManualEntryService";
import { ReportService } from "./ReportService";

let workspace: TempClientWorkspace;
let chart: ChartOfAccountsService;
let journal: JournalService;
let years: FiscalYearService;
let reports: ReportService;
let entries: ManualEntryService;

beforeEach(() => {
  workspace = new TempClientWorkspace();
  const pool = workspace.pool;
  chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(pool.get(id)));
  journal = new JournalService((id) => new SqliteJournalRepository(pool.get(id)), chart);
  years = new FiscalYearService(
    (id) => new SqliteFiscalYearRepository(pool.get(id)),
    (id) => new SqliteReportRepository(pool.get(id)),
    workspace.clients,
    journal,
    chart,
    workspace.inTransaction,
    () => "2027-03-15",
  );
  journal.usePeriodGuard(years);
  reports = new ReportService((id) => new SqliteReportRepository(pool.get(id)));
  entries = new ManualEntryService(journal);
});

afterEach(() => {
  workspace.dispose();
});

const setup = () => {
  const clientId = new ClientService(workspace.clients, [chart]).create({ name: "Made-up Rentals", fiscalYearEnd: "2026-12-31" }).id;
  const [cash, re, rent, repairs] = [
    chart.create(clientId, { code: "1000", name: "Chequing", type: "asset" }).id,
    chart.create(clientId, { code: "3900", name: "Retained Earnings", type: "equity" }).id,
    chart.create(clientId, { code: "4000", name: "Rent income", type: "revenue" }).id,
    chart.create(clientId, { code: "5100", name: "Repairs", type: "expense" }).id,
  ];
  const post = (date: string, debit: number, credit: number, cents: number) =>
    entries.create(clientId, { date, description: `Made-up ${date}`, lines: [
      { accountId: debit, debitCents: cents, creditCents: 0 },
      { accountId: credit, debitCents: 0, creditCents: cents },
    ] });
  return { clientId, cash, re, rent, repairs, post };
};

describe("FiscalYearService (FR-26 to FR-28)", () => {
  it("lists every year from the first activity to today", () => {
    const { clientId, cash, rent, post } = setup();
    post("2025-06-01", cash, rent, 100);
    expect(years.overview(clientId).years.map((y) => [y.label, y.from, y.to, y.status])).toEqual([
      ["FY 2027", "2027-01-01", "2027-12-31", "open"],
      ["FY 2026", "2026-01-01", "2026-12-31", "open"],
      ["FY 2025", "2025-01-01", "2025-12-31", "open"],
    ]);
  });

  it("closes revenue and expenses into retained earnings and rolls balances forward", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 1, max: 12 }), fc.boolean(), fc.integer({ min: 1, max: 500_000 })), { minLength: 1, maxLength: 10 }),
        (rows) => {
          const { clientId, cash, re, rent, repairs, post } = setup();
          for (const [month, isIncome, cents] of rows) {
            const date = `2026-${String(month).padStart(2, "0")}-15`;
            if (isIncome) post(date, cash, rent, cents);
            else post(date, repairs, cash, cents);
          }
          const fy2026 = { from: "2026-01-01", to: "2026-12-31" };
          const netIncome = reports.incomeStatement(clientId, fy2026).netIncomeCents;

          years.close(clientId, "2026-12-31", re);

          // The full-year statements are unchanged by the close.
          expect(reports.incomeStatement(clientId, fy2026).netIncomeCents).toBe(netIncome);
          // In the new year, revenue and expenses start at zero and retained earnings holds the year's income.
          const next = reports.trialBalance(clientId, { from: "2027-01-01", to: "2027-12-31" });
          for (const row of next.rows) {
            if (row.type === "revenue" || row.type === "expense") expect(row.openingCents).toBe(0);
          }
          expect(next.rows.find((row) => row.accountId === re)?.openingCents ?? 0).toBe(-netIncome);
          // Balance sheet balances carry forward, and nothing is left unclosed.
          const bs = reports.balanceSheet(clientId, { from: "2027-01-01", to: "2027-01-31" });
          expect(bs.currentEarningsCents).toBe(0);
          expect(bs.totalAssetsCents).toBe(bs.totalLiabilitiesCents + bs.totalEquityCents);
          expect(years.overview(clientId).years.find((y) => y.label === "FY 2026")?.status).toBe("closed");
        },
      ),
      { numRuns: 15 },
    );
  }, 60_000);

  it("blocks changes in a locked year and allows a reversing entry in an open one (FR-27)", () => {
    const { clientId, cash, rent, post } = setup();
    const original = post("2026-05-01", cash, rent, 120000);
    years.lock(clientId, "2026-12-31");

    expect(() => post("2026-06-01", cash, rent, 100)).toThrow(/which is locked/);
    expect(() => entries.delete(clientId, original.id)).toThrow(/which is locked/);
    expect(() => entries.update(clientId, original.id, { date: "2027-01-02", description: "x", lines: [] as never })).toThrow();
    expect(() => years.reverse(clientId, original.id, "2026-12-31")).toThrow(/which is locked/);

    const reversalId = years.reverse(clientId, original.id, "2027-01-02");
    const reversal = journal.require(clientId, reversalId);
    expect(reversal).toMatchObject({ source: "reversal", reversesEntryId: original.id, date: "2027-01-02" });
    expect(reversal.lines.map((l) => [l.debitCents, l.creditCents])).toEqual([[0, 120000], [120000, 0]]);
    expect(journal.require(clientId, original.id).reversedByEntryId).toBe(reversalId);
    expect(() => years.reverse(clientId, original.id, "2027-01-03")).toThrow(/already been reversed/);
    expect(journal.accountBalance(clientId, cash)).toBe(0);
  });

  it("unlocks only the latest locked year, removing its closing entry", () => {
    const { clientId, cash, re, rent, post } = setup();
    post("2025-03-01", cash, rent, 5000);
    post("2026-03-01", cash, rent, 7000);
    years.close(clientId, "2025-12-31", re);
    years.close(clientId, "2026-12-31", re);

    expect(() => years.unlock(clientId, "2025-12-31")).toThrow(/Unlock FY 2026 first/);
    years.unlock(clientId, "2026-12-31");

    const overview = years.overview(clientId);
    expect(overview.years.find((y) => y.label === "FY 2026")).toMatchObject({ status: "open", closingEntryId: null });
    expect(overview.retainedEarningsAccountId).toBe(re);
    // Only FY 2025's income is now in retained earnings.
    expect(journal.accountBalance(clientId, re)).toBe(-5000);
    post("2026-04-01", cash, rent, 1);
  });

  it("refuses to close with unposted rows, an earlier open year, or a non-equity account", () => {
    const { clientId, cash, re, rent, post } = setup();
    post("2025-03-01", cash, rent, 5000);
    post("2026-03-01", cash, rent, 7000);
    expect(() => years.close(clientId, "2026-12-31", re)).toThrow(/Close FY 2025 first/);
    expect(() => years.close(clientId, "2025-12-31", rent)).toThrow(/equity account/);
  });
});
