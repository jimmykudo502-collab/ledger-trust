import { z } from "zod";

import type { ClientId } from "../clients/clientSchemas";
import type { DateRange } from "../fiscalYears";
import type { FsMap, FsSection } from "../fsMaps/fsMapSchemas";
import type { ReportOptions, StatementLine } from "./reportSchemas";

/**
 * How the balance sheet and income statement are laid out (FR-36): one line
 * per account, or rolled up by the internal or external FS map. Every layout
 * comes from the same posted journal lines.
 */
export const STATEMENT_LAYOUTS = ["accounts", "internal", "external"] as const;
export type StatementLayout = (typeof STATEMENT_LAYOUTS)[number];
export const statementLayoutSchema = z.enum(STATEMENT_LAYOUTS);

export const STATEMENT_LAYOUT_LABELS: Record<StatementLayout, string> = {
  accounts: "By account",
  internal: "Internal FS",
  external: "External FS",
};

/** One FS line on a mapped statement, with the accounts that make it up. */
export interface MappedLine {
  /** The FS line's id, or null for the accounts not mapped on this map. */
  readonly lineId: number | null;
  readonly code: string;
  readonly name: string;
  /** In the section's normal-balance sign. */
  readonly amountCents: number;
  /** The accounts in this line, each in the section's normal-balance sign. */
  readonly accounts: readonly StatementLine[];
}

/** A statement section with its lines and total. */
export interface MappedSection {
  readonly section: FsSection;
  readonly lines: readonly MappedLine[];
  readonly totalCents: number;
}

/** Balance sheet rolled up by an FS map, as at the end of the range. */
export interface MappedBalanceSheet {
  readonly range: DateRange;
  readonly map: FsMap;
  /** Current then non-current assets. */
  readonly assets: readonly MappedSection[];
  /** Current then non-current liabilities. */
  readonly liabilities: readonly MappedSection[];
  readonly equity: MappedSection;
  /** Revenue less expenses not yet closed to retained earnings. */
  readonly currentEarningsCents: number;
  readonly totalAssetsCents: number;
  readonly totalLiabilitiesCents: number;
  /** Equity lines plus current earnings. */
  readonly totalEquityCents: number;
  /** Accounts with an amount here that have no line on this map. */
  readonly unmappedAccountCount: number;
}

/** Income statement rolled up by an FS map, for the range. */
export interface MappedIncomeStatement {
  readonly range: DateRange;
  readonly map: FsMap;
  readonly revenue: MappedSection;
  readonly costOfSales: MappedSection;
  /** Revenue less cost of sales. */
  readonly grossProfitCents: number;
  readonly operatingExpenses: MappedSection;
  /** Gross profit less operating expenses. */
  readonly operatingIncomeCents: number;
  readonly otherIncome: MappedSection;
  readonly otherExpenses: MappedSection;
  /** Operating income plus other income less other expenses. */
  readonly incomeBeforeTaxesCents: number;
  readonly incomeTaxes: MappedSection;
  readonly netIncomeCents: number;
  /** Accounts with an amount here that have no line on this map. */
  readonly unmappedAccountCount: number;
}

/**
 * The mapped statements API the preload script exposes to the renderer as
 * `window.mappedStatements`.
 */
export interface MappedStatementsApi {
  balanceSheet(clientId: ClientId, options: ReportOptions, map: FsMap): Promise<MappedBalanceSheet>;
  incomeStatement(clientId: ClientId, options: ReportOptions, map: FsMap): Promise<MappedIncomeStatement>;
}
