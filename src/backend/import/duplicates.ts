import type { StagedRowInput } from "../../common/imports/importSchemas";

/**
 * The identity used to spot a re-imported transaction (FR-14): date, amount
 * and description, ignoring case and spacing in the description.
 * @param row The transaction.
 */
export const duplicateKey = (row: StagedRowInput): string =>
  `${row.date}|${row.amountCents}|${row.description.replace(/\s+/g, " ").trim().toLowerCase()}`;

/**
 * Flags incoming rows that match transactions already imported into the same
 * tab (FR-14). Matching is one-to-one: if a tab already has one $5 coffee on
 * a day and the file has two identical ones, only the first is flagged, so
 * genuine repeats within a statement still come through.
 * @param incoming Rows about to be imported, in file order (`null` for rows
 *   that can't be imported and so can't be duplicates).
 * @param existing Transactions already imported into the tab.
 * @returns One flag per incoming row.
 */
export const flagDuplicates = (
  incoming: readonly (StagedRowInput | null)[],
  existing: readonly StagedRowInput[],
): boolean[] => {
  const remaining = new Map<string, number>();
  for (const row of existing) {
    const key = duplicateKey(row);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return incoming.map((row) => {
    if (row === null) return false;
    const key = duplicateKey(row);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return false;
    remaining.set(key, count - 1);
    return true;
  });
};
