import { z } from "zod";

import type { AccountType } from "../accounts/accountSchemas";
import { clientIdSchema, type ClientId } from "../clients/clientSchemas";
import { isoDateSchema } from "../dates";
import type { DateRange } from "../fiscalYears";
import type { JournalSource } from "../journal/journalSchemas";

/** The four core reports (FR-29) and the trial balance by FS map (FR-37). */
export const REPORT_KINDS = ["trialBalance", "fsTrialBalance", "generalLedger", "balanceSheet", "incomeStatement"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_TITLES: Record<ReportKind, string> = {
  trialBalance: "Trial Balance",
  fsTrialBalance: "Trial Balance by FS Map",
  generalLedger: "General Ledger",
  balanceSheet: "Balance Sheet",
  incomeStatement: "Income Statement",
};

/** Options every report takes (FR-30). */
export const reportOptionsSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    /**
     * Include year-end closing entries dated within the range. Off by default,
     * so a full-year report shows the year's revenue and expenses.
     */
    includeClosingEntries: z.boolean().default(false),
    /** General ledger only: one account, or null for every account. */
    accountId: z.number().int().positive().nullable().default(null),
  })
  .refine((options) => options.from <= options.to, { message: "The start date must be on or before the end date." });

export type ReportOptions = z.input<typeof reportOptionsSchema>;

export const reportRequestSchema = z.object({
  clientId: clientIdSchema,
  options: reportOptionsSchema,
});

/** An account's balances for a date range. Amounts are debit-positive cents. */
export interface AccountBalance {
  readonly accountId: number;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  /** Balance before the range starts. */
  readonly openingCents: number;
  /** Debits and credits within the range. */
  readonly debitCents: number;
  readonly creditCents: number;
  /** Opening + debits − credits. */
  readonly closingCents: number;
}

/** Trial balance (FR-29): every account with a balance or activity. */
export interface TrialBalance {
  readonly range: DateRange;
  readonly rows: readonly AccountBalance[];
  readonly totals: {
    readonly debitCents: number;
    readonly creditCents: number;
    /** Sum of closing balances that are debits / credits. */
    readonly closingDebitCents: number;
    readonly closingCreditCents: number;
  };
}

/** One posted line in the general ledger. */
export interface LedgerLine {
  readonly entryId: number;
  readonly date: string;
  readonly description: string;
  readonly source: JournalSource;
  /** Where it came from, e.g. the bank tab's name or "Manual entry". */
  readonly sourceLabel: string;
  readonly memo: string | null;
  readonly debitCents: number;
  readonly creditCents: number;
  /** Running balance after this line, debit-positive. */
  readonly balanceCents: number;
}

/** One account's section of the general ledger. */
export interface LedgerAccount {
  readonly accountId: number;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly openingCents: number;
  readonly lines: readonly LedgerLine[];
  readonly debitCents: number;
  readonly creditCents: number;
  readonly closingCents: number;
}

/** General ledger (FR-29): every posted line per account. */
export interface GeneralLedger {
  readonly range: DateRange;
  readonly accounts: readonly LedgerAccount[];
}

/** One account on a financial statement, in its normal-balance sign. */
export interface StatementLine {
  readonly accountId: number;
  readonly code: string;
  readonly name: string;
  readonly amountCents: number;
}

/** Income statement (FR-29) for the range. */
export interface IncomeStatement {
  readonly range: DateRange;
  readonly revenue: readonly StatementLine[];
  readonly expenses: readonly StatementLine[];
  readonly totalRevenueCents: number;
  readonly totalExpensesCents: number;
  readonly netIncomeCents: number;
}

/** Balance sheet (FR-29) as at the end of the range. */
export interface BalanceSheet {
  readonly range: DateRange;
  readonly assets: readonly StatementLine[];
  readonly liabilities: readonly StatementLine[];
  readonly equity: readonly StatementLine[];
  /** Revenue less expenses not yet closed to retained earnings. */
  readonly currentEarningsCents: number;
  readonly totalAssetsCents: number;
  readonly totalLiabilitiesCents: number;
  /** Equity accounts plus current earnings. */
  readonly totalEquityCents: number;
}

/**
 * The reports API the preload script exposes to the renderer as
 * `window.reports`.
 */
export interface ReportsApi {
  trialBalance(clientId: ClientId, options: ReportOptions): Promise<TrialBalance>;
  generalLedger(clientId: ClientId, options: ReportOptions): Promise<GeneralLedger>;
  balanceSheet(clientId: ClientId, options: ReportOptions): Promise<BalanceSheet>;
  incomeStatement(clientId: ClientId, options: ReportOptions): Promise<IncomeStatement>;
}
