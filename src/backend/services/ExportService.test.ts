import * as fc from "fast-check";
import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REPORT_KINDS } from "../../common/reports/reportSchemas";
import type { ReportDocument } from "../exports/reportDocuments";
import { renderReportHtml } from "../exports/renderers";
import { SqliteJournalRepository } from "../repositories/JournalRepository";
import { SqliteReportRepository } from "../repositories/ReportRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { ExportService, suggestedFileName } from "./ExportService";
import { JournalService } from "./JournalService";
import { ReportService } from "./ReportService";

let workspace: TempClientWorkspace;
let exportsService: ExportService;
let reports: ReportService;
let clientId: string;
const printed: string[] = [];

beforeEach(() => {
  workspace = new TempClientWorkspace();
  const pool = workspace.pool;
  const chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(pool.get(id)));
  const journal = new JournalService((id) => new SqliteJournalRepository(pool.get(id)), chart);
  reports = new ReportService((id) => new SqliteReportRepository(pool.get(id)));
  printed.length = 0;
  exportsService = new ExportService(reports, workspace.clients, {
    print: async (html) => {
      printed.push(html);
      return new TextEncoder().encode("%PDF-fake");
    },
  });
  clientId = new ClientService(workspace.clients, [chart]).create({ name: "Made-up <Rentals> & Co", fiscalYearEnd: "2026-12-31" }).id;
  const cash = chart.create(clientId, { code: "1000", name: "Chequing", type: "asset" }).id;
  const rent = chart.create(clientId, { code: "4000", name: "Rent income", type: "revenue" }).id;
  const repairs = chart.create(clientId, { code: "5100", name: "Repairs", type: "expense" }).id;
  journal.post(clientId, { date: "2026-03-01", description: "Rent", source: "manual", lines: [
    { accountId: cash, debitCents: 145000, creditCents: 0 },
    { accountId: rent, debitCents: 0, creditCents: 145000 },
  ] });
  journal.post(clientId, { date: "2026-03-08", description: "Repairs", source: "manual", lines: [
    { accountId: repairs, debitCents: 21377, creditCents: 0 },
    { accountId: cash, debitCents: 0, creditCents: 21377 },
  ] });
});

afterEach(() => {
  workspace.dispose();
});

const options = { from: "2026-01-01", to: "2026-12-31" };

describe("ExportService (FR-32)", () => {
  it("shows the client name, report title and period on every export", async () => {
    for (const kind of REPORT_KINDS) {
      const doc = exportsService.document(clientId, kind, options);
      expect(doc.clientName).toBe("Made-up <Rentals> & Co");
      expect(doc.period).toBe(kind === "balanceSheet" ? "As at December 31, 2026" : "January 1, 2026 to December 31, 2026");

      const pdf = await exportsService.export(clientId, kind, options, "pdf");
      expect(pdf.fileName).toBe(`Made-up -Rentals- & Co - ${doc.title} - 2026-12-31.pdf`);
      const html = printed.at(-1);
      expect(html).toContain("Made-up &lt;Rentals&gt; &amp; Co");
      expect(html).toContain(`<h2>${doc.title}</h2>`);
      expect(html).toContain(doc.period);

      const xlsx = await exportsService.export(clientId, kind, options, "xlsx");
      const sheet = XLSX.read(xlsx.bytes, { type: "buffer" }).Sheets[doc.title];
      expect(sheet.A1.v).toBe("Made-up <Rentals> & Co");
      expect(sheet.A2.v).toBe(doc.title);
      expect(sheet.A3.v).toBe(doc.period);
    }
  });

  it("writes amounts to Excel as numbers that match the report", async () => {
    const tb = reports.trialBalance(clientId, options);
    const xlsx = await exportsService.export(clientId, "trialBalance", options, "xlsx");
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(XLSX.read(xlsx.bytes, { type: "buffer" }).Sheets["Trial Balance"], { header: 1 });
    const totals = rows.find((row) => row[0] === "Totals");
    expect(totals.slice(4)).toEqual([
      tb.totals.debitCents / 100,
      tb.totals.creditCents / 100,
      tb.totals.closingDebitCents / 100,
      tb.totals.closingCreditCents / 100,
    ]);
    const income = XLSX.read((await exportsService.export(clientId, "incomeStatement", options, "xlsx")).bytes, { type: "buffer" });
    const incomeRows = XLSX.utils.sheet_to_json<(string | number)[]>(income.Sheets["Income Statement"], { header: 1 });
    expect(incomeRows.find((row) => row[1] === "Net income")?.[2]).toBe(1236.23);
  });

  it("escapes any text in the HTML and makes safe file names", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (name, title) => {
        const doc: ReportDocument = { clientName: name, title, period: "x", sections: [] };
        const html = renderReportHtml(doc);
        const body = html.slice(html.indexOf("<body>"));
        expect(body).not.toMatch(/<script/i);
        const fileName = suggestedFileName(doc, "2026-12-31", "pdf");
        expect(fileName).not.toMatch(/[<>:"/\\|?*]/);
        expect(fileName.endsWith(".pdf")).toBe(true);
      }),
    );
  });
});
