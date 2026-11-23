import type { Database } from "better-sqlite3";

/** A fiscal year that has been locked or closed at some point. */
export interface StoredFiscalYear {
  readonly id: number;
  readonly from: string;
  readonly to: string;
  readonly lockedAt: string | null;
  readonly closedAt: string | null;
  readonly closingEntryId: number | null;
}

/** Facts about the journal and staging the year-end screen needs. */
export interface YearActivity {
  /** Earliest date of any posted entry or staged row, if any. */
  readonly earliestDate: string | null;
  /** Latest date of any posted entry or staged row, if any. */
  readonly latestDate: string | null;
}

/**
 * Stores locked and closed fiscal years and client settings (FR-27, FR-28).
 */
export interface FiscalYearRepository {
  list(): StoredFiscalYear[];
  findByEnd(to: string): StoredFiscalYear | undefined;
  /** Stores a year (if new) and returns it. */
  ensure(from: string, to: string): StoredFiscalYear;
  setLocked(id: number, locked: boolean): void;
  setClosed(id: number, closingEntryId: number | null, closed: boolean): void;
  activity(): YearActivity;
  /** Unposted staged rows dated in a range. */
  countUnposted(from: string, to: string): number;
  /** Posted entries dated in a range. */
  countEntries(from: string, to: string): number;
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
}

interface YearRow {
  id: number;
  start_date: string;
  end_date: string;
  locked_at: string | null;
  closed_at: string | null;
  closing_entry_id: number | null;
}

const toYear = (row: YearRow): StoredFiscalYear => ({
  id: row.id,
  from: row.start_date,
  to: row.end_date,
  lockedAt: row.locked_at,
  closedAt: row.closed_at,
  closingEntryId: row.closing_entry_id,
});

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/**
 * Fiscal year repository over a client's SQLite database.
 */
export class SqliteFiscalYearRepository implements FiscalYearRepository {
  /**
   * @param db The client's open database.
   */
  public constructor(private readonly db: Database) {}

  /** @inheritdoc */
  public list(): StoredFiscalYear[] {
    return (this.db.prepare("SELECT * FROM fiscal_years ORDER BY end_date").all() as YearRow[]).map(toYear);
  }

  /** @inheritdoc */
  public findByEnd(to: string): StoredFiscalYear | undefined {
    const row = this.db.prepare("SELECT * FROM fiscal_years WHERE end_date = ?").get(to) as YearRow | undefined;
    return row ? toYear(row) : undefined;
  }

  /** @inheritdoc */
  public ensure(from: string, to: string): StoredFiscalYear {
    this.db.prepare("INSERT OR IGNORE INTO fiscal_years (start_date, end_date) VALUES (?, ?)").run(from, to);
    return this.findByEnd(to);
  }

  /** @inheritdoc */
  public setLocked(id: number, locked: boolean): void {
    this.db.prepare(`UPDATE fiscal_years SET locked_at = ${locked ? NOW : "NULL"} WHERE id = ?`).run(id);
  }

  /** @inheritdoc */
  public setClosed(id: number, closingEntryId: number | null, closed: boolean): void {
    this.db
      .prepare(`UPDATE fiscal_years SET closed_at = ${closed ? NOW : "NULL"}, closing_entry_id = ? WHERE id = ?`)
      .run(closingEntryId, id);
  }

  /** @inheritdoc */
  public activity(): YearActivity {
    const row = this.db
      .prepare(
        `SELECT min(d) AS earliestDate, max(d) AS latestDate FROM (
           SELECT entry_date AS d FROM journal_entries
           UNION ALL SELECT txn_date AS d FROM staged_transactions
         )`,
      )
      .get() as YearActivity;
    return row;
  }

  /** @inheritdoc */
  public countUnposted(from: string, to: string): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM staged_transactions WHERE status = 'staged' AND txn_date BETWEEN ? AND ?")
        .get(from, to) as { n: number }
    ).n;
  }

  /** @inheritdoc */
  public countEntries(from: string, to: string): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE entry_date BETWEEN ? AND ?").get(from, to) as { n: number }
    ).n;
  }

  /** @inheritdoc */
  public getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM client_settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  /** @inheritdoc */
  public setSetting(key: string, value: string): void {
    this.db
      .prepare("INSERT INTO client_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }
}
