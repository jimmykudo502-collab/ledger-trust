import type { Cell, PreviewRow } from "../../../common/imports/importSchemas";

/**
 * The spreadsheet letter for a 0-based column index: 0 → "A", 26 → "AA".
 * @param index The column index.
 */
export const columnLetter = (index: number): string => {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
};

/**
 * A label for a column in the mapping dropdowns, e.g. "B: Description".
 * @param index The column index.
 * @param headerCells The heading row's cells, if there is one.
 */
export const columnLabel = (index: number, headerCells: readonly Cell[] | null): string => {
  const heading = headerCells?.[index];
  return heading === null || heading === undefined || heading === ""
    ? `Column ${columnLetter(index)}`
    : `${columnLetter(index)}: ${heading}`;
};

/**
 * Rows left out by default: those already imported (FR-14).
 * @param rows The preview rows.
 */
export const defaultExclusions = (rows: readonly PreviewRow[]): Set<number> =>
  new Set(rows.filter((row) => row.duplicate).map((row) => row.rowNumber));

/** Counts shown under the preview. */
export interface PreviewSummary {
  /** Rows that will be staged. */
  readonly importing: number;
  /** Readable rows the user left out. */
  readonly leftOut: number;
  /** Rows that can't be read and so won't be imported. */
  readonly unreadable: number;
  /** Total money in and out of the rows being imported, in cents. */
  readonly moneyInCents: number;
  readonly moneyOutCents: number;
}

/**
 * Summarises what an import will stage.
 * @param rows The preview rows.
 * @param excluded Row numbers the user left out.
 */
export const summarizePreview = (
  rows: readonly PreviewRow[],
  excluded: ReadonlySet<number>,
): PreviewSummary => {
  let importing = 0;
  let leftOut = 0;
  let unreadable = 0;
  let moneyInCents = 0;
  let moneyOutCents = 0;
  for (const row of rows) {
    if (row.problem !== null) {
      unreadable += 1;
    } else if (excluded.has(row.rowNumber)) {
      leftOut += 1;
    } else {
      importing += 1;
      if (row.amountCents > 0) moneyInCents += row.amountCents;
      else moneyOutCents -= row.amountCents;
    }
  }
  return { importing, leftOut, unreadable, moneyInCents, moneyOutCents };
};
