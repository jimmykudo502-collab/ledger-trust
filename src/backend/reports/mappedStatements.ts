import { compareAccountsByCode } from "../../common/accounts/accountSchemas";
import type { DateRange } from "../../common/fiscalYears";
import {
  canMap,
  DEFAULT_SECTION_FOR_TYPE,
  FS_SECTION_INFO,
  statementOfType,
  type FsLine,
  type FsMap,
  type FsSection,
  type FsStatement,
} from "../../common/fsMaps/fsMapSchemas";
import type {
  MappedBalanceSheet,
  MappedIncomeStatement,
  MappedLine,
  MappedSection,
} from "../../common/reports/mappedStatementSchemas";
import type { AccountBalance, StatementLine } from "../../common/reports/reportSchemas";

/**
 * Pure builders for statements rolled up by an FS map (FR-36). They use the
 * same per-account balances as the account-by-account statements, so every
 * layout shows the same totals.
 */

/** One FS map: its lines and which line each account is on. */
export interface FsMapping {
  readonly map: FsMap;
  /** The lines on this map. */
  readonly lines: readonly FsLine[];
  /** Account id → FS line id on this map (missing = not mapped). */
  readonly lineOfAccount: ReadonlyMap<number, number>;
}

/** The label of the catch-all line for accounts with no line on the map. */
export const UNMAPPED_LINE_NAME = "Accounts not mapped";

interface Bucket {
  readonly lineId: number | null;
  readonly code: string;
  readonly name: string;
  readonly section: FsSection;
  readonly accounts: StatementLine[];
}

interface RollUp {
  readonly sections: ReadonlyMap<FsSection, MappedSection>;
  readonly unmappedAccountCount: number;
}

/**
 * Groups one statement's accounts into the map's lines. Accounts with no
 * line, or a line on the other statement, go into a catch-all line in the
 * section their type normally belongs to, so nothing is ever left out.
 */
const rollUp = (
  statement: FsStatement,
  balances: readonly AccountBalance[],
  mapping: FsMapping,
  debitValue: (row: AccountBalance) => number,
): RollUp => {
  const linesById = new Map(mapping.lines.map((line) => [line.id, line]));
  const buckets = new Map<string, Bucket>();
  let unmappedAccountCount = 0;
  for (const row of balances) {
    if (statementOfType(row.type) !== statement) continue;
    const value = debitValue(row);
    if (value === 0) continue;
    const mappedId = mapping.lineOfAccount.get(row.accountId);
    const line = mappedId === undefined ? undefined : linesById.get(mappedId);
    const fits = line !== undefined && canMap(row.type, line.section);
    if (!fits) unmappedAccountCount += 1;
    const section = fits ? line.section : DEFAULT_SECTION_FOR_TYPE[row.type];
    const key = fits ? `line:${line.id}` : `unmapped:${section}`;
    const bucket =
      buckets.get(key) ??
      (fits
        ? { lineId: line.id, code: line.code, name: line.name, section, accounts: [] }
        : { lineId: null, code: "", name: UNMAPPED_LINE_NAME, section, accounts: [] });
    buckets.set(key, bucket);
    const sign = FS_SECTION_INFO[section].normal === "debit" ? 1 : -1;
    bucket.accounts.push({ accountId: row.accountId, code: row.code, name: row.name, amountCents: sign * value });
  }

  const sections = new Map<FsSection, MappedSection>();
  for (const bucket of buckets.values()) {
    const line: MappedLine = {
      lineId: bucket.lineId,
      code: bucket.code,
      name: bucket.name,
      amountCents: sum(bucket.accounts.map((account) => account.amountCents)),
      accounts: [...bucket.accounts].sort(compareAccountsByCode),
    };
    const existing = sections.get(bucket.section);
    const lines = [...(existing?.lines ?? []), line];
    sections.set(bucket.section, { section: bucket.section, lines, totalCents: sum(lines.map((l) => l.amountCents)) });
  }
  for (const [key, section] of sections) {
    sections.set(key, { ...section, lines: [...section.lines].sort(compareLines) });
  }
  return { sections, unmappedAccountCount };
};

/** Mapped lines by map number; the catch-all line goes last. */
const compareLines = (a: MappedLine, b: MappedLine): number =>
  Number(a.lineId === null) - Number(b.lineId === null) || a.code.localeCompare(b.code, undefined, { numeric: true });

const sectionOf = (rolled: RollUp, section: FsSection): MappedSection =>
  rolled.sections.get(section) ?? { section, lines: [], totalCents: 0 };

/**
 * Balance sheet as at the end of the range, rolled up by an FS map. Revenue
 * and expense balances not yet closed appear as current earnings, so assets
 * always equal liabilities plus equity.
 * @param range The report's dates.
 * @param balances Every account's balances for the range.
 * @param mapping The FS map to roll up by.
 */
export const buildMappedBalanceSheet = (
  range: DateRange,
  balances: readonly AccountBalance[],
  mapping: FsMapping,
): MappedBalanceSheet => {
  const rolled = rollUp("balanceSheet", balances, mapping, (row) => row.closingCents);
  const assets = [sectionOf(rolled, "current_assets"), sectionOf(rolled, "non_current_assets")];
  const liabilities = [sectionOf(rolled, "current_liabilities"), sectionOf(rolled, "non_current_liabilities")];
  const equity = sectionOf(rolled, "equity");
  const currentEarningsCents = 0 - sum(
    balances.filter((row) => statementOfType(row.type) === "incomeStatement").map((row) => row.closingCents),
  );
  return {
    range,
    map: mapping.map,
    assets,
    liabilities,
    equity,
    currentEarningsCents,
    totalAssetsCents: sum(assets.map((s) => s.totalCents)),
    totalLiabilitiesCents: sum(liabilities.map((s) => s.totalCents)),
    totalEquityCents: equity.totalCents + currentEarningsCents,
    unmappedAccountCount: rolled.unmappedAccountCount,
  };
};

/**
 * Income statement for the range, rolled up by an FS map, with gross
 * profit, operating income and income before taxes subtotals.
 * @param range The report's dates.
 * @param balances Every account's balances for the range (closing entries excluded).
 * @param mapping The FS map to roll up by.
 */
export const buildMappedIncomeStatement = (
  range: DateRange,
  balances: readonly AccountBalance[],
  mapping: FsMapping,
): MappedIncomeStatement => {
  const rolled = rollUp("incomeStatement", balances, mapping, (row) => row.debitCents - row.creditCents);
  const revenue = sectionOf(rolled, "revenue");
  const costOfSales = sectionOf(rolled, "cost_of_sales");
  const operatingExpenses = sectionOf(rolled, "operating_expenses");
  const otherIncome = sectionOf(rolled, "other_income");
  const otherExpenses = sectionOf(rolled, "other_expenses");
  const incomeTaxes = sectionOf(rolled, "income_taxes");
  const grossProfitCents = revenue.totalCents - costOfSales.totalCents;
  const operatingIncomeCents = grossProfitCents - operatingExpenses.totalCents;
  const incomeBeforeTaxesCents = operatingIncomeCents + otherIncome.totalCents - otherExpenses.totalCents;
  return {
    range,
    map: mapping.map,
    revenue,
    costOfSales,
    grossProfitCents,
    operatingExpenses,
    operatingIncomeCents,
    otherIncome,
    otherExpenses,
    incomeBeforeTaxesCents,
    incomeTaxes,
    netIncomeCents: incomeBeforeTaxesCents - incomeTaxes.totalCents,
    unmappedAccountCount: rolled.unmappedAccountCount,
  };
};

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
