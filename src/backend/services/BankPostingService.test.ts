import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteBankAccountRepository } from "../repositories/BankAccountRepository";
import { SqliteJournalRepository } from "../repositories/JournalRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { SqliteStagingRepository } from "../repositories/StagingRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { BankAccountService } from "./BankAccountService";
import { BankPostingService } from "./BankPostingService";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { CodingService } from "./CodingService";
import { JournalService } from "./JournalService";

let workspace: TempClientWorkspace;
let chart: ChartOfAccountsService;
let bankAccounts: BankAccountService;
let coding: CodingService;
let posting: BankPostingService;
let journal: JournalService;
let staging: (id: string) => SqliteStagingRepository;

beforeEach(() => {
  workspace = new TempClientWorkspace();
  chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(workspace.pool.get(id)));
  bankAccounts = new BankAccountService((id) => new SqliteBankAccountRepository(workspace.pool.get(id)), chart);
  staging = (id) => new SqliteStagingRepository(workspace.pool.get(id));
  journal = new JournalService((id) => new SqliteJournalRepository(workspace.pool.get(id)), chart);
  coding = new CodingService(staging, bankAccounts, chart);
  posting = new BankPostingService(staging, bankAccounts, journal, workspace.inTransaction);
});

afterEach(() => {
  workspace.dispose();
});

/** A made-up client with a Chequing tab, income and expense accounts, and staged rows. */
const setup = (amounts: number[]) => {
  const clientId = new ClientService(workspace.clients, [chart]).create({
    name: "Made-up Rentals",
    fiscalYearEnd: "2026-12-31",
  }).id;
  const tab = bankAccounts.create(clientId, { name: "Chequing", kind: "bank", ledger: { mode: "new", code: "1000" } });
  chart.create(clientId, { code: "4000", name: "Rent income", type: "revenue" });
  chart.create(clientId, { code: "5100", name: "Repairs", type: "expense" });
  staging(clientId).insertBatch(
    tab.id,
    { kind: "paste", name: null },
    amounts.map((amountCents, i) => ({ rowNumber: i + 1, date: "2026-01-15", description: `Row ${i + 1}`, amountCents })),
  );
  return { clientId, tab, rows: () => coding.rows(clientId, tab.id) };
};

const amountsArb = fc.array(fc.integer({ min: -500_000, max: 500_000 }).filter((n) => n !== 0), { minLength: 1, maxLength: 12 });

describe("coding and posting", () => {
  it("posts exactly the coded rows, and the tab's balance equals their total (FR-17, FR-21, FR-23)", () => {
    fc.assert(
      fc.property(amountsArb, fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }), (amounts, codedFlags) => {
        const { clientId, tab, rows } = setup(amounts);
        const toCode = rows().filter((_, i) => codedFlags[i]);
        for (const row of toCode) {
          coding.setCode(clientId, tab.id, [row.id], row.amountCents > 0 ? "4000" : "5100");
        }

        if (toCode.length === 0) {
          expect(() => posting.post(clientId, tab.id)).toThrow(/no coded rows/);
          return;
        }
        expect(posting.post(clientId, tab.id)).toEqual({ postedCount: toCode.length });

        const after = rows();
        expect(after.filter((r) => r.status === "posted").map((r) => r.id)).toEqual(toCode.map((r) => r.id));
        expect(after.filter((r) => r.status === "staged").every((r) => r.offsetAccountId === null)).toBe(true);

        const postedTotal = toCode.reduce((sum, r) => sum + r.amountCents, 0);
        expect(bankAccounts.require(clientId, tab.id).ledgerBalanceCents).toBe(postedTotal);
        const income = chart.findByCode(clientId, "4000");
        const repairs = chart.findByCode(clientId, "5100");
        // Double entry: every posted cent lands on the other side too.
        expect(journal.accountBalance(clientId, income.id) + journal.accountBalance(clientId, repairs.id)).toBe(-postedTotal);
        for (const row of toCode) {
          expect(journal.findByStagedTransaction(clientId, row.id)).toBeDefined();
        }
      }),
      { numRuns: 25 },
    );
  });

  it("unposting returns a row to staging with its code and reverses its effect (FR-26)", () => {
    fc.assert(
      fc.property(amountsArb, (amounts) => {
        const { clientId, tab, rows } = setup(amounts);
        coding.setCode(clientId, tab.id, rows().map((r) => r.id), "4000");
        posting.post(clientId, tab.id);
        const [first] = rows();

        posting.unpost(clientId, first.id);

        const again = rows().find((r) => r.id === first.id);
        expect(again).toMatchObject({ status: "staged", offsetAccountId: chart.findByCode(clientId, "4000").id });
        expect(journal.findByStagedTransaction(clientId, first.id)).toBeUndefined();
        const total = amounts.reduce((sum, a) => sum + a, 0);
        expect(bankAccounts.require(clientId, tab.id).ledgerBalanceCents).toBe(total - first.amountCents);
      }),
      { numRuns: 20 },
    );
  });

  it("marks posted accounts as having activity, so they can't be deleted (FR-8)", () => {
    const { clientId, tab, rows } = setup([120000]);
    coding.setCode(clientId, tab.id, [rows()[0].id], "4000");
    posting.post(clientId, tab.id);

    const income = chart.findByCode(clientId, "4000");
    expect(income.hasActivity).toBe(true);
    expect(() => chart.delete(clientId, income.id)).toThrow(/posted entries/);
  });

  it("refuses unknown codes, the tab's own account, and recoding posted rows", () => {
    const { clientId, tab, rows } = setup([-4500]);
    const [row] = rows();

    expect(() => coding.setCode(clientId, tab.id, [row.id], "9999")).toThrow("No account has code 9999.");
    expect(() => coding.setCode(clientId, tab.id, [row.id], "1000")).toThrow(/this tab's own account/);

    coding.setCode(clientId, tab.id, [row.id], "5100");
    posting.post(clientId, tab.id);
    expect(() => coding.setCode(clientId, tab.id, [row.id], null)).toThrow(/Unpost the row first/);
    expect(() => posting.unpost(clientId, row.id + 100)).toThrow(/no longer exists/);
  });

  it("clears a code, and rejects rows from another tab", () => {
    const { clientId, tab, rows } = setup([-4500]);
    const [row] = rows();
    coding.setCode(clientId, tab.id, [row.id], "5100");
    coding.setCode(clientId, tab.id, [row.id], null);
    expect(rows()[0].offsetAccountId).toBeNull();

    const other = bankAccounts.create(clientId, { name: "Visa", kind: "credit_card", ledger: { mode: "new", code: "2100" } });
    expect(() => coding.setCode(clientId, other.id, [row.id], "5100")).toThrow(/no longer exist in this tab/);
  });
});
