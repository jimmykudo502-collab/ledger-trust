import { compareAccountsByCode } from "../../common/accounts/accountSchemas";
import type { DateRange } from "../../common/fiscalYears";
import type {
  AccountBalance,
  BalanceSheet,
  GeneralLedger,
  IncomeStatement,
  LedgerLine,
  StatementLine,
  TrialBalance,
} from "../../common/reports/reportSchemas";

/**
 * Pure report builders. Every report is computed from the same per-account
 * balances (themselves computed from posted journal lines, FR-31), so the
 * reports always agree with each other.
 */

const hasNumbers = (row: AccountBalance) =>
  row.openingCents !== 0 || row.debitCents !== 0 || row.creditCents !== 0 || row.closingCents !== 0;

/**
 * Trial balance: every account with a balance or activity, sorted by code.
 * @param range The report's dates.
 * @param balances Every account's balances for the range.
 */
export const buildTrialBalance = (range: DateRange, balances: readonly AccountBalance[]): TrialBalance => {
  const rows = balances.filter(hasNumbers).sort(compareAccountsByCode);
  return {
    range,
    rows,
    totals: {
      debitCents: sum(rows.map((row) => row.debitCents)),
      creditCents: sum(rows.map((row) => row.creditCents)),
      closingDebitCents: sum(rows.map((row) => Math.max(row.closingCents, 0))),
      closingCreditCents: sum(rows.map((row) => Math.max(0 - row.closingCents, 0))),
    },
  };
};

/**
 * Income statement: revenue and expense activity within the range.
 * @param range The report's dates.
 * @param balances Every account's balances for the range.
 */
export const buildIncomeStatement = (range: DateRange, balances: readonly AccountBalance[]): IncomeStatement => {
  const revenue = lines(balances, "revenue", (row) => row.creditCents - row.debitCents);
  const expenses = lines(balances, "expense", (row) => row.debitCents - row.creditCents);
  const totalRevenueCents = sum(revenue.map((line) => line.amountCents));
  const totalExpensesCents = sum(expenses.map((line) => line.amountCents));
  return {
    range,
    revenue,
    expenses,
    totalRevenueCents,
    totalExpensesCents,
    netIncomeCents: totalRevenueCents - totalExpensesCents,
  };
};

/**
 * Balance sheet as at the end of the range. Revenue and expense balances not
 * yet closed to retained earnings appear as current earnings, so assets
 * always equal liabilities plus equity.
 * @param range The report's dates.
 * @param balances Every account's balances for the range.
 */
export const buildBalanceSheet = (range: DateRange, balances: readonly AccountBalance[]): BalanceSheet => {
  const assets = lines(balances, "asset", (row) => row.closingCents);
  const liabilities = lines(balances, "liability", (row) => 0 - row.closingCents);
  const equity = lines(balances, "equity", (row) => 0 - row.closingCents);
  const currentEarningsCents = 0 - sum(
    balances.filter((row) => row.type === "revenue" || row.type === "expense").map((row) => row.closingCents),
  );
  return {
    range,
    assets,
    liabilities,
    equity,
    currentEarningsCents,
    totalAssetsCents: sum(assets.map((line) => line.amountCents)),
    totalLiabilitiesCents: sum(liabilities.map((line) => line.amountCents)),
    totalEquityCents: sum(equity.map((line) => line.amountCents)) + currentEarningsCents,
  };
};

/** A posted line before the running balance is added. */
export type RawLedgerLine = Omit<LedgerLine, "balanceCents"> & { readonly accountId: number };

/**
 * General ledger: for each account with a balance or activity, its opening
 * balance, each line in date order with a running balance, and its closing
 * balance (which matches the trial balance).
 * @param range The report's dates.
 * @param balances Every account's balances for the range.
 * @param rawLines Lines within the range, already in date order.
 * @param accountId One account, or null for all.
 */
export const buildGeneralLedger = (
  range: DateRange,
  balances: readonly AccountBalance[],
  rawLines: readonly RawLedgerLine[],
  accountId: number | null,
): GeneralLedger => {
  const byAccount = new Map<number, RawLedgerLine[]>();
  for (const line of rawLines) {
    byAccount.set(line.accountId, [...(byAccount.get(line.accountId) ?? []), line]);
  }
  const accounts = balances
    .filter((row) => (accountId === null ? hasNumbers(row) : row.accountId === accountId))
    .sort(compareAccountsByCode)
    .map((row) => {
      let running = row.openingCents;
      const accountLines: LedgerLine[] = (byAccount.get(row.accountId) ?? []).map((line) => {
        running += line.debitCents - line.creditCents;
        return {
          entryId: line.entryId,
          date: line.date,
          description: line.description,
          source: line.source,
          sourceLabel: line.sourceLabel,
          memo: line.memo,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
          balanceCents: running,
        };
      });
      return {
        accountId: row.accountId,
        code: row.code,
        name: row.name,
        type: row.type,
        openingCents: row.openingCents,
        lines: accountLines,
        debitCents: row.debitCents,
        creditCents: row.creditCents,
        closingCents: row.closingCents,
      };
    });
  return { range, accounts };
};

const lines = (
  balances: readonly AccountBalance[],
  type: AccountBalance["type"],
  amount: (row: AccountBalance) => number,
): StatementLine[] =>
  balances
    .filter((row) => row.type === type)
    .map((row) => ({ accountId: row.accountId, code: row.code, name: row.name, amountCents: amount(row) }))
    .filter((line) => line.amountCents !== 0)
    .sort(compareAccountsByCode);

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
