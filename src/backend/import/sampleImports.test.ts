import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { detectMapping } from "./columnDetection";
import { parseRows } from "./rowParsing";
import { SpreadsheetReader } from "./SpreadsheetReader";

/** The made-up statements in docs/sample-imports, used for manual testing. */
const SAMPLES = path.resolve(__dirname, "../../../docs/sample-imports");
const reader = new SpreadsheetReader();

const net = (amounts: (number | null)[]) => amounts.reduce((sum, cents) => sum + (cents ?? 0), 0);

describe("sample imports", () => {
  it("reads the chequing .xlsx: title rows, real dates, withdrawals/deposits", () => {
    const [sheet] = reader.readFile(fs.readFileSync(path.join(SAMPLES, "made-up-chequing-jan-2026.xlsx")));
    const { mapping } = detectMapping(sheet.rows, "bank");
    const rows = parseRows(sheet.rows, mapping);

    expect(mapping).toMatchObject({ headerRow: 3, amount: { kind: "split", moneyOutColumn: 2, moneyInColumn: 3 } });
    expect(rows.every((row) => row.problem === null)).toBe(true);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ rowNumber: 5, date: "2026-01-02", description: "OPENING DEPOSIT", amountCents: 500000 });
    // Closing balance 3,788.73 = sum of every row.
    expect(net(rows.map((row) => row.amountCents))).toBe(378873);
  });

  it("reads the Visa .ods: charges positive become money out", () => {
    const [sheet] = reader.readFile(fs.readFileSync(path.join(SAMPLES, "made-up-visa-jan-2026.ods")));
    const { mapping } = detectMapping(sheet.rows, "credit_card");
    const rows = parseRows(sheet.rows, mapping);

    expect(mapping.amount).toEqual({ kind: "signed", column: 2, positiveIsMoneyIn: false });
    expect(rows.map((row) => [row.date, row.amountCents])).toEqual([
      ["2026-01-04", -6120],
      ["2026-01-09", -3845],
      ["2026-01-14", -15410],
      ["2026-01-21", -12640],
      ["2026-01-28", 38015],
    ]);
  });

  it("reads the Q1 rental write-up: Date, Description, Amount", () => {
    const [sheet] = reader.readFile(fs.readFileSync(path.join(SAMPLES, "made-up-rental-chequing-q1-2026.xlsx")));
    const { mapping } = detectMapping(sheet.rows, "bank");
    const rows = parseRows(sheet.rows, mapping);

    expect(mapping).toMatchObject({
      headerRow: 0,
      dateColumn: 0,
      descriptionColumn: 1,
      amount: { kind: "signed", column: 2, positiveIsMoneyIn: true },
    });
    expect(rows).toHaveLength(44);
    expect(rows.every((row) => row.problem === null)).toBe(true);
    expect(rows[0]).toMatchObject({ date: "2026-01-01", amountCents: 145000 });
    expect(net(rows.map((row) => row.amountCents))).toBe(-83122);
  });

  it("reads the Q1 savings and Visa write-ups that pair with the chequing sample", () => {
    const read = (file: string, kind: "bank" | "credit_card") => {
      const [sheet] = reader.readFile(fs.readFileSync(path.join(SAMPLES, file)));
      const rows = parseRows(sheet.rows, detectMapping(sheet.rows, kind).mapping);
      expect(rows.every((row) => row.problem === null)).toBe(true);
      return rows;
    };
    const savings = read("made-up-rental-savings-q1-2026.xlsx", "bank");
    const visa = read("made-up-rental-visa-q1-2026.xlsx", "credit_card");

    expect(savings.filter((row) => row.description.startsWith("TRANSFER")).map((row) => row.amountCents)).toEqual([50000, 50000, 50000]);
    // Card payments are money into the card's account.
    expect(visa.filter((row) => row.description.startsWith("PAYMENT")).map((row) => row.amountCents)).toEqual([27555, 31110, 34665]);
  });

  it("reads the pasted savings rows with day-first dates", () => {
    const [sheet] = reader.readText(fs.readFileSync(path.join(SAMPLES, "made-up-savings-paste.txt"), "utf8"));
    const { mapping, dateOrderAmbiguous } = detectMapping(sheet.rows, "bank");

    expect(mapping.dateOrder).toBe("DMY");
    expect(dateOrderAmbiguous).toBe(false);
    expect(parseRows(sheet.rows, mapping).map((row) => [row.date, row.description, row.amountCents])).toEqual([
      ["2026-01-15", "TRANSFER FROM CHEQUING", 100000],
      ["2026-01-31", "INTEREST", 187],
    ]);
  });
});
