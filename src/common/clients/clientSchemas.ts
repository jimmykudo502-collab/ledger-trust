import { z } from "zod";

/** Longest month length for each month, January first. February allows 29. */
const MAX_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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

/** A client's identifier: a UUID, which also names its database file. */
export const clientIdSchema = z.uuid();

/** A client's display name. */
export const clientNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a client name.")
  .max(200, "Client names can be at most 200 characters.");

/**
 * A client's fiscal year-end as a month and day (FR-3). February 29 is
 * allowed and means the last day of February in non-leap years.
 */
export const fiscalYearEndSchema = z
  .object({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  })
  .refine(({ month, day }) => day <= MAX_DAYS_IN_MONTH[month - 1], {
    message: "That day doesn't exist in the chosen month.",
  });

/** Everything needed to create a client. */
export const createClientInputSchema = z.object({
  name: clientNameSchema,
  fiscalYearEnd: fiscalYearEndSchema,
});

/** A client as shown in the client list. */
export const clientSummarySchema = z.object({
  id: clientIdSchema,
  name: z.string(),
  fiscalYearEnd: fiscalYearEndSchema,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ClientId = z.infer<typeof clientIdSchema>;
export type FiscalYearEnd = z.infer<typeof fiscalYearEndSchema>;
export type CreateClientInput = z.infer<typeof createClientInputSchema>;
export type ClientSummary = z.infer<typeof clientSummarySchema>;

/**
 * The number of days a month can have, used to build day pickers.
 * @param month Month number, 1 to 12.
 * @returns The maximum day for that month (29 for February).
 */
export const maxDayInMonth = (month: number): number =>
  MAX_DAYS_IN_MONTH[month - 1];

/**
 * The English name of a month.
 * @param month Month number, 1 to 12.
 */
export const monthName = (month: number): string => MONTH_NAMES[month - 1];

/**
 * Formats a fiscal year-end for display, e.g. "December 31".
 * @param fiscalYearEnd The year-end to format.
 */
export const formatFiscalYearEnd = ({ month, day }: FiscalYearEnd): string =>
  `${monthName(month)} ${day}`;
