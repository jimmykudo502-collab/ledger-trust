import { isIsoDate } from "../../common/dates";
import type { DateOrder } from "../../common/imports/importSchemas";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Excel serial numbers this far apart cover 1954 to 2119. */
const MIN_SERIAL = 20000;
const MAX_SERIAL = 80000;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

const pad = (value: number) => String(value).padStart(2, "0");

const toIso = (year: number, month: number, day: number): string | null => {
  const iso = `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
  return isIsoDate(iso) ? iso : null;
};

const fullYear = (text: string): number => {
  const year = Number(text);
  return text.length <= 2 ? 2000 + year : year;
};

/**
 * Turns a date cell from a bank export into `YYYY-MM-DD`.
 *
 * Understands ISO dates (optionally with a time), numeric dates such as
 * 01/05/2026 in the given order, dates with month names such as
 * "Jan 5, 2026" or "05-Jan-26", and Excel serial date numbers.
 * @param value The cell value.
 * @param order How to read all-numeric dates like 01/05/2026.
 * @returns The ISO date, or `null` if the value isn't a date.
 */
export const parseImportDate = (
  value: string | number | null,
  order: DateOrder,
): string | null => {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < MIN_SERIAL || value > MAX_SERIAL) {
      return null;
    }
    return new Date(EXCEL_EPOCH_MS + value * DAY_MS).toISOString().slice(0, 10);
  }

  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
  if (iso) {
    return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const tokens = text.split(/[\s/.,-]+/).filter(Boolean);
  if (tokens.length !== 3) {
    return null;
  }

  const monthIndex = tokens.findIndex((token) => /^[a-z]{3,}$/i.test(token));
  if (monthIndex >= 0) {
    const month = MONTHS.indexOf(tokens[monthIndex].slice(0, 3).toLowerCase()) + 1;
    const numbers = tokens.filter((_, i) => i !== monthIndex);
    if (month === 0 || !numbers.every((token) => /^\d{1,4}$/.test(token))) {
      return null;
    }
    const yearIndex = numbers.findIndex((token) => token.length === 4);
    const [dayText, yearText] =
      yearIndex === 0 ? [numbers[1], numbers[0]] : [numbers[0], numbers[1]];
    return toIso(fullYear(yearText), month, Number(dayText));
  }

  if (!tokens.every((token) => /^\d{1,4}$/.test(token))) {
    return null;
  }
  if (tokens[0].length === 4) {
    return toIso(Number(tokens[0]), Number(tokens[1]), Number(tokens[2]));
  }
  if (tokens[2].length !== 4 && tokens[2].length !== 2) {
    return null;
  }
  const [first, second] = [Number(tokens[0]), Number(tokens[1])];
  const year = fullYear(tokens[2]);
  return order === "DMY" ? toIso(year, second, first) : toIso(year, first, second);
};

/**
 * Guesses how all-numeric dates in a column are written.
 * @param values Text values from the date column.
 * @returns The order, and whether the data couldn't tell MDY from DMY
 *   (every day and month were 12 or less).
 */
export const detectDateOrder = (
  values: readonly (string | number | null)[],
): { order: DateOrder; ambiguous: boolean } => {
  let firstOver12 = false;
  let secondOver12 = false;
  let sawNumericDate = false;
  for (const value of values) {
    if (typeof value !== "string") continue;
    const match = /^\s*(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4})\s*$/.exec(value);
    if (!match) continue;
    if (match[1].length === 4) return { order: "YMD", ambiguous: false };
    sawNumericDate = true;
    if (Number(match[1]) > 12) firstOver12 = true;
    if (Number(match[2]) > 12) secondOver12 = true;
  }
  if (firstOver12 && !secondOver12) return { order: "DMY", ambiguous: false };
  if (secondOver12 && !firstOver12) return { order: "MDY", ambiguous: false };
  return { order: "MDY", ambiguous: sawNumericDate && !secondOver12 };
};
