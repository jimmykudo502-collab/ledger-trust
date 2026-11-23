import type { FiscalYearView } from "../../../common/years/yearSchemas";

/**
 * The locked (or closed) year a date falls in, if any.
 * @param years The client's fiscal years.
 * @param date A `YYYY-MM-DD` date.
 */
export const lockedYearFor = (years: readonly FiscalYearView[], date: string): FiscalYearView | undefined =>
  years.find((year) => year.status !== "open" && year.from <= date && date <= year.to);

/**
 * A sensible date for a reversing entry: the first day of the earliest open
 * year after the original, or today if that is later and open.
 * @param years The client's fiscal years.
 * @param originalDate The reversed entry's date.
 * @param today Today's date.
 */
export const defaultReversalDate = (years: readonly FiscalYearView[], originalDate: string, today: string): string => {
  const open = years
    .filter((year) => year.status === "open" && year.to >= originalDate)
    .sort((a, b) => a.from.localeCompare(b.from));
  const first = open[0];
  if (!first) return today;
  if (today >= first.from && !lockedYearFor(years, today)) return today;
  return first.from > originalDate ? first.from : originalDate;
};
