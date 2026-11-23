import type { BankAccountKind } from "../../common/bankAccounts/bankAccountSchemas";
import type {
  AmountMapping,
  Cell,
  ColumnMapping,
} from "../../common/imports/importSchemas";
import { detectDateOrder } from "./importDates";
import { cellToCents, cellToDate } from "./rowParsing";

const HEADER_SCAN_ROWS = 15;
const SAMPLE_ROWS = 300;

const HEADINGS = {
  date: /date/i,
  description: /desc|detail|payee|memo|narrat|particular|merchant|transaction|name|reference/i,
  amount: /amount|value|\$|\bcad\b|\busd\b/i,
  moneyIn: /deposit|credit|money in|paid in|receipt|incoming/i,
  moneyOut: /withdraw|debit|money out|paid out|charge|purchase|outgoing|spent/i,
  payment: /payment/i,
  ignore: /balance|total/i,
};

const ANY_HEADING = new RegExp(
  [HEADINGS.date, HEADINGS.description, HEADINGS.amount, HEADINGS.moneyIn, HEADINGS.moneyOut, HEADINGS.ignore]
    .map((pattern) => pattern.source)
    .join("|"),
  "i",
);

interface ColumnStats {
  index: number;
  heading: string;
  filled: number;
  dates: number;
  money: number;
  text: number;
  textLength: number;
  distinct: number;
}

const isFilled = (cell: Cell | undefined) => cell !== null && cell !== undefined;

/**
 * Finds the row holding column headings: the first of the top rows with at
 * least two cells that look like headings and no dates.
 * @param rows The sheet's rows.
 * @returns Its index, or null if the sheet has no heading row.
 */
export const findHeaderRow = (rows: readonly (readonly Cell[])[]): number | null => {
  let best: { index: number; score: number } | null = null;
  rows.slice(0, HEADER_SCAN_ROWS).forEach((row, index) => {
    const hasDate = row.some((cell) => typeof cell === "string" && cellToDate(cell, "MDY") !== null);
    if (hasDate) return;
    const score = row.filter((cell) => typeof cell === "string" && ANY_HEADING.test(cell)).length;
    if (score >= 2 && (best === null || score > best.score)) best = { index, score };
  });
  return best?.index ?? null;
};

const columnStats = (rows: readonly (readonly Cell[])[], headerRow: number | null): ColumnStats[] => {
  const data = rows.slice(headerRow === null ? 0 : headerRow + 1).slice(0, SAMPLE_ROWS);
  const width = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: width }, (_, index) => {
    const stats: ColumnStats = {
      index,
      heading: headerRow === null ? "" : String(rows[headerRow][index] ?? ""),
      filled: 0,
      dates: 0,
      money: 0,
      text: 0,
      textLength: 0,
      distinct: 0,
    };
    const seen = new Set<string>();
    for (const row of data) {
      const cell = row[index];
      if (!isFilled(cell)) continue;
      stats.filled += 1;
      seen.add(String(cell));
      const isDate =
        typeof cell === "string" &&
        (cellToDate(cell, "MDY") !== null || cellToDate(cell, "DMY") !== null);
      if (isDate) {
        stats.dates += 1;
      } else if (cellToCents(cell) !== undefined) {
        stats.money += 1;
      } else {
        stats.text += 1;
        stats.textLength += String(cell).length;
      }
    }
    stats.distinct = seen.size;
    return stats;
  });
};

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

/**
 * Picks the money columns that are never both filled on the same row, the
 * usual shape of separate withdrawal and deposit columns.
 */
const findSplitPair = (
  rows: readonly (readonly Cell[])[],
  candidates: number[],
): [number, number] | null => {
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const [a, b] = [candidates[i], candidates[j]];
      let both = 0;
      let either = 0;
      for (const row of rows) {
        const hasA = isFilled(row[a]) && cellToCents(row[a]) !== 0;
        const hasB = isFilled(row[b]) && cellToCents(row[b]) !== 0;
        if (hasA && hasB) both += 1;
        if (hasA || hasB) either += 1;
      }
      if (either > 0 && both === 0) return [a, b];
    }
  }
  return null;
};

/**
 * Suggests how to read a sheet (FR-12): the heading row, date, description
 * and amount columns (one signed column or separate money in/out columns),
 * and the date order. Headings are used when present; otherwise the columns
 * are guessed from their contents. Always returns a complete mapping, which
 * the user can adjust.
 * @param rows The sheet's rows.
 * @param kind The tab's kind; credit card statements usually show charges as
 *   positive numbers, so for cards a positive amount defaults to money out.
 */
