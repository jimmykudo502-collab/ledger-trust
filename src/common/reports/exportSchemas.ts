import { z } from "zod";

import { clientIdSchema, type ClientId } from "../clients/clientSchemas";
import { REPORT_KINDS, reportOptionsSchema, type ReportKind, type ReportOptions } from "./reportSchemas";

/** File formats a report can be exported to (FR-32). */
export const EXPORT_FORMATS = ["pdf", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const exportRequestSchema = z.object({
  clientId: clientIdSchema,
  kind: z.enum(REPORT_KINDS),
  options: reportOptionsSchema,
  format: z.enum(EXPORT_FORMATS),
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
  exportReport(clientId: ClientId, kind: ReportKind, options: ReportOptions, format: ExportFormat): Promise<ExportResult | null>;
  /** Shows a file this app exported in the file explorer. */
  showInFolder(path: string): Promise<void>;
}
