import * as fc from "fast-check";
import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { StagedRowInput } from "../../common/imports/importSchemas";
import { flagDuplicates } from "../import/duplicates";
import { SpreadsheetReader } from "../import/SpreadsheetReader";
import { SqliteBankAccountRepository } from "../repositories/BankAccountRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { SqliteStagingRepository } from "../repositories/StagingRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { BankAccountService } from "./BankAccountService";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { ImportService } from "./ImportService";
import { StagingService } from "./StagingService";

let workspace: TempClientWorkspace;
let imports: ImportService;
let staging: StagingService;
let clientId: string;
let bankAccountId: number;

const MADE_UP_STATEMENT = [
  ["Made-up Bank — Chequing statement"],
  ["Date", "Description", "Withdrawals", "Deposits", "Balance"],
  ["01/05/2026", "COFFEE SHOP", 4.5, null, 995.5],
  ["01/15/2026", "E-TRANSFER RENT UNIT 2", null, 1200, 2195.5],
  ["01/20/2026", "HYDRO", 85.12, null, 2110.38],
  ["01/21/2026", "BAD ROW", "n/a", null, 2110.38],
];

const xlsxBytes = (rows: unknown[][]): Uint8Array => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Statement");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};

beforeEach(() => {
  workspace = new TempClientWorkspace();
  const chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(workspace.pool.get(id)));
  const bankAccounts = new BankAccountService(
    (id) => new SqliteBankAccountRepository(workspace.pool.get(id)),
    chart,
  );
  const stagingFor = (id: string) => new SqliteStagingRepository(workspace.pool.get(id));
  imports = new ImportService(new SpreadsheetReader(), bankAccounts, stagingFor, { suggester: () => () => null }, { autoMatch: () => 0 });
  staging = new StagingService(stagingFor, bankAccounts);
  clientId = new ClientService(workspace.clients, [chart]).create({
    name: "Made-up Rentals",
    fiscalYearEnd: "2026-12-31",
  }).id;
  bankAccountId = bankAccounts.create(clientId, {
    name: "Chequing",
    kind: "bank",
    ledger: { mode: "new", code: "1000" },
  }).id;
});

afterEach(() => {
  workspace.dispose();
});

const openStatement = () => {
  const source = imports.openFile("made-up-statement.xlsx", xlsxBytes(MADE_UP_STATEMENT));
  const ref = { clientId, bankAccountId, token: source.token, sheetIndex: 0 };
  return { source, ref, mapping: imports.analyze(ref).suggestedMapping };
};

