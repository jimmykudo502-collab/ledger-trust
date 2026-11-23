import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isIsoDate } from "./dates";
import { addDays, fiscalYearContaining, fiscalYearEndingIn } from "./fiscalYears";

const dateArb = fc
  .date({ min: new Date("1990-01-01T00:00:00Z"), max: new Date("2090-12-31T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

describe("fiscal years", () => {
  it("puts every date in exactly one fiscal year, and years tile without gaps", () => {
    fc.assert(
      fc.property(dateArb, dateArb, (fiscalYearEnd, date) => {
        const year = fiscalYearContaining(fiscalYearEnd, date);
        expect(year.from <= date && date <= year.to).toBe(true);
        expect(isIsoDate(year.from) && isIsoDate(year.to)).toBe(true);
        // The next year starts the day after this one ends.
        expect(fiscalYearEndingIn(fiscalYearEnd, year.endYear + 1).from).toBe(addDays(year.to, 1));
        expect(fiscalYearEndingIn(fiscalYearEnd, year.endYear - 1).to).toBe(addDays(year.from, -1));
      }),
    );
  });

  it("handles calendar, mid-year and February 29 year-ends", () => {
    expect(fiscalYearEndingIn("2026-12-31", 2026)).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "FY 2026", endYear: 2026 });
    expect(fiscalYearEndingIn("2026-03-31", 2026)).toMatchObject({ from: "2025-04-01", to: "2026-03-31" });
    expect(fiscalYearEndingIn("2028-02-29", 2027)).toMatchObject({ from: "2026-03-01", to: "2027-02-28" });
    expect(fiscalYearEndingIn("2028-02-29", 2028)).toMatchObject({ from: "2027-03-01", to: "2028-02-29" });
    expect(fiscalYearContaining("2026-06-30", "2026-07-01").label).toBe("FY 2027");
  });
});
