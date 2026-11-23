import { addDays, fiscalYearContaining, type DateRange } from "../../../common/fiscalYears";

/** Quick date ranges offered above the reports. */
export type RangePreset = "thisFiscalYear" | "lastFiscalYear" | "yearToDate" | "thisMonth" | "lastMonth";

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  thisFiscalYear: "This fiscal year",
  lastFiscalYear: "Last fiscal year",
  yearToDate: "Fiscal year to date",
  thisMonth: "This month",
  lastMonth: "Last month",
};

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

/**
 * The dates for a preset.
 * @param preset Which preset.
 * @param fiscalYearEnd The client's stored year-end date.
 * @param today Today's date.
 */
export const presetRange = (preset: RangePreset, fiscalYearEnd: string, today: string): DateRange => {
  const current = fiscalYearContaining(fiscalYearEnd, today);
  switch (preset) {
    case "thisFiscalYear":
      return { from: current.from, to: current.to };
    case "lastFiscalYear": {
      const last = fiscalYearContaining(fiscalYearEnd, addDays(current.from, -1));
      return { from: last.from, to: last.to };
    }
    case "yearToDate":
      return { from: current.from, to: today };
    case "thisMonth": {
      const start = monthStart(today);
      return { from: start, to: addDays(monthStart(addDays(start, 32)), -1) };
    }
    case "lastMonth": {
      const end = addDays(monthStart(today), -1);
      return { from: monthStart(end), to: end };
    }
  }
};
