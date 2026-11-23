import * as fc from "fast-check";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import type { BankAccountKind } from "../../common/bankAccounts/bankAccountSchemas";
import type { Cell, ColumnMapping } from "../../common/imports/importSchemas";
import { formatCents } from "../../common/money";
import { detectMapping, findHeaderRow } from "./columnDetection";
import { parseRows } from "./rowParsing";
import { SpreadsheetReader } from "./SpreadsheetReader";

/** A made-up transaction. Positive = money into the account. */
interface Txn {
  date: string;
  description: string;
  amountCents: number;
}

const txnArb: fc.Arbitrary<Txn> = fc.record({
  date: fc
    .date({ min: new Date("2020-01-01T00:00:00Z"), max: new Date("2029-12-31T00:00:00Z"), noInvalidDate: true })
    .map((d) => d.toISOString().slice(0, 10)),
  description: fc.constantFrom(
    "COFFEE SHOP #12",
    "E-TRANSFER RENT UNIT 2",
    "HYDRO BILL PAYMENT",
    "Hardware store",
    "Insurance premium",
    "Interest",
  ),
  amountCents: fc.integer({ min: -500_000, max: 500_000 }).filter((n) => n !== 0),
});

type DateStyle = "iso" | "mdy" | "dmy" | "monthName";

const writeDate = (iso: string, style: DateStyle): string => {
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  switch (style) {
    case "iso":
      return iso;
    case "mdy":
      return `${m}/${d}/${y}`;
    case "dmy":
      return `${d}/${m}/${y}`;
    case "monthName":
      return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
  }
};

interface Layout {
  header: boolean;
  split: boolean;
  dateStyle: DateStyle;
  kind: BankAccountKind;
  numbersAsText: boolean;
  balanceColumn: boolean;
}

const layoutArb: fc.Arbitrary<Layout> = fc.record({
  header: fc.boolean(),
  split: fc.boolean(),
  dateStyle: fc.constantFrom<DateStyle>("iso", "mdy", "dmy", "monthName"),
  kind: fc.constantFrom<BankAccountKind>("bank", "credit_card"),
  numbersAsText: fc.boolean(),
  balanceColumn: fc.boolean(),
});

/** Writes transactions the way a bank export might lay them out. */
const buildSheet = (txns: Txn[], layout: Layout): Cell[][] => {
  const money = (cents: number): Cell => (layout.numbersAsText ? formatCents(cents) : cents / 100);
  const rows: Cell[][] = [];
  if (layout.header) {
    rows.push([
      "Date",
      "Description",
      ...(layout.split ? ["Withdrawals", "Deposits"] : ["Amount"]),
      ...(layout.balanceColumn ? ["Balance"] : []),
    ]);
  }
  let balance = 1_000_000;
  for (const txn of txns) {
    balance += txn.amountCents;
    // Credit card exports show charges (money out) as positive numbers.
    const signed = layout.kind === "credit_card" ? -txn.amountCents : txn.amountCents;
    rows.push([
      writeDate(txn.date, layout.dateStyle),
      txn.description,
      ...(layout.split
        ? [txn.amountCents < 0 ? money(-txn.amountCents) : null, txn.amountCents > 0 ? money(txn.amountCents) : null]
        : [money(signed)]),
      ...(layout.balanceColumn ? [money(balance)] : []),
    ]);
  }
  return rows;
};

/** Dates that would read differently month-first and day-first. */
const unambiguous = (txns: Txn[]) => txns.some((t) => Number(t.date.slice(8)) > 12);

