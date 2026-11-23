import { clientIdSchema } from "../../common/clients/clientSchemas";
import type { ExportFormat } from "../../common/reports/exportSchemas";
import type { ReportKind, ReportOptions } from "../../common/reports/reportSchemas";
import { UserFacingError } from "../errors";
import {
  balanceSheetDocument,
  generalLedgerDocument,
  incomeStatementDocument,
  trialBalanceDocument,
  type ReportDocument,
} from "../exports/reportDocuments";
import { renderReportHtml, renderReportWorkbook } from "../exports/renderers";
import type { ClientRepository } from "../repositories/ClientRepository";
import type { ReportService } from "./ReportService";

/** Turns an HTML page into PDF bytes (Electron's print-to-PDF in the app). */
export interface PdfPrinter {
  print(html: string): Promise<Uint8Array>;
}

/** An export ready to save. */
export interface ExportFile {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/**
 * Exports any report to PDF or Excel (FR-32). Each export shows the client
 * name, the report title and the period.
 */
export class ExportService {
  /**
   * @param reports Computes the reports.
   * @param clients Looks up the client's name.
   * @param pdf Prints HTML to PDF.
   */
  public constructor(
    private readonly reports: ReportService,
    private readonly clients: ClientRepository,
    private readonly pdf: PdfPrinter,
  ) {}

  /**
   * Builds the export file for a report.
   * @param clientId The client.
   * @param kind Which report.
   * @param options Dates and options, as on screen.
   * @param format PDF or Excel.
   */
  public async export(clientId: string, kind: ReportKind, options: ReportOptions, format: ExportFormat): Promise<ExportFile> {
    const doc = this.document(clientId, kind, options);
    const bytes = format === "pdf" ? await this.pdf.print(renderReportHtml(doc)) : renderReportWorkbook(doc);
    return { fileName: suggestedFileName(doc, options.to, format), bytes };
  }

  /**
   * The report laid out for export.
   * @param clientId The client.
   * @param kind Which report.
   * @param options Dates and options.
   */
  public document(clientId: string, kind: ReportKind, options: ReportOptions): ReportDocument {
    const client = this.clients.find(clientIdSchema.parse(clientId));
    if (!client) throw new UserFacingError("That client no longer exists.");
    switch (kind) {
      case "trialBalance":
        return trialBalanceDocument(client.name, this.reports.trialBalance(clientId, options));
      case "generalLedger":
        return generalLedgerDocument(client.name, this.reports.generalLedger(clientId, options));
      case "balanceSheet":
        return balanceSheetDocument(client.name, this.reports.balanceSheet(clientId, options));
      case "incomeStatement":
        return incomeStatementDocument(client.name, this.reports.incomeStatement(clientId, options));
    }
  }
}

/**
 * A safe default file name, e.g. "Maple Rentals - Trial Balance - 2026-12-31.pdf".
 * @param doc The report document.
 * @param to The report's end date.
 * @param format The file format.
 */
export const suggestedFileName = (doc: ReportDocument, to: string, format: ExportFormat): string => {
  const unsafe = '<>:"/\\|?*';
  const safe = [...`${doc.clientName} - ${doc.title} - ${to}`]
    .map((char) => (unsafe.includes(char) || char.charCodeAt(0) < 32 ? "-" : char))
    .join("");
  return `${safe.slice(0, 150)}.${format}`;
};
