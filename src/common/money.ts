/**
 * Money helpers. The app stores money as integer cents; these functions are
 * the only place text or spreadsheet numbers turn into cents and back.
 */

const MONEY_PATTERN = /^(-)?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/;

/**
 * Parses a money amount as typed or exported by a bank, e.g. "1,234.56",
 * "-12.3", "(45.00)", "$ 1,000", "12.50-". Returns `null` for blank or
 * unreadable text and for amounts with more than two decimals.
 * @param text The text to parse.
 * @returns The amount in cents, or `null`.
 */
export const parseMoney = (text: string): number | null => {
  let value = text.trim().replace(/[$\s]|CAD|USD/gi, "");
  if (value === "") {
    return null;
  }
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.endsWith("-")) {
    negative = !negative;
    value = value.slice(0, -1);
  }
  if (value.startsWith("+")) {
    value = value.slice(1);
  }
  const match = MONEY_PATTERN.exec(value);
  if (!match || (match[2] === undefined && match[3] === undefined)) {
    return null;
  }
  if (match[1]) {
    negative = !negative;
  }
  const whole = Number((match[2] ?? "0").replace(/,/g, ""));
  const fraction = Number((match[3] ?? "0").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  if (!Number.isSafeInteger(cents)) {
    return null;
  }
  return negative && cents !== 0 ? -cents : cents;
};

/**
 * Converts a spreadsheet number such as 12.3 (which Excel may store as
 * 12.300000000000001) to cents.
 * @param value A finite number of dollars.
 * @returns The amount in cents, or `null` if it isn't a whole number of
 *   cents or is too large to hold exactly.
 */
export const centsFromNumber = (value: number): number | null => {
  if (!Number.isFinite(value)) {
    return null;
  }
  const cents = Number((value * 100).toPrecision(15));
  const rounded = Math.round(cents);
  if (Math.abs(cents - rounded) > 1e-6 || !Number.isSafeInteger(rounded)) {
    return null;
  }
  return rounded === 0 ? 0 : rounded;
};

/**
 * Formats cents for display with thousands separators, e.g. -123456 →
 * "-1,234.56".
 * @param cents An integer number of cents.
 */
export const formatCents = (cents: number): string => {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (absolute % 100).toString().padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
};

/**
 * Formats a debit-positive balance with its side, e.g. 1234 → "12.34 Dr",
 * -1234 → "12.34 Cr", 0 → "0.00".
 * @param cents Debit-positive cents.
 */
export const formatDrCr = (cents: number): string =>
  cents === 0 ? "0.00" : `${formatCents(Math.abs(cents))} ${cents > 0 ? "Dr" : "Cr"}`;

/**
 * Formats an amount the way financial statements do: negatives in
 * brackets, e.g. -1234 → "(12.34)".
 * @param cents The amount in cents.
 */
export const formatStatement = (cents: number): string =>
  cents < 0 ? `(${formatCents(-cents)})` : formatCents(cents);