describe("ImportService", () => {
  it("opens a file, suggests a mapping and previews every row", () => {
    const { source, ref, mapping } = openStatement();

    expect(source).toMatchObject({ name: "made-up-statement.xlsx", sheets: [{ name: "Statement", rowCount: 6 }] });
    expect(mapping).toMatchObject({
      headerRow: 1,
      dateColumn: 0,
      descriptionColumn: 1,
      amount: { kind: "split", moneyOutColumn: 2, moneyInColumn: 3 },
    });
    expect(imports.preview(ref, mapping)).toEqual([
      { rowNumber: 3, date: "2026-01-05", description: "COFFEE SHOP", amountCents: -450, problem: null, duplicate: false },
      { rowNumber: 4, date: "2026-01-15", description: "E-TRANSFER RENT UNIT 2", amountCents: 120000, problem: null, duplicate: false },
      { rowNumber: 5, date: "2026-01-20", description: "HYDRO", amountCents: -8512, problem: null, duplicate: false },
      { rowNumber: 6, date: "2026-01-21", description: "BAD ROW", amountCents: null, problem: 'Money out "n/a" isn\'t a number.', duplicate: false },
    ]);
  });

  it("stages good rows except excluded ones, linked to their source rows (FR-13, FR-22)", () => {
    const { ref, mapping } = openStatement();

    expect(imports.stage(ref, mapping, [5])).toMatchObject({ stagedCount: 2 });

    const [batch] = staging.list(clientId, bankAccountId);
    expect(batch).toMatchObject({ sourceKind: "xlsx", sourceName: "made-up-statement.xlsx" });
    expect(batch.rows.map(({ rowNumber, amountCents, status }) => ({ rowNumber, amountCents, status }))).toEqual([
      { rowNumber: 3, amountCents: -450, status: "staged" },
      { rowNumber: 4, amountCents: 120000, status: "staged" },
    ]);
    expect(() => imports.preview(ref, mapping)).toThrow(/expired/);
  });

  it("warns about rows already imported into the same tab (FR-14)", () => {
    const first = openStatement();
    imports.stage(first.ref, first.mapping, []);

    const second = openStatement();
    const preview = imports.preview(second.ref, second.mapping);
    expect(preview.filter((row) => row.problem === null).every((row) => row.duplicate)).toBe(true);
  });

  it("reads pasted rows", () => {
    const source = imports.openPaste("Date\tDescription\tAmount\n2026-02-01\tInterest\t1.25\n2026-02-02\tFee\t-3.00");
    const ref = { clientId, bankAccountId, token: source.token, sheetIndex: 0 };
    const { suggestedMapping } = imports.analyze(ref);

    imports.stage(ref, suggestedMapping, []);
    const [batch] = staging.list(clientId, bankAccountId);
    expect(batch.sourceKind).toBe("paste");
    expect(batch.rows.map((row) => row.amountCents)).toEqual([125, -300]);
  });

  it("refuses an import with nothing to stage, and unsupported files", () => {
    const { ref, mapping } = openStatement();
    expect(() => imports.stage(ref, mapping, [3, 4, 5])).toThrow(/no rows to import/);
    expect(() => imports.openFile("statement.csv", new Uint8Array([1]))).toThrow(/\.xlsx/);
  });

  it("removes an unposted import, but not one with posted rows", () => {
    const { ref, mapping } = openStatement();
    const { batchId } = imports.stage(ref, mapping, []);
    const again = openStatement();
    const second = imports.stage(again.ref, again.mapping, []);

    workspace.pool.get(clientId).prepare("UPDATE staged_transactions SET status = 'posted' WHERE import_batch_id = ? AND row_number = 3").run(second.batchId);
    expect(() => staging.removeBatch(clientId, second.batchId)).toThrow(/1 row has already been posted/);

    staging.removeBatch(clientId, batchId);
    expect(staging.list(clientId, bankAccountId).map((batch) => batch.id)).toEqual([second.batchId]);
  });
});

describe("flagDuplicates", () => {
  const rowArb: fc.Arbitrary<StagedRowInput> = fc.record({
    date: fc.constantFrom("2026-01-05", "2026-01-06"),
    description: fc.constantFrom("Coffee", "COFFEE ", "Rent"),
    amountCents: fc.constantFrom(-450, 120000),
  });

  it("flags at most as many matches as already exist, one-to-one", () => {
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 15 }), fc.array(rowArb, { maxLength: 15 }), (incoming, existing) => {
        const flags = flagDuplicates(incoming, existing);
        expect(flags).toHaveLength(incoming.length);
        expect(flags.filter(Boolean).length).toBeLessThanOrEqual(existing.length);
        // Re-importing the exact same rows flags every one of them.
        expect(flagDuplicates(existing, existing).every(Boolean)).toBe(true);
        // Nothing is flagged against an empty tab.
        expect(flagDuplicates(incoming, []).some(Boolean)).toBe(false);
      }),
    );
  });

  it("lets genuine repeats within a statement through", () => {
    const coffee = { date: "2026-01-05", description: "Coffee", amountCents: -450 };
    expect(flagDuplicates([coffee, { ...coffee, description: " coffee" }, null], [coffee])).toEqual([true, false, false]);
  });
});
