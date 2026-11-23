import type { Database } from "better-sqlite3";

import type { JournalEntryInput } from "../../common/journal/journalSchemas";

/**
 * Stores one client's journal: entries and their lines. The journal is the
 * single source of truth; balances are always computed from its lines.
 * Callers validate entries (balanced, accounts exist) before storing them.
 */
export interface JournalRepository {
  /** Stores an entry and its lines; returns the entry id. */
  insert(entry: JournalEntryInput): number;
  /** Deletes an entry and its lines. */
  delete(entryId: number): void;
  /** The entry posted from a staged bank row, if any. */
  findByStagedTransaction(stagedTransactionId: number): number | undefined;
  /** An account's balance as debits minus credits, in cents. */
  accountBalance(accountId: number): number;
}

/**
 * Journal repository over a client's SQLite database.
 */
export class SqliteJournalRepository implements JournalRepository {
  /**
   * @param db The client's open database.
   */
  public constructor(private readonly db: Database) {}

  /** @inheritdoc */
  public insert(entry: JournalEntryInput): number {
    return this.db.transaction(() => {
      const entryId = Number(
        this.db
          .prepare(
            "INSERT INTO journal_entries (entry_date, description, source, staged_transaction_id) VALUES (?, ?, ?, ?)",
          )
          .run(entry.date, entry.description, entry.source, entry.stagedTransactionId ?? null)
          .lastInsertRowid,
      );
      const insertLine = this.db.prepare(
        `INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit_cents, credit_cents, memo)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      entry.lines.forEach((line, index) => {
        insertLine.run(entryId, index + 1, line.accountId, line.debitCents, line.creditCents, line.memo ?? null);
      });
      return entryId;
    })();
  }

  /** @inheritdoc */
  public delete(entryId: number): void {
    this.db.prepare("DELETE FROM journal_entries WHERE id = ?").run(entryId);
  }

  /** @inheritdoc */
  public findByStagedTransaction(stagedTransactionId: number): number | undefined {
    const row = this.db
      .prepare("SELECT id FROM journal_entries WHERE staged_transaction_id = ?")
      .get(stagedTransactionId) as { id: number } | undefined;
    return row?.id;
  }

  /** @inheritdoc */
  public accountBalance(accountId: number): number {
    const row = this.db
      .prepare(
        "SELECT coalesce(sum(debit_cents), 0) - coalesce(sum(credit_cents), 0) AS balance FROM journal_lines WHERE account_id = ?",
      )
      .get(accountId) as { balance: number };
    return row.balance;
  }
}
