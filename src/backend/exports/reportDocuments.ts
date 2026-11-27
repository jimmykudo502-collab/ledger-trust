import { ACCOUNT_TYPE_LABELS } from "../../common/accounts/accountSchemas";
import { formatLongDate } from "../../common/dates";
import type { DateRange } from "../../common/fiscalYears";
import { FS_MAP_LABELS, FS_SECTION_INFO, type FsMap } from "../../common/fsMaps/fsMapSchemas";
import { balanceSheetBlocks, incomeStatementBlocks, type StatementBlock } from "../../common/reports/mappedStatementLayout";
import type { FsTrialBalance, MappedBalanceSheet, MappedIncomeStatement } from "../../common/reports/mappedStatementSchemas";
import {
  REPORT_TITLES,
  type BalanceSheet,
  type GeneralLedger,
  type IncomeStatement,
  type ReportKind,
  type StatementLine,
  type TrialBalance,
} from "../../common/reports/reportSchemas";

/** A cell: text, an amount in cents, or empty. */
export type DocCell = { readonly text: string } | { readonly cents: number; readonly drCr?: boolean } | null;

/** How a row is emphasised. */
export type RowStyle = "normal" | "section" | "subtotal" | "total" | "subtle";

export interface DocRow {
  readonly cells: readonly DocCell[];
  readonly style: RowStyle;
}

export interface DocColumn {
  readonly label: string;
  readonly money: boolean;
}

/** A table within a document, e.g. one general ledger account. */
export interface DocSection {
  readonly heading: string | null;
  readonly columns: readonly DocColumn[];
  readonly rows: readonly DocRow[];
}

/**
 * A report laid out for export (FR-32): every export shows the client name,
 * the report title and the period.
 */
export interface ReportDocument {
  readonly clientName: string;
  readonly title: string;
  readonly period: string;
  readonly sections: readonly DocSection[];
}

const text = (value: string): DocCell => ({ text: value });
const money = (cents: number, drCr = false): DocCell => ({ cents, drCr });
const row = (cells: DocCell[], style: RowStyle = "normal"): DocRow => ({ cells, style });
const col = (label: string, isMoney = false): DocColumn => ({ label, money: isMoney });

/**
 * The period line printed under a report's title.
 * @param kind Which report.
 * @param range Its dates.
 */
export const periodText = (kind: ReportKind, range: DateRange): string =>
  kind === "balanceSheet"
    ? `As at ${formatLongDate(range.to)}`
    : `${formatLongDate(range.from)} to ${formatLongDate(range.to)}`;

/** Trial balance as a document. */
export const trialBalanceDocument = (clientName: string, report: TrialBalance): ReportDocument => ({
  clientName,
  title: REPORT_TITLES.trialBalance,
  period: periodText("trialBalance", report.range),
  sections: [
    {
      heading: null,
      columns: [col("Code"), col("Account"), col("Type"), col("Opening", true), col("Debits", true), col("Credits", true), col("Debit balance", true), col("Credit balance", true)],
      rows: [
        ...report.rows.map((r) =>
          row([
            text(r.code),
            text(r.name),
            text(ACCOUNT_TYPE_LABELS[r.type]),
            r.openingCents === 0 ? null : money(r.openingCents, true),
            r.debitCents === 0 ? null : money(r.debitCents),
            r.creditCents === 0 ? null : money(r.creditCents),
            r.closingCents > 0 ? money(r.closingCents) : null,
            r.closingCents < 0 ? money(-r.closingCents) : null,
          ]),
        ),
        row(
          [text("Totals"), null, null, null, money(report.totals.debitCents), money(report.totals.creditCents), money(report.totals.closingDebitCents), money(report.totals.closingCreditCents)],
          "total",
        ),
      ],
    },
  ],
});

/**
 * The printed title of the trial balance by FS map, e.g. "Trial Balance -
 * External FS" (short enough for an Excel sheet name).
 * @param map Internal or external.
 */
export const fsTrialBalanceTitle = (map: FsMap): string => `Trial Balance - ${FS_MAP_LABELS[map]} FS`;

/**
 * Trial balance grouped by an FS map as a document (FR-37): each FS line with
 * its statement amount, the accounts that make it up with their debit or
 * credit balance, and section totals.
 * @param clientName The client's name.
 * @param report The trial balance by FS map.
 */
export const fsTrialBalanceDocument = (clientName: string, report: FsTrialBalance): ReportDocument => ({
  clientName,
  title: fsTrialBalanceTitle(report.map),
  period: periodText("fsTrialBalance", report.range),
  sections: [
    {
      heading: null,
      columns: [col("Map no."), col("FS line / account"), col("Debit balance", true), col("Credit balance", true), col("FS amount", true)],
      rows: [
        ...report.sections.flatMap((section) => [
          row([text(FS_SECTION_INFO[section.section].label), null, null, null, null], "section"),
          ...section.lines.flatMap((line) => [
            row([text(line.code), text(line.name), null, null, money(line.fsAmountCents)]),
            ...line.accounts.map((account) =>
              row(
                [
                  null,
                  text(`    ${account.code} ${account.name}`),
                  account.closingCents > 0 ? money(account.closingCents) : null,
                  account.closingCents < 0 ? money(-account.closingCents) : null,
                  null,
                ],
                "subtle",
              ),
            ),
          ]),
          row([null, text(`Total ${FS_SECTION_INFO[section.section].label.toLowerCase()}`), null, null, money(section.fsAmountCents)], "subtotal"),
        ]),
        row([text("Totals"), null, money(report.totals.debitCents), money(report.totals.creditCents), null], "total"),
      ],
    },
  ],
});

