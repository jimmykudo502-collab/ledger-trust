import type { Database } from "better-sqlite3";

import type { AccountType } from "../../common/accounts/accountSchemas";
import type { JournalSource } from "../../common/journal/journalSchemas";
import type { AccountBalance } from "../../common/reports/reportSchemas";
import type { RawLedgerLine } from "../reports/reportBuilders";

/** Which posted lines a report reads. */
export interface ReportQuery {
  readonly from: string;
  readonly to: string;
  /** Include year-end closing entries dated within the range. */
  readonly includeClosingEntries: boolean;
}

/**
 * Reads balances and lines straight from posted journal lines (FR-31).
 * Nothing here is stored separately.
 */
export interface ReportRepository {
  /** Every account's opening, period and closing balances. */
  balances(query: ReportQuery): AccountBalance[];
  /** Posted lines within the range in date order, optionally for one account. */
  ledgerLines(query: ReportQuery, accountId: number | null): RawLedgerLine[];
}

interface BalanceRow {
  accountId: number;
  code: string;
  name: string;
  type: AccountType;
  opening: number;
  debit: number;
  credit: number;
}

interface LineRow {
  accountId: number;
  entryId: number;
  date: string;
  description: string;
  source: JournalSource;
  tabName: string | null;
  memo: string | null;
  debitCents: number;
  creditCents: number;
}

const SOURCE_LABELS: Record<JournalSource, string> = {
  bank_import: "Bank",
  manual: "Manual entry",
  reversal: "Reversing entry",
  year_end_close: "Year-end close",
  opening_balance: "Opening balance",
};

/**
 * Report repository over a client's SQLite database.
 */
export class SqliteReportRepository implements ReportRepository {
  /**
   * @param db The client's open database.
   */
  public constructor(private readonly db: Database) {}

  /** @inheritdoc */
  public balances(query: ReportQuery): AccountBalance[] {
    const inPeriod = "e.entry_date BETWEEN @from AND @to AND (@includeClosing = 1 OR e.source <> 'year_end_close')";
    const rows = this.db
      .prepare(
        `SELECT a.id AS accountId, a.code, a.name, a.type,
                coalesce(sum(CASE WHEN e.entry_date < @from THEN l.debit_cents - l.credit_cents END), 0) AS opening,
                coalesce(sum(CASE WHEN ${inPeriod} THEN l.debit_cents END), 0) AS debit,
                coalesce(sum(CASE WHEN ${inPeriod} THEN l.credit_cents END), 0) AS credit
         FROM accounts a
         LEFT JOIN journal_lines l ON l.account_id = a.id
         LEFT JOIN journal_entries e ON e.id = l.journal_entry_id
         GROUP BY a.id`,
      )
      .all(this.params(query)) as BalanceRow[];
    return rows.map((row) => ({
      accountId: row.accountId,
      code: row.code,
      name: row.name,
      type: row.type,
      openingCents: row.opening,
      debitCents: row.debit,
      creditCents: row.credit,
      closingCents: row.opening + row.debit - row.credit,
    }));
  }

  /** @inheritdoc */
  public ledgerLines(query: ReportQuery, accountId: number | null): RawLedgerLine[] {
    const rows = this.db
      .prepare(
        `SELECT l.account_id AS accountId, e.id AS entryId, e.entry_date AS date, e.description, e.source,
                b.name AS tabName, l.memo, l.debit_cents AS debitCents, l.credit_cents AS creditCents
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.journal_entry_id
         LEFT JOIN staged_transactions t ON t.id = e.staged_transaction_id
         LEFT JOIN import_batches ib ON ib.id = t.import_batch_id
         LEFT JOIN bank_accounts b ON b.id = ib.bank_account_id
         WHERE e.entry_date BETWEEN @from AND @to
           AND (@includeClosing = 1 OR e.source <> 'year_end_close')
           AND (@accountId IS NULL OR l.account_id = @accountId)
         ORDER BY e.entry_date, e.id, l.line_number`,
      )
      .all({ ...this.params(query), accountId }) as LineRow[];
    return rows.map(({ tabName, ...row }) => ({
      ...row,
      sourceLabel: row.source === "bank_import" && tabName ? tabName : SOURCE_LABELS[row.source],
    }));
  }

  private params(query: ReportQuery) {
    return { from: query.from, to: query.to, includeClosing: query.includeClosingEntries ? 1 : 0 };
  }
}
