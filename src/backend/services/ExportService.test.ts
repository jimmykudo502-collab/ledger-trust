import * as fc from "fast-check";
import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REPORT_KINDS } from "../../common/reports/reportSchemas";
import type { ReportDocument } from "../exports/reportDocuments";
import { renderReportHtml } from "../exports/renderers";
import { SqliteFsMapRepository } from "../repositories/FsMapRepository";
import { SqliteJournalRepository } from "../repositories/JournalRepository";
import { SqliteReportRepository } from "../repositories/ReportRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { ExportService, suggestedFileName } from "./ExportService";
import { FsMapService } from "./FsMapService";
import { JournalService } from "./JournalService";
import { MappedStatementService } from "./MappedStatementService";
import { ReportService } from "./ReportService";

let workspace: TempClientWorkspace;
let exportsService: ExportService;
let reports: ReportService;
let clientId: string;
let fsMaps: FsMapService;
const printed: string[] = [];

beforeEach(() => {
  workspace = new TempClientWorkspace();
  const pool = workspace.pool;
  const chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(pool.get(id)));
  const journal = new JournalService((id) => new SqliteJournalRepository(pool.get(id)), chart);
  reports = new ReportService((id) => new SqliteReportRepository(pool.get(id)));
  const fsMapsFor = (id: string) => new SqliteFsMapRepository(pool.get(id));
  fsMaps = new FsMapService(fsMapsFor, chart, workspace.inTransaction);
  printed.length = 0;
  exportsService = new ExportService(reports, workspace.clients, {
    print: async (html) => {
      printed.push(html);
      return new TextEncoder().encode("%PDF-fake");
    },
  }, new MappedStatementService((id) => new SqliteReportRepository(pool.get(id)), fsMapsFor));
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

  it("exports statements laid out by the internal or external FS map (FR-36)", async () => {
    const accounts = new Map(new ChartOfAccountsService((id) => new SqliteAccountRepository(workspace.pool.get(id))).list(clientId).map((a) => [a.code, a.id]));
    const cash = fsMaps.createLine(clientId, "external", { code: "100", name: "Cash", section: "current_assets" });
    const revenue = fsMaps.createLine(clientId, "external", { code: "400", name: "Revenue", section: "revenue" });
    const expenses = fsMaps.createLine(clientId, "external", { code: "600", name: "Operating expenses", section: "operating_expenses" });
    fsMaps.assign(clientId, "external", [accounts.get("1000")], cash.id);
    fsMaps.assign(clientId, "external", [accounts.get("4000")], revenue.id);
    fsMaps.assign(clientId, "external", [accounts.get("5100")], expenses.id);

    const external = exportsService.document(clientId, "incomeStatement", options, { layout: "external" });
    expect(external.title).toBe("Income Statement");
    const lines = external.sections[0].rows.map((r) => r.cells.map((c) => (c === null ? null : "text" in c ? c.text : c.cents)));
    expect(lines).toContainEqual(["400", "Revenue", 145000]);
    expect(lines).toContainEqual([null, "Net income", 123623]);
    expect(lines.some((cells) => String(cells[1]).includes("Repairs"))).toBe(false);

    const detailed = exportsService.document(clientId, "incomeStatement", options, { layout: "external", showAccounts: true });
    expect(detailed.sections[0].rows.some((r) => r.cells.some((c) => c && "text" in c && c.text.includes("5100 Repairs")))).toBe(true);

    // Nothing is mapped on the internal map yet: everything lands in the catch-all lines, totals unchanged.
    const tb = exportsService.document(clientId, "fsTrialBalance", options, { map: "external" });
    expect(tb.title).toBe("Trial Balance - External FS");
    const tbRows = tb.sections[0].rows.map((r) => r.cells.map((c) => (c === null ? null : "text" in c ? c.text : c.cents)));
    expect(tbRows).toContainEqual(["400", "Revenue", null, null, 145000]);
    expect(tbRows.some((cells) => String(cells[1]).includes("5100 Repairs"))).toBe(true);
    const tbTotals = tbRows.find((cells) => cells[0] === "Totals");
    expect(tbTotals?.[2]).toBe(tbTotals?.[3]);

    const internal = exportsService.document(clientId, "balanceSheet", options, { layout: "internal" });
    expect(internal.title).toBe("Balance Sheet (internal)");
    const pdf = await exportsService.export(clientId, "balanceSheet", options, "pdf", { layout: "internal" });
    expect(pdf.fileName).toBe("Made-up -Rentals- & Co - Balance Sheet (internal) - 2026-12-31.pdf");
    expect(printed.at(-1)).toContain("Accounts not mapped");
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
