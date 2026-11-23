import type { TransferRow } from "../../../common/transfers/transferSchemas";

/**
 * Why two hand-picked unmatched items can't be paired as one transfer, or
 * null if they can: they need different tabs and the same amount in
 * opposite directions.
 * @param selected The rows the user ticked.
 */
export const pairProblem = (selected: readonly TransferRow[]): string | null => {
  if (selected.length !== 2) return "Tick exactly two items to pair them.";
  const [a, b] = selected;
  if (a.bankAccountId === b.bankAccountId) return "Both items are in the same tab.";
  if (a.amountCents !== -b.amountCents) return "The amounts must match, one in and one out.";
  return null;
};

/**
 * The control account's unmatched total: what it would be off by if every
 * unmatched item were posted (each row's control line is the opposite of
 * its bank amount).
 * @param unmatched Unmatched control items.
 */
export const unmatchedTotal = (unmatched: readonly TransferRow[]): number =>
  unmatched.reduce((sum, row) => sum - row.amountCents, 0);
