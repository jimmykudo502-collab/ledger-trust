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

/** An account's closing balance on the trial balance by FS map. */
export interface FsTrialBalanceAccount {
  readonly accountId: number;
  readonly code: string;
  readonly name: string;
  /** Closing balance, debit-positive. */
  readonly closingCents: number;
}

/** One FS line on the trial balance by FS map, with the accounts that make it up. */
export interface FsTrialBalanceLine {
  /** The FS line's id, or null for the accounts not mapped on this map. */
  readonly lineId: number | null;
  readonly code: string;
  readonly name: string;
  /** Sum of the accounts' closing balances, debit-positive. */
  readonly netCents: number;
  /** The same amount in the section's normal-balance sign, as shown on the statement. */
  readonly fsAmountCents: number;
  readonly accounts: readonly FsTrialBalanceAccount[];
}

/** A statement section on the trial balance by FS map. */
export interface FsTrialBalanceSection {
  readonly section: FsSection;
  readonly lines: readonly FsTrialBalanceLine[];
  /** Section total in its normal-balance sign. */
  readonly fsAmountCents: number;
}

/**
 * Trial balance grouped by an FS map (FR-37): every account with a closing
 * balance, under the FS line it rolls into, so each number on the mapped
 * statements can be traced to its accounts.
 */
export interface FsTrialBalance {
  readonly range: DateRange;
  readonly map: FsMap;
  /** Sections with at least one account, in statement order. */
  readonly sections: readonly FsTrialBalanceSection[];
  readonly totals: {
    /** Sum of closing balances that are debits / credits. */
    readonly debitCents: number;
    readonly creditCents: number;
  };
  /** Accounts with a balance that have no line on this map. */
  readonly unmappedAccountCount: number;
}

/**
 * The mapped statements API the preload script exposes to the renderer as
 * `window.mappedStatements`.
 */
export interface MappedStatementsApi {
  balanceSheet(clientId: ClientId, options: ReportOptions, map: FsMap): Promise<MappedBalanceSheet>;
  incomeStatement(clientId: ClientId, options: ReportOptions, map: FsMap): Promise<MappedIncomeStatement>;
  trialBalance(clientId: ClientId, options: ReportOptions, map: FsMap): Promise<FsTrialBalance>;
}
