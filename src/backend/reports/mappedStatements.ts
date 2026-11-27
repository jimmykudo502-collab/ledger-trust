import { compareAccountsByCode } from "../../common/accounts/accountSchemas";
import type { DateRange } from "../../common/fiscalYears";
import {
  canMap,
  DEFAULT_SECTION_FOR_TYPE,
  FS_SECTION_INFO,
  FS_SECTIONS,
  statementOfType,
  type FsLine,
  type FsMap,
  type FsSection,
  type FsStatement,
} from "../../common/fsMaps/fsMapSchemas";
import type {
  FsTrialBalance,
  FsTrialBalanceAccount,
  FsTrialBalanceLine,
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

/** Where an account goes on a map: its line, or the catch-all line of its type's section. */
interface Placement {
  readonly key: string;
  readonly lineId: number | null;
  readonly code: string;
  readonly name: string;
  readonly section: FsSection;
  /** False when the account has no line, or a line on the other statement. */
  readonly fits: boolean;
}

const placeAccount = (row: AccountBalance, linesById: ReadonlyMap<number, FsLine>, mapping: FsMapping): Placement => {
  const mappedId = mapping.lineOfAccount.get(row.accountId);
  const line = mappedId === undefined ? undefined : linesById.get(mappedId);
  if (line !== undefined && canMap(row.type, line.section)) {
    return { key: `line:${line.id}`, lineId: line.id, code: line.code, name: line.name, section: line.section, fits: true };
  }
  const section = DEFAULT_SECTION_FOR_TYPE[row.type];
  return { key: `unmapped:${section}`, lineId: null, code: "", name: UNMAPPED_LINE_NAME, section, fits: false };
};

/** An amount in a section's normal-balance sign (never -0). */
const inNormalSign = (section: FsSection, debitCents: number): number =>
  FS_SECTION_INFO[section].normal === "debit" ? debitCents : 0 - debitCents;

interface Bucket extends Placement {
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
    const placement = placeAccount(row, linesById, mapping);
    if (!placement.fits) unmappedAccountCount += 1;
    const bucket = buckets.get(placement.key) ?? { ...placement, accounts: [] };
    buckets.set(placement.key, bucket);
    bucket.accounts.push({ accountId: row.accountId, code: row.code, name: row.name, amountCents: inNormalSign(placement.section, value) });
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

type Sortable = { readonly lineId: number | null; readonly code: string };

/** Mapped lines by map number; the catch-all line goes last. */
const compareLines = (a: Sortable, b: Sortable): number =>
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

/**
 * Trial balance grouped by an FS map (FR-37): every account with a closing
 * balance under the line it rolls into, with each line's and section's
 * amount as shown on the mapped statements. Placement follows the mapped
 * statements exactly, including the catch-all line for unmapped accounts.
 * @param range The report's dates.
 * @param balances Every account's balances for the range.
 * @param mapping The FS map to group by.
 */
export const buildFsTrialBalance = (
  range: DateRange,
  balances: readonly AccountBalance[],
  mapping: FsMapping,
): FsTrialBalance => {
  const linesById = new Map(mapping.lines.map((line) => [line.id, line]));
  const buckets = new Map<string, Placement & { accounts: FsTrialBalanceAccount[] }>();
  let unmappedAccountCount = 0;
  for (const row of balances) {
    if (row.closingCents === 0) continue;
    const placement = placeAccount(row, linesById, mapping);
    if (!placement.fits) unmappedAccountCount += 1;
    const bucket = buckets.get(placement.key) ?? { ...placement, accounts: [] };
    buckets.set(placement.key, bucket);
    bucket.accounts.push({ accountId: row.accountId, code: row.code, name: row.name, closingCents: row.closingCents });
  }
  const sections = FS_SECTIONS.flatMap((section) => {
    const lines = [...buckets.values()]
      .filter((bucket) => bucket.section === section)
      .map((bucket): FsTrialBalanceLine => {
        const netCents = sum(bucket.accounts.map((account) => account.closingCents));
        return {
          lineId: bucket.lineId,
          code: bucket.code,
          name: bucket.name,
          netCents,
          fsAmountCents: inNormalSign(section, netCents),
          accounts: [...bucket.accounts].sort(compareAccountsByCode),
        };
      })
      .sort(compareLines);
    return lines.length === 0 ? [] : [{ section, lines, fsAmountCents: sum(lines.map((line) => line.fsAmountCents)) }];
  });
  const closings = balances.map((row) => row.closingCents);
  return {
    range,
    map: mapping.map,
    sections,
    totals: {
      debitCents: sum(closings.map((cents) => Math.max(cents, 0))),
      creditCents: sum(closings.map((cents) => Math.max(0 - cents, 0))),
    },
    unmappedAccountCount,
  };
};

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
