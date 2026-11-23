import type { Database } from "better-sqlite3";

/** A confirmed transfer: two staged row ids. */
export interface TransferMatch {
  readonly id: number;
  readonly firstRowId: number;
  readonly secondRowId: number;
}

/**
 * Stores one client's confirmed transfers (FR-19).
 */
export interface TransferMatchRepository {
  /** Every confirmed transfer, oldest first. */
  list(): TransferMatch[];
  /** One confirmed transfer. */
  find(matchId: number): TransferMatch | undefined;
  /** Stores a pair; returns its id. Neither row may already be in a pair. */
  insert(firstRowId: number, secondRowId: number): number;
  /** Removes a pair. */
  delete(matchId: number): void;
}

interface MatchRow {
  id: number;
  first_row_id: number;
  second_row_id: number;
}

const toMatch = (row: MatchRow): TransferMatch => ({
  id: row.id,
  firstRowId: row.first_row_id,
  secondRowId: row.second_row_id,
});

/**
 * Transfer match repository over a client's SQLite database.
 */
export class SqliteTransferMatchRepository implements TransferMatchRepository {
  /**
   * @param db The client's open database.
   */
  public constructor(private readonly db: Database) {}

  /** @inheritdoc */
  public list(): TransferMatch[] {
    return (this.db.prepare("SELECT id, first_row_id, second_row_id FROM transfer_matches ORDER BY id").all() as MatchRow[]).map(toMatch);
  }

  /** @inheritdoc */
  public find(matchId: number): TransferMatch | undefined {
    const row = this.db
      .prepare("SELECT id, first_row_id, second_row_id FROM transfer_matches WHERE id = ?")
      .get(matchId) as MatchRow | undefined;
    return row ? toMatch(row) : undefined;
  }

  /** @inheritdoc */
  public insert(firstRowId: number, secondRowId: number): number {
    return Number(
      this.db
        .prepare("INSERT INTO transfer_matches (first_row_id, second_row_id) VALUES (?, ?)")
        .run(firstRowId, secondRowId).lastInsertRowid,
    );
  }

  /** @inheritdoc */
  public delete(matchId: number): void {
    this.db.prepare("DELETE FROM transfer_matches WHERE id = ?").run(matchId);
  }
}
