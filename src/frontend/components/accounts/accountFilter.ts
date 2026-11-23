import {
  ACCOUNT_TYPE_LABELS,
  type Account,
} from "../../../common/accounts/accountSchemas";

/**
 * Filters accounts by a search box query, matching code, name or type label
 * case-insensitively. A blank query keeps every account.
 * @param accounts The accounts to filter; order is preserved.
 * @param query What the user typed.
 */
export const filterAccounts = (
  accounts: readonly Account[],
  query: string,
): Account[] => {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...accounts];
  }
  return accounts.filter((account) =>
    [account.code, account.name, ACCOUNT_TYPE_LABELS[account.type]].some(
      (field) => field.toLowerCase().includes(needle),
    ),
  );
};
