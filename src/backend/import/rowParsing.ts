import type {
  Cell,
  ColumnMapping,
  DateOrder,
} from "../../common/imports/importSchemas";
import { stagedRowSchema } from "../../common/imports/importSchemas";
import { centsFromNumber, parseMoney } from "../../common/money";
import { parseImportDate } from "./importDates";

/** A data row read with a column mapping. Amounts: positive = money in. */
export interface ParsedRow {
  /** Spreadsheet row number as the user sees it (1-based). */
  readonly rowNumber: number;
  readonly date: string | null;
  readonly description: string;
  readonly amountCents: number | null;
  /** Why the row can't be imported, or null if it can. */
  readonly problem: string | null;
}

const isBlank = (cell: Cell | undefined): boolean => cell === null || cell === undefined;

/**
 * Reads a money cell into cents.
 * @param cell The cell.
 * @returns Cents, `null` for an empty cell, or `undefined` if unreadable.
 */
export const cellToCents = (cell: Cell | undefined): number | null | undefined => {
  if (isBlank(cell)) return null;
  const cents = typeof cell === "number" ? centsFromNumber(cell) : parseMoney(cell);
  return cents === null ? undefined : cents;
};

/**
 * Reads a date cell.
 * @param cell The cell.
 * @param order How to read all-numeric dates.
 */
export const cellToDate = (cell: Cell | undefined, order: DateOrder): string | null =>
  isBlank(cell) ? null : parseImportDate(cell, order);

const describeCell = (cell: Cell | undefined): string =>
  typeof cell === "number" ? String(cell) : `"${cell}"`;

const readAmount = (
  row: readonly Cell[],
  amount: ColumnMapping["amount"],
): { cents: number | null; problem: string | null } => {
  if (amount.kind === "signed") {
    const cell = row[amount.column];
    const cents = cellToCents(cell);
    if (cents === undefined) return { cents: null, problem: `Amount ${describeCell(cell)} isn't a number.` };
    if (cents === null) return { cents: null, problem: "No amount." };
    return { cents: amount.positiveIsMoneyIn ? cents : -cents, problem: null };
  }
  const inCell = row[amount.moneyInColumn];
  const outCell = row[amount.moneyOutColumn];
  const moneyIn = cellToCents(inCell);
  const moneyOut = cellToCents(outCell);
  if (moneyIn === undefined) return { cents: null, problem: `Money in ${describeCell(inCell)} isn't a number.` };
  if (moneyOut === undefined) return { cents: null, problem: `Money out ${describeCell(outCell)} isn't a number.` };
  // Some banks show withdrawals as negative numbers in their own column.
  const inCents = Math.abs(moneyIn ?? 0);
  const outCents = Math.abs(moneyOut ?? 0);
  if (inCents !== 0 && outCents !== 0) {
    return { cents: null, problem: "Has both money in and money out." };
  }
  if (moneyIn === null && moneyOut === null) return { cents: null, problem: "No amount." };
  return { cents: inCents - outCents, problem: null };
};

/**
 * Reads every data row of a sheet with the given mapping. Rows above and
 * including the heading row are skipped, as are rows with neither a date nor
 * an amount (blank lines, section titles). Each readable row is checked
 * against the staged-row schema.
 * @param rows The sheet's rows.
 * @param mapping Which columns hold what.
 */
export const parseRows = (rows: readonly (readonly Cell[])[], mapping: ColumnMapping): ParsedRow[] => {
  const firstDataRow = mapping.headerRow === null ? 0 : mapping.headerRow + 1;
  const parsed: ParsedRow[] = [];

  for (let index = firstDataRow; index < rows.length; index += 1) {
    const row = rows[index];
    const dateCell = row[mapping.dateColumn];
    const amountCells =
      mapping.amount.kind === "signed"
        ? [row[mapping.amount.column]]
        : [row[mapping.amount.moneyInColumn], row[mapping.amount.moneyOutColumn]];
    if (isBlank(dateCell) && amountCells.every(isBlank)) {
      continue;
    }

    const date = cellToDate(dateCell, mapping.dateOrder);
    const description = isBlank(row[mapping.descriptionColumn])
      ? ""
      : String(row[mapping.descriptionColumn]).replace(/\s+/g, " ").trim().slice(0, 500);
    const amount = readAmount(row, mapping.amount);

    let problem: string | null = null;
    if (date === null) {
      problem = isBlank(dateCell) ? "No date." : `Date ${describeCell(dateCell)} isn't a date.`;
    } else if (amount.problem) {
      problem = amount.problem;
    } else {
      const check = stagedRowSchema.safeParse({ date, description, amountCents: amount.cents });
      if (!check.success) problem = check.error.issues.map((issue) => issue.message).join(" ");
    }

    parsed.push({
      rowNumber: index + 1,
      date,
      description,
      amountCents: amount.cents,
      problem,
    });
  }
  return parsed;
};
