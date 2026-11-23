import { z } from "zod";

import { bankAccountIdSchema } from "../bankAccounts/bankAccountSchemas";
import { clientIdSchema, type ClientId } from "../clients/clientSchemas";

/** Where an import came from. */
export const IMPORT_SOURCE_KINDS = ["xlsx", "ods", "paste"] as const;
export type ImportSourceKind = (typeof IMPORT_SOURCE_KINDS)[number];

/** A row waiting in staging (FR-13). Amounts: positive = money in. */
export interface StagedTransaction {
  readonly id: number;
  readonly rowNumber: number;
  readonly date: string;
  readonly description: string;
  readonly amountCents: number;
  readonly status: "staged" | "posted";
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
  /** Removes an import whose rows haven't been posted. */
  removeBatch(clientId: ClientId, batchId: number): Promise<void>;
}
