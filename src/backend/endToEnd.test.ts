import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REPORT_KINDS } from "../common/reports/reportSchemas";
import { createBackend, type Backend } from "./createBackend";
import { DEMO_ENTRIES, DEMO_TABS } from "./demo/demoData";

/**
 * Step 10: the whole Phase 1 workflow, end to end, with made-up data only.
 * Uses the same wiring as the app (createBackend), with a fake PDF printer.
 */

let directory: string;
let backend: Backend;
const printed: string[] = [];

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-trust-e2e-"));
  printed.length = 0;
  backend = createBackend(directory, {
    print: async (html) => {
      printed.push(html);
      return new TextEncoder().encode("%PDF-made-up");
    },
  });
});

afterEach(() => {
  backend.dispose();
  fs.rmSync(directory, { recursive: true, force: true });
});

const Q1 = { from: "2026-01-01", to: "2026-03-31" };
const FY2026 = { from: "2026-01-01", to: "2026-12-31" };

/** Transfers and mortgage payments don't touch income; every other bank row does. */
const NOT_INCOME = /TRANSFER TO SAVINGS|TRANSFER FROM CHEQUING|PAYMENT - VISA|PAYMENT - THANK YOU|MORTGAGE/;

/** Reference net income computed straight from the made-up rows and entries. */
const expectedNetIncome = (): number => {
  const bank = DEMO_TABS.flatMap((tab) => tab.rows())
    .filter((row) => !NOT_INCOME.test(row.description))
    .reduce((sum, row) => sum + row.amountCents, 0);
  const adjustments = 238500 + 280000; // mortgage interest + depreciation
  return bank - adjustments;
};

