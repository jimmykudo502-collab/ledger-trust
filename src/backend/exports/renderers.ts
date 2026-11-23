import * as XLSX from "xlsx";

import { formatCents, formatDrCr, formatStatement } from "../../common/money";
import type { DocCell, ReportDocument, RowStyle } from "./reportDocuments";

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cellText = (cell: DocCell): string => {
  if (cell === null) return "";
  if ("text" in cell) return cell.text;
  return cell.drCr ? formatDrCr(cell.cents) : formatStatement(cell.cents);
};

const STYLE_CLASS: Record<RowStyle, string> = {
  normal: "",
  section: "section",
  subtotal: "subtotal",
  total: "total",
  subtle: "subtle",
};

/**
 * Renders a report document as a self-contained, printable HTML page, used
 * for PDF export (FR-32). All text is escaped.
 * @param doc The report document.
 */
export const renderReportHtml = (doc: ReportDocument): string => {
  const sections = doc.sections
    .map((section) => {
      const head = section.columns
        .map((column) => `<th class="${column.money ? "money" : ""}">${escapeHtml(column.label)}</th>`)
        .join("");
      const body = section.rows
        .map(
          (row) =>
            `<tr class="${STYLE_CLASS[row.style]}">${row.cells
              .map((cell, i) => `<td class="${section.columns[i]?.money ? "money" : ""}">${escapeHtml(cellText(cell))}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      const heading = section.heading ? `<h3>${escapeHtml(section.heading)}</h3>` : "";
      return `<section>${heading}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
    })
    .join("");
  const empty = doc.sections.length === 0 ? `<p class="empty">Nothing posted in this period.</p>` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(`${doc.clientName} - ${doc.title}`)}</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10pt; color: #111; }
  header { text-align: center; margin-bottom: 18pt; }
  header h1 { font-size: 15pt; margin: 0; }
  header h2 { font-size: 12pt; margin: 4pt 0 0; font-weight: 600; }
  header p { margin: 4pt 0 0; color: #444; }
  h3 { font-size: 10.5pt; margin: 14pt 0 4pt; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; color: #555; border-bottom: 1px solid #999; padding: 3pt 4pt; }
  td { padding: 2.5pt 4pt; border-bottom: 0.5pt solid #e3e3e3; }
  .money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.section td { font-weight: 700; padding-top: 9pt; border-bottom: 1px solid #999; }
  tr.subtotal td { font-weight: 600; border-top: 1px solid #999; }
  tr.total td { font-weight: 700; border-top: 1.5px solid #111; border-bottom: 3px double #111; }
  tr.subtle td { color: #555; font-style: italic; }
  .empty { text-align: center; color: #555; }
</style></head>
<body><header><h1>${escapeHtml(doc.clientName)}</h1><h2>${escapeHtml(doc.title)}</h2><p>${escapeHtml(doc.period)}</p></header>
${sections}${empty}
</body></html>`;
};

/**
 * Renders a report document as an Excel workbook (FR-32). Amounts are
 * written as numbers with a two-decimal format so they add up in Excel.
 * @param doc The report document.
 * @returns The .xlsx file's bytes.
 */
export const renderReportWorkbook = (doc: ReportDocument): Uint8Array => {
  const rows: (string | number | null)[][] = [[doc.clientName], [doc.title], [doc.period], []];
  const moneyCells: [number, number][] = [];
  for (const section of doc.sections) {
    if (section.heading) rows.push([section.heading]);
    rows.push(section.columns.map((column) => column.label));
    for (const docRow of section.rows) {
      const r = rows.length;
      rows.push(
        docRow.cells.map((cell, c) => {
          if (cell === null) return null;
          if ("text" in cell) return cell.text;
          moneyCells.push([r, c]);
          // Dollars at the export edge; cents stay integers everywhere else.
          return Number(formatCents(cell.cents).replace(/,/g, ""));
        }),
      );
    }
    rows.push([]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (const [r, c] of moneyCells) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (cell) cell.z = "#,##0.00;(#,##0.00)";
  }
  const width = Math.max(1, ...doc.sections.map((section) => section.columns.length));
  sheet["!cols"] = Array.from({ length: width }, (_, i) => ({ wch: i === 1 ? 40 : 14 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, doc.title.slice(0, 31));
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};
