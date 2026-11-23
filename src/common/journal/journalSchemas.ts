import { z } from "zod";

import { accountIdSchema } from "../accounts/accountSchemas";
import { clientIdSchema, type ClientId } from "../clients/clientSchemas";
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
  /** The entry this one reverses (FR-27), for reversals. */
  reversesEntryId: z.number().int().positive().nullable().optional(),
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

/** A posted line with its account, for display. */
export interface JournalLineView {
  readonly lineNumber: number;
  readonly accountId: number;
  readonly accountCode: string;
  readonly accountName: string;
  readonly debitCents: number;
  readonly creditCents: number;
  readonly memo: string | null;
}

/** A posted journal entry with its lines. */
export interface JournalEntryView {
  readonly id: number;
  readonly date: string;
  readonly description: string;
  readonly source: JournalSource;
  readonly stagedTransactionId: number | null;
  /** The entry this one reverses (FR-27), if it is a reversal. */
  readonly reversesEntryId: number | null;
  /** The reversal posted for this entry, if any. */
  readonly reversedByEntryId: number | null;
  readonly lines: readonly JournalLineView[];
}

/** A manual journal entry as entered on the journal entry screen (FR-24). */
export const manualEntryInputSchema = z.object({
  date: isoDateSchema,
  description: z.string().trim().min(1, "Enter a description.").max(500),
  lines: z.array(journalLineInputSchema).min(2, "An entry needs at least two lines."),
});

export type ManualEntryInput = z.infer<typeof manualEntryInputSchema>;

const entryIdSchema = z.number().int().positive();

export const listEntriesRequestSchema = z.object({ clientId: clientIdSchema });

export const createEntryRequestSchema = z.object({
  clientId: clientIdSchema,
  entry: manualEntryInputSchema,
});

export const updateEntryRequestSchema = z.object({
  clientId: clientIdSchema,
  entryId: entryIdSchema,
  entry: manualEntryInputSchema,
});

export const deleteEntryRequestSchema = z.object({
  clientId: clientIdSchema,
  entryId: entryIdSchema,
});

/**
 * The journal entry API the preload script exposes to the renderer as
 * `window.journalEntries`.
 */
export interface JournalEntriesApi {
  /** Manual, opening-balance and reversing entries, newest first. */
  list(clientId: ClientId): Promise<JournalEntryView[]>;
  create(clientId: ClientId, entry: ManualEntryInput): Promise<JournalEntryView>;
  update(clientId: ClientId, entryId: number, entry: ManualEntryInput): Promise<JournalEntryView>;
  delete(clientId: ClientId, entryId: number): Promise<void>;
}
