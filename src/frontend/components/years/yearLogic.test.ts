import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { fiscalYearEndingIn } from "../../../common/fiscalYears";
import type { FiscalYearView, YearStatus } from "../../../common/years/yearSchemas";
import { defaultReversalDate, lockedYearFor } from "./yearLogic";

const yearsArb: fc.Arbitrary<FiscalYearView[]> = fc
  .array(fc.constantFrom<YearStatus>("open", "locked", "closed"), { minLength: 1, maxLength: 5 })
  .map((statuses) =>
    statuses.map((status, i) => {
      const year = fiscalYearEndingIn("2026-12-31", 2024 + i);
      const view: FiscalYearView = { label: year.label, from: year.from, to: year.to, status, closingEntryId: null, unpostedRows: 0, postedEntries: 0 };
      return view;
    }),
  );

const dateArb = fc
  .date({ min: new Date("2024-01-01T00:00:00Z"), max: new Date("2028-12-31T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

describe("year logic", () => {
  it("suggests a reversal date that is never in a locked year, unless no open year exists", () => {
    fc.assert(
      fc.property(yearsArb, dateArb, dateArb, (years, original, today) => {
        const suggested = defaultReversalDate(years, original, today);
        const anyOpenAfter = years.some((y) => y.status === "open" && y.to >= original);
        if (anyOpenAfter) expect(lockedYearFor(years, suggested)).toBeUndefined();
      }),
    );
  });

  it("finds the locked year a date falls in", () => {
    const years: FiscalYearView[] = [
      { label: "FY 2026", from: "2026-01-01", to: "2026-12-31", status: "locked", closingEntryId: null, unpostedRows: 0, postedEntries: 1 },
      { label: "FY 2027", from: "2027-01-01", to: "2027-12-31", status: "open", closingEntryId: null, unpostedRows: 0, postedEntries: 0 },
    ];
    expect(lockedYearFor(years, "2026-06-01")?.label).toBe("FY 2026");
    expect(lockedYearFor(years, "2027-06-01")).toBeUndefined();
    expect(defaultReversalDate(years, "2026-06-01", "2026-11-22")).toBe("2027-01-01");
    expect(defaultReversalDate(years, "2026-06-01", "2027-02-10")).toBe("2027-02-10");
  });
});
