import type { Database } from "better-sqlite3";

import type { StagedRowInput } from "../../common/imports/importSchemas";
import type {
  ImportBatch,
  ImportSourceKind,
  StagedTransaction,
} from "../../common/staging/stagingSchemas";

/** A row to stage, with the spreadsheet row it came from (FR-22). */
export interface NewStagedRow extends StagedRowInput {
  readonly rowNumber: number;
}

/** An import batch's ownership and posting state. */
export interface BatchInfo {
  readonly id: number;
  readonly bankAccountId: number;
  readonly postedCount: number;
}

/**
 * Stores import batches and their staged rows for one client (FR-13).
 */
export interface StagingRepository {
  /** A tab's batches with their rows, newest first. */
  listBatches(bankAccountId: number): ImportBatch[];
  /** Every transaction already imported into a tab, for duplicate checks. */
  existingTransactions(bankAccountId: number): StagedRowInput[];
  /** Stores a batch and its rows in one transaction; returns the batch id. */
  insertBatch(
    bankAccountId: number,
    source: { kind: ImportSourceKind; name: string | null },
    rows: readonly NewStagedRow[],
  ): number;
  /** One batch's ownership and posting state. */
  findBatch(batchId: number): BatchInfo | undefined;
  /** Deletes a batch and its rows. */
  deleteBatch(batchId: number): void;
}

interface BatchRow {
  id: number;
  source_kind: ImportSourceKind;
  source_name: string | null;
  created_at: string;
}

interface TransactionRow {
  id: number;
  import_batch_id: number;
  row_number: number;
  txn_date: string;
  description: string;
  amount_cents: number;
  status: "staged" | "posted";
}

/**
 * Staging repository over a client's SQLite database.
 */
export class SqliteStagingRepository implements StagingRepository {
  /**
   * @param db The client's open database.
   */
  public constructor(private readonly db: Database) {}

  /** @inheritdoc */
  public listBatches(bankAccountId: number): ImportBatch[] {
    const batches = this.db
      .prepare(
        "SELECT id, source_kind, source_name, created_at FROM import_batches WHERE bank_account_id = ? ORDER BY id DESC",
      )
      .all(bankAccountId) as BatchRow[];
    const rows = this.db
      .prepare(
        `SELECT t.id, t.import_batch_id, t.row_number, t.txn_date, t.description, t.amount_cents, t.status
         FROM staged_transactions t JOIN import_batches b ON b.id = t.import_batch_id
         WHERE b.bank_account_id = ? ORDER BY t.row_number`,
      )
      .all(bankAccountId) as TransactionRow[];

    const byBatch = new Map<number, StagedTransaction[]>();
    for (const row of rows) {
      const list = byBatch.get(row.import_batch_id) ?? [];
      list.push({
        id: row.id,
        rowNumber: row.row_number,
        date: row.txn_date,
        description: row.description,
        amountCents: row.amount_cents,
        status: row.status,
      });
      byBatch.set(row.import_batch_id, list);
    }
    return batches.map((batch) => ({
      id: batch.id,
      sourceKind: batch.source_kind,
      sourceName: batch.source_name,
      createdAt: batch.created_at,
      rows: byBatch.get(batch.id) ?? [],
    }));
  }

  /** @inheritdoc */
  public existingTransactions(bankAccountId: number): StagedRowInput[] {
    return (
      this.db
        .prepare(
          `SELECT t.txn_date AS date, t.description, t.amount_cents AS amountCents
           FROM staged_transactions t JOIN import_batches b ON b.id = t.import_batch_id
           WHERE b.bank_account_id = ?`,
        )
        .all(bankAccountId) as StagedRowInput[]
    );
  }

  /** @inheritdoc */
  public insertBatch(
    bankAccountId: number,
    source: { kind: ImportSourceKind; name: string | null },
    rows: readonly NewStagedRow[],
  ): number {
    return this.db.transaction(() => {
      const batchId = Number(
        this.db
          .prepare("INSERT INTO import_batches (bank_account_id, source_kind, source_name) VALUES (?, ?, ?)")
          .run(bankAccountId, source.kind, source.name).lastInsertRowid,
      );
      const insert = this.db.prepare(
        `INSERT INTO staged_transactions (import_batch_id, row_number, txn_date, description, amount_cents)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const row of rows) {
        insert.run(batchId, row.rowNumber, row.date, row.description, row.amountCents);
      }
      return batchId;
    })();
  }

  /** @inheritdoc */
  public findBatch(batchId: number): BatchInfo | undefined {
    const row = this.db
      .prepare(
        `SELECT b.id, b.bank_account_id AS bankAccountId,
                (SELECT COUNT(*) FROM staged_transactions t WHERE t.import_batch_id = b.id AND t.status = 'posted') AS postedCount
         FROM import_batches b WHERE b.id = ?`,
      )
      .get(batchId) as BatchInfo | undefined;
    return row;
  }

  /** @inheritdoc */
  public deleteBatch(batchId: number): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM staged_transactions WHERE import_batch_id = ?").run(batchId);
      this.db.prepare("DELETE FROM import_batches WHERE id = ?").run(batchId);
    })();
  }
}
