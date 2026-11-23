import type { Database } from "better-sqlite3";

import type {
  JournalEntryInput,
  JournalEntryView,
  JournalLineView,
  JournalSource,
} from "../../common/journal/journalSchemas";

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
  /** Entries from the given sources with their lines, newest first. */
  listEntries(sources: readonly JournalSource[]): JournalEntryView[];
  /** One entry with its lines. */
  findEntry(entryId: number): JournalEntryView | undefined;
  /** Replaces an entry's date, description and lines, keeping its id. */
  replace(entryId: number, entry: JournalEntryInput): void;
}

interface EntryRow {
  id: number;
  entry_date: string;
  description: string;
  source: JournalSource;
  staged_transaction_id: number | null;
  reverses_entry_id: number | null;
  reversed_by: number | null;
}

interface LineRow extends Omit<JournalLineView, "memo"> {
  journalEntryId: number;
  memo: string | null;
}

const SELECT_ENTRIES = `
  SELECT e.id, e.entry_date, e.description, e.source, e.staged_transaction_id, e.reverses_entry_id,
         (SELECT r.id FROM journal_entries r WHERE r.reverses_entry_id = e.id) AS reversed_by
  FROM journal_entries e`;

const SELECT_LINES = `
  SELECT l.journal_entry_id AS journalEntryId, l.line_number AS lineNumber, l.account_id AS accountId,
         a.code AS accountCode, a.name AS accountName, l.debit_cents AS debitCents,
         l.credit_cents AS creditCents, l.memo
  FROM journal_lines l JOIN accounts a ON a.id = l.account_id`;

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
            "INSERT INTO journal_entries (entry_date, description, source, staged_transaction_id, reverses_entry_id) VALUES (?, ?, ?, ?, ?)",
          )
          .run(entry.date, entry.description, entry.source, entry.stagedTransactionId ?? null, entry.reversesEntryId ?? null)
          .lastInsertRowid,
      );
      this.insertLines(entryId, entry);
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
  public listEntries(sources: readonly JournalSource[]): JournalEntryView[] {
    if (sources.length === 0) return [];
    const placeholders = sources.map(() => "?").join(", ");
    const entries = this.db
      .prepare(`${SELECT_ENTRIES} WHERE e.source IN (${placeholders}) ORDER BY e.entry_date DESC, e.id DESC`)
      .all(...sources) as EntryRow[];
    const lines = this.db
      .prepare(
        `${SELECT_LINES} JOIN journal_entries e ON e.id = l.journal_entry_id
         WHERE e.source IN (${placeholders}) ORDER BY l.journal_entry_id, l.line_number`,
      )
      .all(...sources) as LineRow[];
    return this.assemble(entries, lines);
  }

  /** @inheritdoc */
  public findEntry(entryId: number): JournalEntryView | undefined {
    const entries = this.db.prepare(`${SELECT_ENTRIES} WHERE e.id = ?`).all(entryId) as EntryRow[];
    const lines = this.db
      .prepare(`${SELECT_LINES} WHERE l.journal_entry_id = ? ORDER BY l.line_number`)
      .all(entryId) as LineRow[];
    return this.assemble(entries, lines)[0];
  }

  /** @inheritdoc */
  public replace(entryId: number, entry: JournalEntryInput): void {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE journal_entries SET entry_date = ?, description = ? WHERE id = ?")
        .run(entry.date, entry.description, entryId);
      this.db.prepare("DELETE FROM journal_lines WHERE journal_entry_id = ?").run(entryId);
      this.insertLines(entryId, entry);
    })();
  }

  private assemble(entries: EntryRow[], lines: LineRow[]): JournalEntryView[] {
    const byEntry = new Map<number, JournalLineView[]>();
    for (const { journalEntryId, ...line } of lines) {
      byEntry.set(journalEntryId, [...(byEntry.get(journalEntryId) ?? []), line]);
    }
    return entries.map((row) => ({
      id: row.id,
      date: row.entry_date,
      description: row.description,
      source: row.source,
      stagedTransactionId: row.staged_transaction_id,
      reversesEntryId: row.reverses_entry_id,
      reversedByEntryId: row.reversed_by,
      lines: byEntry.get(row.id) ?? [],
    }));
  }

  private insertLines(entryId: number, entry: JournalEntryInput): void {
    const insertLine = this.db.prepare(
      `INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit_cents, credit_cents, memo)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    entry.lines.forEach((line, index) => {
      insertLine.run(entryId, index + 1, line.accountId, line.debitCents, line.creditCents, line.memo ?? null);
    });
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
