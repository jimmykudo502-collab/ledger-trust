import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { presetRange, RANGE_PRESET_LABELS, type RangePreset } from "./reportRangeLogic";

const dateArb = fc
  .date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2090-12-31T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));
const presets = Object.keys(RANGE_PRESET_LABELS) as RangePreset[];

describe("report date presets", () => {
  it("always gives a valid range, and current-period presets include today", () => {
    fc.assert(
      fc.property(fc.constantFrom(...presets), dateArb, dateArb, (preset, fiscalYearEnd, today) => {
        const range = presetRange(preset, fiscalYearEnd, today);
        expect(range.from <= range.to).toBe(true);
        if (preset !== "lastFiscalYear" && preset !== "lastMonth") {
          expect(range.from <= today && today <= range.to).toBe(true);
        } else {
          expect(range.to < today).toBe(true);
        }
      }),
    );
  });

  it("matches a calendar-year client on a known day", () => {
    expect(presetRange("thisFiscalYear", "2026-12-31", "2026-11-22")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetRange("lastFiscalYear", "2026-12-31", "2026-11-22")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(presetRange("thisMonth", "2026-12-31", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("lastMonth", "2026-12-31", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});