describe("end to end with a made-up client (step 10)", () => {
  it("imports, codes, matches, posts, reports, closes, locks, reverses and exports", async () => {
    const client = backend.demo.create();
    const clientId = client.id;
    const tabs = backend.bankAccounts.list(clientId);
    expect(tabs.map((tab) => tab.name)).toEqual(["Chequing", "Savings", "Visa"]);

    // The rest of March is staged, all coded by rules or transfer matching (FR-18, FR-19).
    const allRows = tabs.flatMap((tab) => backend.coding.rows(clientId, tab.id));
    expect(allRows.every((row) => row.offsetAccountId !== null)).toBe(true);
    expect(allRows.filter((row) => row.status === "staged").every((row) => row.date > "2026-03-02")).toBe(true);
    expect(allRows.some((row) => row.status === "staged")).toBe(true);
    expect(backend.transfers.review(clientId)).toMatchObject({ postedBalanceCents: 0, suggestions: [], unmatched: [] });

    // Post everything left (FR-21) and the transfer control account nets to zero (FR-20).
    for (const tab of tabs) {
      if (backend.coding.rows(clientId, tab.id).some((row) => row.status === "staged")) backend.posting.post(clientId, tab.id);
    }
    const transfers = backend.transfers.review(clientId);
    expect(transfers.matched).toHaveLength(6);
    expect(transfers.postedBalanceCents).toBe(0);

    // Reports agree with each other and with the made-up data (FR-29 to FR-31).
    const tb = backend.reports.trialBalance(clientId, Q1);
    expect(tb.totals.closingDebitCents).toBe(tb.totals.closingCreditCents);
    const bs = backend.reports.balanceSheet(clientId, Q1);
    expect(bs.totalAssetsCents).toBe(bs.totalLiabilitiesCents + bs.totalEquityCents);
    const is = backend.reports.incomeStatement(clientId, Q1);
    expect(is.netIncomeCents).toBe(expectedNetIncome());
    expect(bs.currentEarningsCents).toBe(is.netIncomeCents);

    // Internal and external FS layouts show the same numbers, rolled up differently (FR-36).
    for (const map of ["internal", "external"] as const) {
      const mappedSheet = backend.mappedStatements.balanceSheet(clientId, Q1, map);
      expect(mappedSheet.unmappedAccountCount).toBe(0);
      expect(mappedSheet.totalAssetsCents).toBe(bs.totalAssetsCents);
      expect(mappedSheet.totalLiabilitiesCents).toBe(bs.totalLiabilitiesCents);
      expect(mappedSheet.totalEquityCents).toBe(bs.totalEquityCents);
      const mappedIncome = backend.mappedStatements.incomeStatement(clientId, Q1, map);
      expect(mappedIncome.unmappedAccountCount).toBe(0);
      expect(mappedIncome.netIncomeCents).toBe(is.netIncomeCents);
      // The trial balance by FS map shows the accounts behind each line (FR-37).
      const fsTb = backend.mappedStatements.trialBalance(clientId, Q1, map);
      expect(fsTb.unmappedAccountCount).toBe(0);
      expect(fsTb.totals.debitCents).toBe(fsTb.totals.creditCents);
      for (const section of mappedSheet.assets) {
        expect(fsTb.sections.find((s) => s.section === section.section)?.fsAmountCents ?? 0).toBe(section.totalCents);
      }
    }
    const external = backend.mappedStatements.incomeStatement(clientId, Q1, "external");
    expect(external.operatingExpenses.lines.map((line) => line.code)).toEqual(["600", "610", "690"]);

    const chequing = tabs.find((tab) => tab.name === "Chequing");
    const chequingRows = DEMO_TABS[0].rows();
    const opening = DEMO_ENTRIES[0].lines.find(([code]) => code === "1000")[1];
    const expectedChequing = opening + chequingRows.reduce((sum, row) => sum + row.amountCents, 0);
    const gl = backend.reports.generalLedger(clientId, { ...Q1, accountId: chequing.accountId });
    expect(gl.accounts[0].closingCents).toBe(expectedChequing);
    expect(backend.bankAccounts.require(clientId, chequing.id).ledgerBalanceCents).toBe(expectedChequing);
    expect(gl.accounts[0].lines).toHaveLength(chequingRows.length + 1);

    // Re-importing the matching sample file flags every row as already imported (FR-14).
    const sample = fs.readFileSync(path.resolve(__dirname, "../../docs/sample-imports/made-up-rental-chequing-q1-2026.xlsx"));
    const source = backend.imports.openFile("made-up-rental-chequing-q1-2026.xlsx", sample);
    const ref = { clientId, bankAccountId: chequing.id, token: source.token, sheetIndex: 0 };
    const preview = backend.imports.preview(ref, backend.imports.analyze(ref).suggestedMapping);
    expect(preview).toHaveLength(44);
    expect(preview.every((row) => row.duplicate && row.problem === null)).toBe(true);
    backend.imports.discard(source.token);

    // Year-end close (FR-28): revenue and expenses roll into retained earnings.
    const retained = backend.chartOfAccounts.findByCode(clientId, "3900");
    const netIncome = backend.reports.incomeStatement(clientId, FY2026).netIncomeCents;
    backend.fiscalYears.close(clientId, "2026-12-31", retained.id);
    expect(backend.reports.incomeStatement(clientId, FY2026).netIncomeCents).toBe(netIncome);
    const nextYear = backend.reports.trialBalance(clientId, { from: "2027-01-01", to: "2027-12-31" });
    expect(nextYear.rows.find((row) => row.accountId === retained.id)?.openingCents).toBe(-netIncome);
    expect(nextYear.rows.filter((row) => row.type === "revenue" || row.type === "expense").every((row) => row.openingCents === 0)).toBe(true);

    // The locked year can't change; corrections go through reversing entries (FR-27).
    const depreciation = backend.manualEntries.list(clientId).find((entry) => entry.description === "Q1 building depreciation");
    expect(() => backend.manualEntries.delete(clientId, depreciation.id)).toThrow(/which is locked/);
    const reversalId = backend.fiscalYears.reverse(clientId, depreciation.id, "2027-01-01");
    expect(backend.manualEntries.list(clientId).find((entry) => entry.id === reversalId)?.reversesEntryId).toBe(depreciation.id);
    const after = backend.reports.trialBalance(clientId, { from: "2027-01-01", to: "2027-12-31" });
    expect(after.totals.closingDebitCents).toBe(after.totals.closingCreditCents);

    // Every report exports to PDF and Excel with the client name, title and period (FR-32).
    const externalPdf = await backend.exports.export(clientId, "balanceSheet", FY2026, "pdf", { layout: "external" });
    expect(externalPdf.fileName).toContain("Balance Sheet - 2026-12-31");
    expect(printed.at(-1)).toContain("Property and equipment, net");
    for (const kind of REPORT_KINDS) {
      const pdf = await backend.exports.export(clientId, kind, FY2026, "pdf");
      expect(pdf.fileName.endsWith(".pdf")).toBe(true);
      expect(printed.at(-1)).toContain("Demo - Maple Street Rentals (made-up)");
      const xlsx = await backend.exports.export(clientId, kind, FY2026, "xlsx");
      const workbook = XLSX.read(xlsx.bytes, { type: "buffer" });
      expect(workbook.Sheets[workbook.SheetNames[0]].A1.v).toBe("Demo - Maple Street Rentals (made-up)");
    }

    // Unlocking the closed year removes its closing entry and reopens it.
    backend.fiscalYears.unlock(clientId, "2026-12-31");
    expect(backend.journal.accountBalance(clientId, retained.id)).toBe(0);
  }, 60_000);
});
