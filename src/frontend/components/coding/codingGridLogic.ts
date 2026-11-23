import type { Account, AccountType } from "../../../common/accounts/accountSchemas";
import type { StagedTransaction } from "../../../common/staging/stagingSchemas";

/** Which rows the coding grid shows. */
export type RowFilter = "toCode" | "ready" | "posted" | "all";

export const ROW_FILTERS: readonly RowFilter[] = ["toCode", "ready", "posted", "all"];

export const ROW_FILTER_LABELS: Record<RowFilter, string> = {
  toCode: "To code",
  ready: "Ready to post",
  posted: "Posted",
  all: "All",
};

/**
 * Whether a row belongs under a filter.
 * @param row The row.
 * @param filter The filter.
 */
export const matchesFilter = (row: StagedTransaction, filter: RowFilter): boolean => {
  switch (filter) {
    case "toCode":
      return row.status === "staged" && row.offsetAccountId === null;
    case "ready":
      return row.status === "staged" && row.offsetAccountId !== null;
    case "posted":
      return row.status === "posted";
    case "all":
      return true;
  }
};

/**
 * How many rows fall under each filter.
 * @param rows The tab's rows.
 */
export const filterCounts = (rows: readonly StagedTransaction[]): Record<RowFilter, number> => ({
  toCode: rows.filter((row) => matchesFilter(row, "toCode")).length,
  ready: rows.filter((row) => matchesFilter(row, "ready")).length,
  posted: rows.filter((row) => matchesFilter(row, "posted")).length,
  all: rows.length,
});

/** What a code typed in the grid refers to. */
export type CodeLookup =
  | { readonly kind: "empty" }
  | { readonly kind: "known"; readonly account: Account }
  | { readonly kind: "own"; readonly account: Account }
  | { readonly kind: "unknown"; readonly code: string };

/**
 * Looks up a typed code (FR-6): empty, an existing account, the tab's own
 * account (not allowed), or a code that doesn't exist yet.
 * @param typed What the user typed.
 * @param accounts The client's accounts.
 * @param tabAccountId The tab's own ledger account.
 */
export const lookUpCode = (typed: string, accounts: readonly Account[], tabAccountId: number): CodeLookup => {
  const code = typed.trim();
  if (code === "") return { kind: "empty" };
  const account = accounts.find((candidate) => candidate.code === code);
  if (!account) return { kind: "unknown", code };
  return account.id === tabAccountId ? { kind: "own", account } : { kind: "known", account };
};

/**
 * The account type to suggest when creating an account from the grid: money
 * in is usually revenue, money out usually an expense.
 * @param amountCents The row's amount; positive = money in.
 */
export const suggestedType = (amountCents: number): AccountType => (amountCents > 0 ? "revenue" : "expense");