describe("import parsing", () => {
  it("reads back exactly the transactions written, whatever the layout", () => {
    fc.assert(
      fc.property(fc.array(txnArb, { minLength: 1, maxLength: 30 }), layoutArb, (txns, layout) => {
        const rows = buildSheet(txns, layout);
        const mapping: ColumnMapping = {
          headerRow: layout.header ? 0 : null,
          dateColumn: 0,
          descriptionColumn: 1,
          amount: layout.split
            ? { kind: "split", moneyOutColumn: 2, moneyInColumn: 3 }
            : { kind: "signed", column: 2, positiveIsMoneyIn: layout.kind === "bank" },
          dateOrder: layout.dateStyle === "dmy" ? "DMY" : "MDY",
        };

        const parsed = parseRows(rows, mapping);

        expect(parsed.map((row) => row.problem)).toEqual(txns.map((): null => null));
        expect(parsed.map(({ date, description, amountCents }) => ({ date, description, amountCents }))).toEqual(txns);
        expect(parsed.map((row) => row.rowNumber)).toEqual(txns.map((_, i) => i + (layout.header ? 2 : 1)));
      }),
    );
  });

  it("auto-detects a mapping that reads the same transactions (FR-12)", () => {
    fc.assert(
      fc.property(
        fc.array(txnArb, { minLength: 3, maxLength: 30 }),
        layoutArb,
        (txns, layout) => {
          // Without headings, separate in/out columns can only be told apart
          // when the data shows it; and day-first dates need a telling day.
          fc.pre(layout.header || !layout.split || (txns.some((t) => t.amountCents > 0) && txns.some((t) => t.amountCents < 0)));
          fc.pre(layout.dateStyle !== "dmy" || unambiguous(txns));
          fc.pre(layout.header || !layout.balanceColumn);

          const rows = buildSheet(txns, layout);
          const { mapping } = detectMapping(rows, layout.kind);
          const parsed = parseRows(rows, mapping);

          expect(mapping.headerRow).toBe(layout.header ? 0 : null);
          expect(parsed.map(({ date, description, amountCents }) => ({ date, description, amountCents }))).toEqual(txns);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never mistakes text amounts with thousands separators for dates", () => {
    // Regression: "1,001.00" used to read as 1/001/00, hiding a deposits column.
    const rows: Cell[][] = [
      ["2020-01-01", "COFFEE SHOP #12", null, "1,001.00"],
      ["2020-01-01", "COFFEE SHOP #12", "0.01", null],
      ["2020-01-01", "COFFEE SHOP #12", null, "0.01"],
    ];
    const { mapping } = detectMapping(rows, "bank");
    expect(mapping.amount).toEqual({ kind: "split", moneyOutColumn: 2, moneyInColumn: 3 });
    expect(parseRows(rows, mapping).map((row) => row.amountCents)).toEqual([100100, -1, 1]);
  });

  it("reports rows it can't read, and skips blank and title rows", () => {
    const rows: Cell[][] = [
      ["Made-up Bank statement"],
      ["Date", "Description", "Amount"],
      ["2026-01-05", "Coffee", -4.5],
      [],
      ["Total", null, null],
      ["2026-01-06", "Rent", "abc"],
      ["not a date", "Oops", 10],
      ["2026-01-07", "Nothing", 0],
      [null, "Card fee", 2],
    ];
    const { mapping } = detectMapping(rows, "bank");
    expect(mapping.headerRow).toBe(1);

    expect(parseRows(rows, mapping).map(({ rowNumber, problem }) => ({ rowNumber, problem }))).toEqual([
      { rowNumber: 3, problem: null },
      { rowNumber: 5, problem: 'Date "Total" isn\'t a date.' },
      { rowNumber: 6, problem: 'Amount "abc" isn\'t a number.' },
      { rowNumber: 7, problem: 'Date "not a date" isn\'t a date.' },
      { rowNumber: 8, problem: "Amount is zero." },
      { rowNumber: 9, problem: "No date." },
    ]);
  });

  it("ignores constant account-number and sparse cheque-number columns", () => {
    const rows: Cell[][] = [
      ["Account Number", "Transaction Date", "Cheque Number", "Description 1", "CAD$"],
      [12345678, "1/5/2026", null, "COFFEE", -4.5],
      [12345678, "1/6/2026", 101, "CHEQUE", -250],
      [12345678, "1/20/2026", null, "DEPOSIT", 1200],
    ];
    const { mapping } = detectMapping(rows, "bank");
    expect(mapping).toMatchObject({
      headerRow: 0,
      dateColumn: 1,
      descriptionColumn: 3,
      amount: { kind: "signed", column: 4, positiveIsMoneyIn: true },
    });
  });

  it("uses Payments and Charges headings on credit card statements", () => {
    const rows: Cell[][] = [
      ["Posted Date", "Payee", "Charges", "Payments"],
      ["2026-01-05", "Hardware store", 80, null],
      ["2026-01-20", "PAYMENT THANK YOU", null, 80],
    ];
    const { mapping } = detectMapping(rows, "credit_card");
    expect(mapping.amount).toEqual({ kind: "split", moneyInColumn: 3, moneyOutColumn: 2 });
    expect(parseRows(rows, mapping).map((row) => row.amountCents)).toEqual([-8000, 8000]);
  });

  it("finds no heading row in a sheet of data", () => {
    expect(findHeaderRow([["2026-01-05", "Coffee", -4.5]])).toBeNull();
  });
});

describe("SpreadsheetReader", () => {
  const reader = new SpreadsheetReader();

  it("reads .xlsx and .ods files, turning date cells into ISO dates", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Date", "Description", "Amount"],
      [46027, "Coffee", -4.5],
      [46028.75, "Rent", 1200],
    ]);
    sheet.A2.z = "yyyy-mm-dd";
    sheet.A3.z = "m/d/yy h:mm";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Made-up");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), "Empty");

    for (const bookType of ["xlsx", "ods"] as const) {
      const bytes = XLSX.write(workbook, { type: "buffer", bookType });
      expect(reader.readFile(bytes)).toEqual([
        {
          name: "Made-up",
          rows: [
            ["Date", "Description", "Amount"],
            ["2026-01-05", "Coffee", -4.5],
            ["2026-01-06", "Rent", 1200],
          ],
        },
      ]);
    }
  });

  it("reads pasted tab- and comma-separated rows", () => {
    expect(reader.readText("Date\tDescription\tAmount\n2026-01-05\tCoffee, large\t-4.50\n")[0].rows).toEqual([
      ["Date", "Description", "Amount"],
      ["2026-01-05", "Coffee, large", "-4.50"],
    ]);
    expect(reader.readText('Date,Description,Amount\n2026-01-05,"Coffee, large",-4.50')[0].rows).toEqual([
      ["Date", "Description", "Amount"],
      ["2026-01-05", "Coffee, large", "-4.50"],
    ]);
  });

  it("explains a file that isn't a spreadsheet", () => {
    expect(() => reader.readFile(new Uint8Array([0, 159, 146, 150, 1, 2, 3]))).toThrow(/couldn't be read/);
  });
});
