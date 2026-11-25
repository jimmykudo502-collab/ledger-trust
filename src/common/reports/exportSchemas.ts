import { z } from "zod";

import { clientIdSchema, type ClientId } from "../clients/clientSchemas";
import { statementLayoutSchema } from "./mappedStatementSchemas";
import { REPORT_KINDS, reportOptionsSchema, type ReportKind, type ReportOptions } from "./reportSchemas";

/** File formats a report can be exported to (FR-32). */
export const EXPORT_FORMATS = ["pdf", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * How the balance sheet and income statement are laid out in an export
 * (FR-36). Other reports ignore it.
 */
export const exportPresentationSchema = z.object({
  layout: statementLayoutSchema.default("accounts"),
  /** With an FS map layout: list the accounts under each line. */
  showAccounts: z.boolean().default(false),
});
export type ExportPresentation = z.input<typeof exportPresentationSchema>;

export const exportRequestSchema = z.object({
  clientId: clientIdSchema,
  kind: z.enum(REPORT_KINDS),
  options: reportOptionsSchema,
  format: z.enum(EXPORT_FORMATS),
  presentation: exportPresentationSchema.default({ layout: "accounts", showAccounts: false }),
});

export const showExportRequestSchema = z.object({ path: z.string().min(1).max(1000) });

/** Where an export was saved. */
export interface ExportResult {
  readonly path: string;
}

/**
 * The export API the preload script exposes to the renderer as
 * `window.exports`.
 */
export interface ExportsApi {
  /** Asks where to save, then writes the report. Resolves to null if cancelled. */
  exportReport(
    clientId: ClientId,
    kind: ReportKind,
    options: ReportOptions,
    format: ExportFormat,
    presentation?: ExportPresentation,
  ): Promise<ExportResult | null>;
  /** Shows a file this app exported in the file explorer. */
  showInFolder(path: string): Promise<void>;
}
