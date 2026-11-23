import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { entryTotals, type JournalLineInput } from "../../common/journal/journalSchemas";
import { bankEntryLines } from "../posting/bankEntry";
import { SqliteJournalRepository } from "../repositories/JournalRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { JournalService } from "./JournalService";

let workspace: TempClientWorkspace;
let journal: JournalService;
let clientId: string;
let accountIds: number[];

beforeEach(() => {
  workspace = new TempClientWorkspace();
  const chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(workspace.pool.get(id)));
  journal = new JournalService((id) => new SqliteJournalRepository(workspace.pool.get(id)), chart);
  clientId = new ClientService(workspace.clients, [chart]).create({
    name: "Made-up Rentals",
    fiscalYearEnd: "2026-12-31",
  }).id;
  accountIds = [
    chart.create(clientId, { code: "1000", name: "Chequing", type: "asset" }).id,
    chart.create(clientId, { code: "4000", name: "Rent income", type: "revenue" }).id,
    chart.create(clientId, { code: "5100", name: "Repairs", type: "expense" }).id,
  ];
});

afterEach(() => {
  workspace.dispose();
});

const lineArb = (ids: () => number[]): fc.Arbitrary<JournalLineInput> =>
  fc
    .record({ pick: fc.nat(), amount: fc.integer({ min: 1, max: 1_000_000 }), debit: fc.boolean() })
    .map(({ pick, amount, debit }) => {
      const list = ids();
      return { accountId: list[pick % list.length], debitCents: debit ? amount : 0, creditCents: debit ? 0 : amount };
    });

const totalOfAllBalances = () => accountIds.reduce((sum, id) => sum + journal.accountBalance(clientId, id), 0);

describe("JournalService", () => {
  it("posts an entry only when debits equal credits, and the ledger always nets to zero", () => {
    fc.assert(
      fc.property(fc.array(lineArb(() => accountIds), { minLength: 2, maxLength: 6 }), (lines) => {
        const { debitCents, creditCents } = entryTotals(lines);
        const post = () =>
          journal.post(clientId, { date: "2026-01-15", description: "Made-up", source: "manual", lines });

        if (debitCents === creditCents) {
          expect(post).not.toThrow();
        } else {
          expect(post).toThrow(/doesn't balance/);
        }
        expect(totalOfAllBalances()).toBe(0);
      }),
    );
  });

  it("rejects one-line entries, two-sided lines and unknown accounts", () => {
    const base = { date: "2026-01-15", description: "Made-up", source: "manual" as const };
    expect(() =>
      journal.post(clientId, { ...base, lines: [{ accountId: accountIds[0], debitCents: 100, creditCents: 0 }] }),
    ).toThrow(/at least two lines/);
    expect(() =>
      journal.post(clientId, {
        ...base,
        lines: [
          { accountId: accountIds[0], debitCents: 100, creditCents: 100 },
          { accountId: accountIds[1], debitCents: 0, creditCents: 0 },
        ],
      }),
    ).toThrow(/either a debit or a credit/);
    expect(() =>
      journal.post(clientId, {
        ...base,
        lines: [
          { accountId: accountIds[0], debitCents: 100, creditCents: 0 },
          { accountId: 9999, debitCents: 0, creditCents: 100 },
        ],
      }),
    ).toThrow(/no longer exists/);
  });

  it("computes balances from posted lines and forgets deleted entries", () => {
    const entryId = journal.post(clientId, {
      date: "2026-01-15",
      description: "Rent",
      source: "manual",
      lines: bankEntryLines(120000, accountIds[0], accountIds[1]),
    });
    expect(journal.accountBalance(clientId, accountIds[0])).toBe(120000);
    expect(journal.accountBalance(clientId, accountIds[1])).toBe(-120000);

    journal.delete(clientId, entryId);
    expect(journal.accountBalance(clientId, accountIds[0])).toBe(0);
  });
});

describe("bankEntryLines (FR-16)", () => {
  it("always balances, and puts the tab's account on the side matching money in or out", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }).filter((n) => n !== 0), (amount) => {
        const [tab, coded] = bankEntryLines(amount, 1, 2);
        const { debitCents, creditCents } = entryTotals([tab, coded]);

        expect(debitCents).toBe(creditCents);
        expect(debitCents).toBe(Math.abs(amount));
        // The tab account's balance moves by exactly the bank amount.
        expect(tab.debitCents - tab.creditCents).toBe(amount);
        expect(coded.debitCents - coded.creditCents).toBe(-amount);
      }),
    );
  });
});
