import { z } from "zod";

import { accountInputSchema } from "../accounts/accountSchemas";
import { clientIdSchema, type ClientId } from "../clients/clientSchemas";
import { fsLineCodeSchema, fsLineInputSchema } from "../fsMaps/fsMapSchemas";

/** A template account, with the map numbers of its FS lines if it has them. */
export const templateAccountSchema = accountInputSchema.extend({
  internalFsCode: fsLineCodeSchema.optional(),
  externalFsCode: fsLineCodeSchema.optional(),
});

/**
 * The master chart of accounts template (FR-4, FR-35): accounts that can be
 * copied into any client, plus (since version 2) the internal and external
 * FS map lines and each account's map numbers. System accounts are not
 * included, since every client gets those automatically.
 */
export const accountTemplateSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  savedAt: z.string(),
  accounts: z.array(templateAccountSchema),
  fsLines: z
    .object({
      internal: z.array(fsLineInputSchema),
      external: z.array(fsLineInputSchema),
    })
    .optional(),
});

/** Summary of the saved master template, shown next to the template buttons. */
export interface AccountTemplateInfo {
  readonly accountCount: number;
  /** FS lines on both maps. */
  readonly fsLineCount: number;
  readonly savedAt: string;
}

/** Outcome of importing the master template into a client. */
export interface TemplateImportResult {
  /** Accounts copied into the client. */
  readonly added: number;
  /** Template accounts skipped because the client already uses their code. */
  readonly skipped: number;
  /** FS lines copied into the client (lines whose number is already used are skipped). */
  readonly fsLinesAdded: number;
  /** Accounts given an FS line they didn't have yet. */
  readonly fsMappingsAdded: number;
}

/** IPC request naming the client to save from or import into. */
export const templateClientRequestSchema = z.object({ clientId: clientIdSchema });

export type AccountTemplate = z.infer<typeof accountTemplateSchema>;

/**
 * The master-template API the preload script exposes to the renderer as
 * `window.accountTemplates`.
 */
export interface AccountTemplatesApi {
  /** The saved template's summary, or `null` if none has been saved. */
  info(): Promise<AccountTemplateInfo | null>;
  /** Replaces the master template with a client's (non-system) accounts. */
  saveFromClient(clientId: ClientId): Promise<AccountTemplateInfo>;
  /** Copies the master template's accounts into a client. */
  importIntoClient(clientId: ClientId): Promise<TemplateImportResult>;
}
