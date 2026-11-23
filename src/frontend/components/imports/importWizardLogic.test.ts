import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { PreviewRow } from "../../../common/imports/importSchemas";
import { columnLetter, defaultExclusions, summarizePreview } from "./importWizardLogic";

const rowArb: fc.Arbitrary<PreviewRow> = fc
  .record({
    rowNumber: fc.integer({ min: 1, max: 10_000 }),
    amountCents: fc.integer({ min: -100_000, max: 100_000 }).filter((n) => n !== 0),
    problem: fc.option(fc.constant("Bad"), { nil: null }),
    duplicate: fc.boolean(),
  })
  .map((row) => ({ ...row, date: "2026-01-05", description: "Made-up" }));

const rowsArb = fc.uniqueArray(rowArb, { selector: (row) => row.rowNumber, maxLength: 30 });

describe("import wizard logic", () => {
  it("names columns like a spreadsheet, each name unique", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
    const names = Array.from({ length: 800 }, (_, i) => columnLetter(i));
    expect(new Set(names).size).toBe(names.length);
  });

  it("accounts for every row exactly once, and totals only imported rows", () => {
    fc.assert(
      fc.property(rowsArb, fc.array(fc.integer({ min: 1, max: 10_000 })), (rows, excludedList) => {
        const excluded = new Set(excludedList);
        const summary = summarizePreview(rows, excluded);
        expect(summary.importing + summary.leftOut + summary.unreadable).toBe(rows.length);

        const imported = rows.filter((row) => row.problem === null && !excluded.has(row.rowNumber));
        const net = imported.reduce((sum, row) => sum + row.amountCents, 0);
        expect(summary.moneyInCents - summary.moneyOutCents).toBe(net);
        expect(summary.moneyInCents).toBeGreaterThanOrEqual(0);
        expect(summary.moneyOutCents).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("leaves out exactly the duplicate rows by default", () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const excluded = defaultExclusions(rows);
        expect(rows.every((row) => excluded.has(row.rowNumber) === row.duplicate)).toBe(true);
      }),
    );
  });
});
