import { FS_SECTION_INFO } from "../fsMaps/fsMapSchemas";
import type { MappedBalanceSheet, MappedIncomeStatement, MappedLine, MappedSection } from "./mappedStatementSchemas";

/**
 * The order of a mapped statement's parts, shared by the screen and the
 * PDF/Excel exports so they always show the same thing (FR-32, FR-36).
 */
export type StatementBlock =
  | { readonly kind: "heading"; readonly label: string }
  | { readonly kind: "line"; readonly line: MappedLine }
  | { readonly kind: "note"; readonly label: string; readonly cents: number }
  | { readonly kind: "empty" }
  | { readonly kind: "total"; readonly label: string; readonly cents: number; readonly grand: boolean };

const sectionBlocks = (section: MappedSection, title?: string): StatementBlock[] => {
  const label = title ?? FS_SECTION_INFO[section.section].label;
  return [
    { kind: "heading", label },
    ...section.lines.map((line): StatementBlock => ({ kind: "line", line })),
    ...(section.lines.length === 0 ? [{ kind: "empty" } as const] : []),
    { kind: "total", label: `Total ${label.toLowerCase()}`, cents: section.totalCents, grand: false },
  ];
};

/**
 * A mapped balance sheet as blocks: asset sections, total assets, liability
 * sections, total liabilities, equity with current earnings, and the
 * liabilities-and-equity total.
 * @param report The mapped balance sheet.
 */
export const balanceSheetBlocks = (report: MappedBalanceSheet): StatementBlock[] => [
  ...report.assets.flatMap((section) => sectionBlocks(section)),
  { kind: "total", label: "Total assets", cents: report.totalAssetsCents, grand: true },
  ...report.liabilities.flatMap((section) => sectionBlocks(section)),
  { kind: "total", label: "Total liabilities", cents: report.totalLiabilitiesCents, grand: false },
  { kind: "heading", label: "Equity" },
  ...report.equity.lines.map((line): StatementBlock => ({ kind: "line", line })),
  { kind: "note", label: "Current earnings (not yet closed)", cents: report.currentEarningsCents },
  { kind: "total", label: "Total equity", cents: report.totalEquityCents, grand: false },
  {
    kind: "total",
    label: "Total liabilities and equity",
    cents: report.totalLiabilitiesCents + report.totalEquityCents,
    grand: true,
  },
];

/**
 * A mapped income statement as blocks. Sections with no lines are left out
 * (except revenue and operating expenses), and the gross profit, operating
 * income and income before taxes subtotals appear only when they add
 * something.
 * @param report The mapped income statement.
 */
export const incomeStatementBlocks = (report: MappedIncomeStatement): StatementBlock[] => {
  const has = (section: MappedSection) => section.lines.length > 0;
  const hasOther = has(report.otherIncome) || has(report.otherExpenses);
  const total = (label: string, cents: number): StatementBlock => ({ kind: "total", label, cents, grand: false });
  return [
    ...sectionBlocks(report.revenue),
    ...(has(report.costOfSales) ? [...sectionBlocks(report.costOfSales), total("Gross profit", report.grossProfitCents)] : []),
    ...sectionBlocks(report.operatingExpenses),
    ...(hasOther || has(report.incomeTaxes) ? [total("Operating income", report.operatingIncomeCents)] : []),
    ...(has(report.otherIncome) ? sectionBlocks(report.otherIncome) : []),
    ...(has(report.otherExpenses) ? sectionBlocks(report.otherExpenses) : []),
    ...(has(report.incomeTaxes)
      ? [total("Income before income taxes", report.incomeBeforeTaxesCents), ...sectionBlocks(report.incomeTaxes)]
      : []),
    { kind: "total", label: report.netIncomeCents >= 0 ? "Net income" : "Net loss", cents: report.netIncomeCents, grand: true },
  ];
};
