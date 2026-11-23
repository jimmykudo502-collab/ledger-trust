import { z } from "zod";

import { clientIdSchema, type ClientId } from "../clients/clientSchemas";
import { isoDateSchema } from "../dates";

/** Where a fiscal year stands (FR-26 to FR-28). */
export type YearStatus = "open" | "locked" | "closed";

/** One fiscal year on the year-end screen. */
export interface FiscalYearView {
  readonly label: string;
  readonly from: string;
  readonly to: string;
  readonly status: YearStatus;
  /** The closing entry posted when the year was closed, if any. */
  readonly closingEntryId: number | null;
  /** Bank rows dated in this year that haven't been posted yet. */
  readonly unpostedRows: number;
  /** Posted journal entries dated in this year. */
  readonly postedEntries: number;
}

/** Everything the year-end screen shows. */
export interface YearEndOverview {
  readonly years: readonly FiscalYearView[];
  /** The retained earnings account used last time, if any. */
  readonly retainedEarningsAccountId: number | null;
}

const yearRequest = z.object({ clientId: clientIdSchema, yearEnd: isoDateSchema });

export const overviewRequestSchema = z.object({ clientId: clientIdSchema });
export const lockRequestSchema = yearRequest;
export const unlockRequestSchema = yearRequest;
export const closeRequestSchema = yearRequest.extend({
  retainedEarningsAccountId: z.number().int().positive(),
});
export const reverseRequestSchema = z.object({
  clientId: clientIdSchema,
  entryId: z.number().int().positive(),
  date: isoDateSchema,
});

/**
 * The year-end API the preload script exposes to the renderer as
 * `window.yearEnd`.
 */
export interface YearEndApi {
  overview(clientId: ClientId): Promise<YearEndOverview>;
  /** Locks a fiscal year so its entries can't change (FR-27). */
  lock(clientId: ClientId, yearEnd: string): Promise<void>;
  /** Unlocks the most recently locked year, reopening it if it was closed. */
  unlock(clientId: ClientId, yearEnd: string): Promise<void>;
  /** Closes revenue and expenses into retained earnings and locks the year (FR-28). */
  close(clientId: ClientId, yearEnd: string, retainedEarningsAccountId: number): Promise<void>;
  /** Posts a reversing entry for a posted entry, dated in an open period (FR-27). */
  reverse(clientId: ClientId, entryId: number, date: string): Promise<number>;
}
