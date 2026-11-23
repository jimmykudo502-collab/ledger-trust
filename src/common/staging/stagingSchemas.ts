import { z } from "zod";

import { bankAccountIdSchema } from "../bankAccounts/bankAccountSchemas";
import { clientIdSchema, type ClientId } from "../clients/clientSchemas";

/** Where an import came from. */
export const IMPORT_SOURCE_KINDS = ["xlsx", "ods", "paste"] as const;
export type ImportSourceKind = (typeof IMPORT_SOURCE_KINDS)[number];

export type StagedStatus = "staged" | "posted";

/** A row waiting in staging (FR-13). Amounts: positive = money in. */
export interface StagedTransaction {
  readonly id: number;
  /** The import batch the row came from. */
  readonly batchId: number;
  /** Spreadsheet row number in the source file (FR-22). */
  readonly rowNumber: number;
  readonly date: string;
  readonly description: string;
  readonly amountCents: number;
  /** The account the row is coded to (FR-15), or null if not coded yet. */
  readonly offsetAccountId: number | null;
  readonly status: StagedStatus;
}

/** One import into a tab, with its rows. */
export interface ImportBatch {
  readonly id: number;
  readonly sourceKind: ImportSourceKind;
  readonly sourceName: string | null;
  readonly createdAt: string;
  readonly rows: readonly StagedTransaction[];
}

export const listStagedRequestSchema = z.object({
  clientId: clientIdSchema,
  bankAccountId: bankAccountIdSchema,
});

const rowIdsSchema = z.array(z.number().int().positive()).min(1).max(100_000);

export const setCodeRequestSchema = z.object({
  clientId: clientIdSchema,
  bankAccountId: bankAccountIdSchema,
  rowIds: rowIdsSchema,
  /** The account code typed in the grid, or null to clear it. */
  code: z.string().trim().min(1).max(20).nullable(),
});

export const postRequestSchema = z.object({
  clientId: clientIdSchema,
  bankAccountId: bankAccountIdSchema,
});

export const unpostRequestSchema = z.object({
  clientId: clientIdSchema,
  rowId: z.number().int().positive(),
});

/** Result of posting a tab's coded rows. */
export interface PostResult {
  readonly postedCount: number;
}

export const removeBatchRequestSchema = z.object({
  clientId: clientIdSchema,
  batchId: z.number().int().positive(),
});

/**
 * The staging API the preload script exposes to the renderer as
 * `window.staging`.
 */
export interface StagingApi {
  /** A tab's imports, newest first. */
  list(clientId: ClientId, bankAccountId: number): Promise<ImportBatch[]>;
  /** A tab's rows across all imports, by date. */
  rows(clientId: ClientId, bankAccountId: number): Promise<StagedTransaction[]>;
  /** Removes an import whose rows haven't been posted. */
  removeBatch(clientId: ClientId, batchId: number): Promise<void>;
  /** Codes rows to the account with this code, or clears the code (null). */
  setCode(clientId: ClientId, bankAccountId: number, rowIds: number[], code: string | null): Promise<void>;
  /** Posts every coded, unposted row in the tab (FR-21). */
  post(clientId: ClientId, bankAccountId: number): Promise<PostResult>;
  /** Takes a posted row back out of the journal so it can be corrected (FR-26). */
  unpost(clientId: ClientId, rowId: number): Promise<void>;
}
