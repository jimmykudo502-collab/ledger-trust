import { z } from "zod";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Whether a string is a real calendar date written as `YYYY-MM-DD`.
 * @param value The string to check.
 */
export const isIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/** A calendar date as `YYYY-MM-DD`, the format used everywhere in the app. */
export const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: "Enter a valid date." });

/**
 * Formats a `YYYY-MM-DD` date for display, e.g. "December 31, 2026".
 * @param isoDate A valid ISO date.
 */
export const formatLongDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
};

/**
 * Formats a stored UTC timestamp (e.g. a `created_at` value) as a date in
 * the computer's own time zone, e.g. "November 22, 2026".
 * @param timestamp An ISO-8601 timestamp.
 */
export const formatLocalDate = (timestamp: string): string => {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return formatLongDate(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
};
