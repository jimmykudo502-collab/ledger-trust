import { z } from "zod";

import { accountIdSchema } from "../accounts/accountSchemas";
import { isoDateSchema } from "../dates";
import { formatCents } from "../money";

/** Where a journal entry came from. */
export const JOURNAL_SOURCES = [
  "bank_import",
  "manual",
  "reversal",
  "year_end_close",
  "opening_balance",
] as const;
export const journalSourceSchema = z.enum(JOURNAL_SOURCES);
export type JournalSource = z.infer<typeof journalSourceSchema>;

const centsSchema = z.number().int().min(0).refine(Number.isSafeInteger, "Amount is too large.");

/** One debit or credit line. Exactly one of the two amounts is positive. */
export const journalLineInputSchema = z
  .object({
    accountId: accountIdSchema,
    debitCents: centsSchema,
    creditCents: centsSchema,
    memo: z.string().max(500).nullable().optional(),
  })
  .refine((line) => (line.debitCents > 0) !== (line.creditCents > 0), {
    message: "Each line needs either a debit or a credit, not both.",
  });

/** A journal entry to post. */
export const journalEntryInputSchema = z.object({
  date: isoDateSchema,
  description: z.string().max(500),
  source: journalSourceSchema,
  /** The staged bank row this entry came from (FR-22), for bank imports. */
  stagedTransactionId: z.number().int().positive().nullable().optional(),
  lines: z.array(journalLineInputSchema).min(2, "An entry needs at least two lines."),
});

export type JournalLineInput = z.infer<typeof journalLineInputSchema>;
export type JournalEntryInput = z.infer<typeof journalEntryInputSchema>;

/** Totals of an entry's lines, in cents. */
export interface EntryTotals {
  readonly debitCents: number;
  readonly creditCents: number;
}

/**
 * Adds up an entry's debits and credits.
 * @param lines The entry's lines.
 */
export const entryTotals = (
  lines: readonly Pick<JournalLineInput, "debitCents" | "creditCents">[],
): EntryTotals =>
  lines.reduce(
    (totals, line) => ({
      debitCents: totals.debitCents + line.debitCents,
      creditCents: totals.creditCents + line.creditCents,
    }),
    { debitCents: 0, creditCents: 0 },
  );

/**
 * Explains why an entry's lines don't balance (FR-21, FR-24), or returns
 * null when total debits equal total credits.
 * @param lines The entry's lines.
 */
export const balanceProblem = (
  lines: readonly Pick<JournalLineInput, "debitCents" | "creditCents">[],
): string | null => {
  const { debitCents, creditCents } = entryTotals(lines);
  if (debitCents === creditCents) {
    return null;
  }
  return `Debits (${formatCents(debitCents)}) must equal credits (${formatCents(creditCents)}).`;
};