/** General ledger as a document: one section per account. */
export const generalLedgerDocument = (clientName: string, report: GeneralLedger): ReportDocument => ({
  clientName,
  title: REPORT_TITLES.generalLedger,
  period: periodText("generalLedger", report.range),
  sections: report.accounts.map((account) => ({
    heading: `${account.code} ${account.name} (${ACCOUNT_TYPE_LABELS[account.type]})`,
    columns: [col("Date"), col("Description"), col("Source"), col("Debit", true), col("Credit", true), col("Balance", true)],
    rows: [
      row([text(report.range.from), text("Opening balance"), null, null, null, money(account.openingCents, true)], "subtle"),
      ...account.lines.map((line) =>
        row([
          text(line.date),
          text(line.memo ? `${line.description} · ${line.memo}` : line.description),
          text(line.sourceLabel),
          line.debitCents === 0 ? null : money(line.debitCents),
          line.creditCents === 0 ? null : money(line.creditCents),
          money(line.balanceCents, true),
        ]),
      ),
      row([text(report.range.to), text("Closing balance"), null, money(account.debitCents), money(account.creditCents), money(account.closingCents, true)], "total"),
    ],
  })),
});

const statementRows = (title: string, lines: readonly StatementLine[], totalLabel: string, totalCents: number): DocRow[] => [
  row([text(title), null, null], "section"),
  ...lines.map((line) => row([text(line.code), text(line.name), money(line.amountCents)])),
  row([null, text(totalLabel), money(totalCents)], "subtotal"),
];

const STATEMENT_COLUMNS = [col("Code"), col("Account"), col("Amount", true)];

/** Income statement as a document. */
export const incomeStatementDocument = (clientName: string, report: IncomeStatement): ReportDocument => ({
  clientName,
  title: REPORT_TITLES.incomeStatement,
  period: periodText("incomeStatement", report.range),
  sections: [
    {
      heading: null,
      columns: STATEMENT_COLUMNS,
      rows: [
        ...statementRows("Revenue", report.revenue, "Total revenue", report.totalRevenueCents),
        ...statementRows("Expenses", report.expenses, "Total expenses", report.totalExpensesCents),
        row([null, text(report.netIncomeCents >= 0 ? "Net income" : "Net loss"), money(report.netIncomeCents)], "total"),
      ],
    },
  ],
});

/** Printed titles of statements laid out by the internal map; the external map prints the plain title. */
const mappedTitle = (kind: "balanceSheet" | "incomeStatement", map: FsMap): string =>
  map === "internal" ? `${REPORT_TITLES[kind]} (internal)` : REPORT_TITLES[kind];

const blockRows = (blocks: readonly StatementBlock[], showAccounts: boolean): DocRow[] =>
  blocks.flatMap((block): DocRow[] => {
    switch (block.kind) {
      case "heading":
        return [row([text(block.label), null, null], "section")];
      case "empty":
        return [row([null, text("None"), null], "subtle")];
      case "note":
        return [row([null, text(block.label), money(block.cents)])];
      case "total":
        return [row([null, text(block.label), money(block.cents)], block.grand ? "total" : "subtotal")];
      case "line":
        return [
          row([text(block.line.code), text(block.line.name), money(block.line.amountCents)]),
          ...(showAccounts
            ? block.line.accounts.map((account) =>
                row([null, text(`    ${account.code} ${account.name}`), money(account.amountCents)], "subtle"),
              )
            : []),
        ];
    }
  });

const MAPPED_COLUMNS = [col("Map no."), col("Line"), col("Amount", true)];

/**
 * Balance sheet rolled up by an FS map as a document (FR-36).
 * @param clientName The client's name.
 * @param report The mapped balance sheet.
 * @param showAccounts List the accounts under each line.
 */
export const mappedBalanceSheetDocument = (clientName: string, report: MappedBalanceSheet, showAccounts: boolean): ReportDocument => ({
  clientName,
  title: mappedTitle("balanceSheet", report.map),
  period: periodText("balanceSheet", report.range),
  sections: [{ heading: null, columns: MAPPED_COLUMNS, rows: blockRows(balanceSheetBlocks(report), showAccounts) }],
});

/**
 * Income statement rolled up by an FS map as a document (FR-36).
 * @param clientName The client's name.
 * @param report The mapped income statement.
 * @param showAccounts List the accounts under each line.
 */
export const mappedIncomeStatementDocument = (clientName: string, report: MappedIncomeStatement, showAccounts: boolean): ReportDocument => ({
  clientName,
  title: mappedTitle("incomeStatement", report.map),
  period: periodText("incomeStatement", report.range),
  sections: [{ heading: null, columns: MAPPED_COLUMNS, rows: blockRows(incomeStatementBlocks(report), showAccounts) }],
});

/** Balance sheet as a document. */
export const balanceSheetDocument = (clientName: string, report: BalanceSheet): ReportDocument => ({
  clientName,
  title: REPORT_TITLES.balanceSheet,
  period: periodText("balanceSheet", report.range),
  sections: [
    {
      heading: null,
      columns: STATEMENT_COLUMNS,
      rows: [
        ...statementRows("Assets", report.assets, "Total assets", report.totalAssetsCents),
        ...statementRows("Liabilities", report.liabilities, "Total liabilities", report.totalLiabilitiesCents),
        row([text("Equity"), null, null], "section"),
        ...report.equity.map((line) => row([text(line.code), text(line.name), money(line.amountCents)])),
        row([null, text("Current earnings (not yet closed)"), money(report.currentEarningsCents)]),
        row([null, text("Total equity"), money(report.totalEquityCents)], "subtotal"),
        row([null, text("Total liabilities and equity"), money(report.totalLiabilitiesCents + report.totalEquityCents)], "total"),
      ],
    },
  ],
});
