import { z } from "zod";

import { formatLongDate, isoDateSchema } from "../dates";

/** A client's identifier: a UUID, which also names its database file. */
export const clientIdSchema = z.uuid();

/** A client's display name. */
export const clientNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a client name.")
  .max(200, "Client names can be at most 200 characters.");

/**
 * The last day of the client's current fiscal year as `YYYY-MM-DD` (FR-3).
 * Later fiscal years end on the same month and day.
 */
export const fiscalYearEndSchema = isoDateSchema;

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

/** IPC request: rename a client. */
export const renameClientRequestSchema = z.object({
  clientId: clientIdSchema,
  name: clientNameSchema,
});

/** IPC request: change a client's fiscal year-end. */
export const setFiscalYearEndRequestSchema = z.object({
  clientId: clientIdSchema,
  fiscalYearEnd: fiscalYearEndSchema,
});

/** IPC request: archive or unarchive a client. */
export const setArchivedRequestSchema = z.object({
  clientId: clientIdSchema,
  archived: z.boolean(),
});

export type ClientId = z.infer<typeof clientIdSchema>;
export type FiscalYearEnd = z.infer<typeof fiscalYearEndSchema>;
export type CreateClientInput = z.infer<typeof createClientInputSchema>;
export type ClientSummary = z.infer<typeof clientSummarySchema>;

/**
 * Formats a fiscal year-end for display, e.g. "December 31, 2026".
 * @param fiscalYearEnd The year-end to format.
 */
export const formatFiscalYearEnd = (fiscalYearEnd: FiscalYearEnd): string =>
  formatLongDate(fiscalYearEnd);

/**
 * The client-list API the preload script exposes to the renderer as
 * `window.clients`.
 */
export interface ClientsApi {
  list(): Promise<ClientSummary[]>;
  create(input: CreateClientInput): Promise<ClientSummary>;
  rename(clientId: ClientId, name: string): Promise<ClientSummary>;
  setFiscalYearEnd(
    clientId: ClientId,
    fiscalYearEnd: FiscalYearEnd,
  ): Promise<ClientSummary>;
  setArchived(clientId: ClientId, archived: boolean): Promise<ClientSummary>;
}
