/**
 * Fiscal year arithmetic. A client's fiscal year-end is stored as the full
 * date its current year ends (e.g. 2026-12-31); every year ends on that
 * month and day, with February 29 falling back to February 28.
 */

/** A date range, both ends inclusive, as `YYYY-MM-DD`. */
export interface DateRange {
  readonly from: string;
  readonly to: string;
}

/** One fiscal year. `label` is "FY 2026" for a year ending in 2026. */
export interface FiscalYear extends DateRange {
  readonly label: string;
  readonly endYear: number;
}

const pad = (value: number) => String(value).padStart(2, "0");

const toIso = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const parse = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

/**
 * Moves an ISO date by a number of days.
 * @param iso The date.
 * @param days Days to add (negative to go back).
 */
export const addDays = (iso: string, days: number): string => {
  const date = parse(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
};

/**
 * The fiscal year that ends in a given calendar year.
 * @param fiscalYearEnd The client's stored year-end date.
 * @param endYear The calendar year the fiscal year ends in.
 */
export const fiscalYearEndingIn = (fiscalYearEnd: string, endYear: number): FiscalYear => {
  const [, month, day] = fiscalYearEnd.split("-").map(Number);
  const endIn = (year: number) => {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${pad(month)}-${pad(Math.min(day, lastDay))}`;
  };
  return {
    from: addDays(endIn(endYear - 1), 1),
    to: endIn(endYear),
    label: `FY ${endYear}`,
    endYear,
  };
};

/**
 * The fiscal year a date falls in.
 * @param fiscalYearEnd The client's stored year-end date.
 * @param date Any `YYYY-MM-DD` date.
 */
export const fiscalYearContaining = (fiscalYearEnd: string, date: string): FiscalYear => {
  const year = Number(date.slice(0, 4));
  const thisYear = fiscalYearEndingIn(fiscalYearEnd, year);
  return date <= thisYear.to ? (date >= thisYear.from ? thisYear : fiscalYearEndingIn(fiscalYearEnd, year - 1)) : fiscalYearEndingIn(fiscalYearEnd, year + 1);
};

/**
 * Today's date in the computer's own time zone, as `YYYY-MM-DD`.
 */
export const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
