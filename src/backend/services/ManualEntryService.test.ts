import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { entryTotals, type JournalLineInput } from "../../common/journal/journalSchemas";
import { SqliteJournalRepository } from "../repositories/JournalRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { JournalService } from "./JournalService";
import { ManualEntryService } from "./ManualEntryService";

let workspace: TempClientWorkspace;
let journal: JournalService;
let entries: ManualEntryService;
let clientId: string;
let ids: number[];

beforeEach(() => {
  workspace = new TempClientWorkspace();
  const chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(workspace.pool.get(id)));
  journal = new JournalService((id) => new SqliteJournalRepository(workspace.pool.get(id)), chart);
  entries = new ManualEntryService(journal);
  clientId = new ClientService(workspace.clients, [chart]).create({ name: "Made-up Rentals", fiscalYearEnd: "2026-12-31" }).id;
  ids = [
    chart.create(clientId, { code: "1000", name: "Chequing", type: "asset" }).id,
    chart.create(clientId, { code: "1500", name: "Building", type: "asset" }).id,
    chart.create(clientId, { code: "2500", name: "Mortgage", type: "liability" }).id,
    chart.create(clientId, { code: "3000", name: "Owner equity", type: "equity" }).id,
  ];
});

afterEach(() => {
  workspace.dispose();
});

/** Generates balanced lines: random debits, then credits that add up the same. */
const balancedLinesArb: fc.Arbitrary<JournalLineInput[]> = fc
  .tuple(
    fc.array(fc.tuple(fc.nat(3), fc.integer({ min: 1, max: 1_000_000 })), { minLength: 1, maxLength: 4 }),
    fc.nat(3),
  )
  .map(([debits, creditPick]) => {
    const total = debits.reduce((sum, [, cents]) => sum + cents, 0);
    return [
      ...debits.map(([pick, cents]) => ({ accountId: ids[pick], debitCents: cents, creditCents: 0 })),
      { accountId: ids[creditPick], debitCents: 0, creditCents: total },
    ];
  });

describe("ManualEntryService (FR-24, FR-25)", () => {
  it("posts any balanced entry and reads back exactly what was entered", () => {
    fc.assert(
      fc.property(balancedLinesArb, (lines) => {
        const created = entries.create(clientId, { date: "2026-01-01", description: "Opening balances", lines });
        expect(created.source).toBe("manual");
        expect(created.lines.map(({ accountId, debitCents, creditCents }) => ({ accountId, debitCents, creditCents }))).toEqual(lines);
        expect(entryTotals(created.lines).debitCents).toBe(entryTotals(created.lines).creditCents);
      }),
      { numRuns: 30 },
    );
  });

  it("refuses an entry whose debits and credits differ", () => {
    expect(() =>
      entries.create(clientId, {
        date: "2026-01-01",
        description: "Typo",
        lines: [
          { accountId: ids[1], debitCents: 30000000, creditCents: 0 },
          { accountId: ids[2], debitCents: 0, creditCents: 29000000 },
        ],
      }),
    ).toThrow("This entry doesn't balance. Debits (300,000.00) must equal credits (290,000.00).");
    expect(entries.list(clientId)).toEqual([]);
  });

  it("edits and deletes manual entries, keeping the ledger balanced", () => {
    const created = entries.create(clientId, {
      date: "2026-01-01",
      description: "Buy building",
      lines: [
        { accountId: ids[1], debitCents: 30000000, creditCents: 0, memo: "Made-up purchase" },
        { accountId: ids[2], debitCents: 0, creditCents: 24000000 },
        { accountId: ids[3], debitCents: 0, creditCents: 6000000 },
      ],
    });
    expect(created.lines[0].memo).toBe("Made-up purchase");

    const updated = entries.update(clientId, created.id, {
      date: "2026-01-02",
      description: "Buy building (corrected)",
      lines: [
        { accountId: ids[1], debitCents: 31000000, creditCents: 0 },
        { accountId: ids[2], debitCents: 0, creditCents: 25000000 },
        { accountId: ids[3], debitCents: 0, creditCents: 6000000 },
      ],
    });
    expect(updated).toMatchObject({ id: created.id, date: "2026-01-02", description: "Buy building (corrected)" });
    expect(journal.accountBalance(clientId, ids[1])).toBe(31000000);

    entries.delete(clientId, created.id);
    expect(entries.list(clientId)).toEqual([]);
    expect(journal.accountBalance(clientId, ids[1])).toBe(0);
  });

  it("won't edit entries that came from somewhere else", () => {
    const bankEntry = journal.post(clientId, {
      date: "2026-01-05",
      description: "Bank row",
      source: "opening_balance",
      lines: [
        { accountId: ids[0], debitCents: 100, creditCents: 0 },
        { accountId: ids[3], debitCents: 0, creditCents: 100 },
      ],
    });
    expect(() => entries.delete(clientId, bankEntry)).toThrow(/Only manual entries/);
  });
});
