import { z } from "zod";

import { clientIdSchema, type ClientId } from "../clients/clientSchemas";
import type { StagedStatus } from "../staging/stagingSchemas";

/** A bank row shown on the transfer review screen. */
export interface TransferRow {
  readonly rowId: number;
  readonly bankAccountId: number;
  readonly bankAccountName: string;
  readonly date: string;
  readonly description: string;
  /** Positive = money into that tab's account. */
  readonly amountCents: number;
  readonly status: StagedStatus;
}

/** Two rows treated as the two sides of one transfer. */
export interface TransferPairView {
  /** The confirmed match's id, or null for a suggestion. */
  readonly matchId: number | null;
  /** The side money left from. */
  readonly from: TransferRow;
  /** The side money arrived in. */
  readonly to: TransferRow;
  readonly daysApart: number;
}

/** Everything the transfer review screen shows (FR-20). */
export interface TransferReview {
  readonly controlAccount: { readonly id: number; readonly code: string; readonly name: string };
  /** Bank Transfer Control's balance from posted entries; should be zero. */
  readonly postedBalanceCents: number;
  /** Likely transfers not yet confirmed (FR-19). */
  readonly suggestions: readonly TransferPairView[];
  /** Rows coded to Bank Transfer Control that aren't part of a confirmed pair. */
  readonly unmatched: readonly TransferRow[];
  /** Confirmed transfers. */
  readonly matched: readonly TransferPairView[];
}

/** Result of matching transfers. */
export interface MatchResult {
  readonly matchedCount: number;
}

const rowIdSchema = z.number().int().positive();

export const reviewRequestSchema = z.object({ clientId: clientIdSchema });

export const matchRequestSchema = z.object({
  clientId: clientIdSchema,
  firstRowId: rowIdSchema,
  secondRowId: rowIdSchema,
});

export const unmatchRequestSchema = z.object({
  clientId: clientIdSchema,
  matchId: z.number().int().positive(),
});

export const notTransferRequestSchema = z.object({
  clientId: clientIdSchema,
  rowId: rowIdSchema,
});

/**
 * The transfers API the preload script exposes to the renderer as
 * `window.transfers`.
 */
export interface TransfersApi {
  review(clientId: ClientId): Promise<TransferReview>;
  /** Confirms two rows as one transfer and codes both to Bank Transfer Control. */
  match(clientId: ClientId, firstRowId: number, secondRowId: number): Promise<void>;
  /** Confirms every suggested pair. */
  matchAll(clientId: ClientId): Promise<MatchResult>;
  /** Undoes a confirmed pair; unposted rows go back to needing a code. */
  unmatch(clientId: ClientId, matchId: number): Promise<void>;
  /** Marks an unmatched row as not a transfer by clearing its code. */
  notTransfer(clientId: ClientId, rowId: number): Promise<void>;
}