export const detectMapping = (
  rows: readonly (readonly Cell[])[],
  kind: BankAccountKind,
): { mapping: ColumnMapping; dateOrderAmbiguous: boolean } => {
  const headerRow = findHeaderRow(rows);
  const stats = columnStats(rows, headerRow);
  const used = new Set<number>();
  const take = (index: number | undefined) => {
    if (index !== undefined) used.add(index);
    return index;
  };
  const byHeading = (pattern: RegExp, exclude?: RegExp) =>
    stats.find(
      (column) =>
        !used.has(column.index) &&
        pattern.test(column.heading) &&
        !(exclude && exclude.test(column.heading)),
    )?.index;

  const dateColumn =
    take(byHeading(HEADINGS.date)) ??
    take(
      [...stats]
        .filter((column) => !used.has(column.index) && ratio(column.dates, column.filled) >= 0.5)
        .sort((a, b) => b.dates - a.dates)[0]?.index,
    );

  let amount: AmountMapping | undefined;
  const positiveIsMoneyIn = kind === "bank";
  if (headerRow !== null) {
    const moneyInPattern = kind === "credit_card" ? new RegExp(`${HEADINGS.moneyIn.source}|${HEADINGS.payment.source}`, "i") : HEADINGS.moneyIn;
    const moneyIn = byHeading(moneyInPattern, HEADINGS.ignore);
    const moneyOut = stats.find(
      (column) =>
        !used.has(column.index) &&
        column.index !== moneyIn &&
        HEADINGS.moneyOut.test(column.heading) &&
        !HEADINGS.ignore.test(column.heading),
    )?.index;
    if (moneyIn !== undefined && moneyOut !== undefined) {
      amount = { kind: "split", moneyInColumn: take(moneyIn), moneyOutColumn: take(moneyOut) };
    } else {
      const signed = byHeading(HEADINGS.amount, HEADINGS.ignore);
      if (signed !== undefined) amount = { kind: "signed", column: take(signed), positiveIsMoneyIn };
    }
  }

  const descriptionColumn =
    take(byHeading(HEADINGS.description, HEADINGS.date)) ??
    take(
      [...stats]
        .filter((column) => !used.has(column.index) && column.text > 0)
        .sort((a, b) => b.textLength - a.textLength)[0]?.index,
    );

  if (!amount) {
    const moneyColumns = stats
      .filter(
        (column) =>
          !used.has(column.index) &&
          column.filled > 0 &&
          ratio(column.money, column.filled) >= 0.6 &&
          // A column with one repeated value is an account number, not amounts.
          (column.distinct > 1 || column.filled === 1) &&
          !HEADINGS.ignore.test(column.heading),
      )
      .map((column) => column.index);
    const fill = new Map(stats.map((column) => [column.index, column.filled]));
    const data = rows.slice(headerRow === null ? 0 : headerRow + 1).slice(0, SAMPLE_ROWS);
    const pair = findSplitPair(data, moneyColumns);
    if (pair) {
      // Statements usually list withdrawals before deposits.
      amount = { kind: "split", moneyOutColumn: take(pair[0]), moneyInColumn: take(pair[1]) };
    } else if (moneyColumns.length > 0) {
      // The amount is on every row; sparse number columns are cheque numbers.
      const fullest = [...moneyColumns].sort((a, b) => fill.get(b) - fill.get(a))[0];
      amount = { kind: "signed", column: take(fullest), positiveIsMoneyIn };
    }
  }

  // Fill any gaps with unused columns so the mapping is always complete.
  const width = Math.max(3, stats.length);
  const nextFree = () => {
    for (let index = 0; index < width + 3; index += 1) {
      if (!used.has(index)) {
        used.add(index);
        return index;
      }
    }
    return 0;
  };
  const finalDate = dateColumn ?? nextFree();
  const finalDescription = descriptionColumn ?? nextFree();
  const finalAmount: AmountMapping = amount ?? { kind: "signed", column: nextFree(), positiveIsMoneyIn };

  const dateValues = rows
    .slice(headerRow === null ? 0 : headerRow + 1)
    .slice(0, SAMPLE_ROWS)
    .map((row) => row[finalDate] ?? null);
  const { order, ambiguous } = detectDateOrder(dateValues);

  return {
    mapping: {
      headerRow,
      dateColumn: finalDate,
      descriptionColumn: finalDescription,
      amount: finalAmount,
      dateOrder: order,
    },
    dateOrderAmbiguous: ambiguous,
  };
};
