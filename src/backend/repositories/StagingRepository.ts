import type { Database } from "better-sqlite3";

import type { StagedRowInput } from "../../common/imports/importSchemas";
import type {
  ImportBatch,
  ImportSourceKind,
  StagedStatus,
  StagedTransaction,
} from "../../common/staging/stagingSchemas";

/** A row to stage, with the spreadsheet row it came from (FR-22). */
export interface NewStagedRow extends StagedRowInput {
  readonly rowNumber: number;
  /** Code applied by a remembered rule (FR-18), if any. */
  readonly offsetAccountId?: number | null;
}

/** A staged row together with the tab it belongs to. */
export interface StagedRowRecord extends StagedTransaction {
  readonly bankAccountId: number;
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
  /** A tab's rows across all imports, by date. */
  listRows(bankAccountId: number): StagedTransaction[];
  /** Specific rows by id, with their tab. Unknown ids are left out. */
  findRows(rowIds: readonly number[]): StagedRowRecord[];
  /** Every transaction already imported into a tab, for duplicate checks. */
  existingTransactions(bankAccountId: number): StagedRowInput[];
  /** Stores a batch and its rows in one transaction; returns the batch id. */
  insertBatch(
    bankAccountId: number,
    source: { kind: ImportSourceKind; name: string | null },
    rows: readonly NewStagedRow[],
  ): number;
  /** Sets (or clears) the coded account on rows. */
  setOffsetAccount(rowIds: readonly number[], accountId: number | null): void;
  /** Marks a row staged or posted. */
  setStatus(rowId: number, status: StagedStatus): void;
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
  bank_account_id: number;
  row_number: number;
  txn_date: string;
  description: string;
  amount_cents: number;
  offset_account_id: number | null;
  status: StagedStatus;
}

const SELECT_ROWS = `
  SELECT t.id, t.import_batch_id, b.bank_account_id, t.row_number, t.txn_date, t.description,
         t.amount_cents, t.offset_account_id, t.status
  FROM staged_transactions t JOIN import_batches b ON b.id = t.import_batch_id`;

const toTransaction = (row: TransactionRow): StagedRowRecord => ({
  id: row.id,
  batchId: row.import_batch_id,
  bankAccountId: row.bank_account_id,
  rowNumber: row.row_number,
  date: row.txn_date,
  description: row.description,
  amountCents: row.amount_cents,
  offsetAccountId: row.offset_account_id,
  status: row.status,
});

const withoutTab = (row: StagedRowRecord): StagedTransaction => ({
  id: row.id,
  batchId: row.batchId,
  rowNumber: row.rowNumber,
  date: row.date,
  description: row.description,
  amountCents: row.amountCents,
  offsetAccountId: row.offsetAccountId,
  status: row.status,
});

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
    const rows = (
      this.db
        .prepare(`${SELECT_ROWS} WHERE b.bank_account_id = ? ORDER BY t.row_number`)
        .all(bankAccountId) as TransactionRow[]
    ).map(toTransaction);

    return batches.map((batch) => ({
      id: batch.id,
      sourceKind: batch.source_kind,
      sourceName: batch.source_name,
      createdAt: batch.created_at,
      rows: rows.filter((row) => row.batchId === batch.id).map(withoutTab),
    }));
  }

  /** @inheritdoc */
  public listRows(bankAccountId: number): StagedTransaction[] {
    return (
      this.db
        .prepare(`${SELECT_ROWS} WHERE b.bank_account_id = ? ORDER BY t.txn_date, t.id`)
        .all(bankAccountId) as TransactionRow[]
    ).map((row) => withoutTab(toTransaction(row)));
  }

  /** @inheritdoc */
  public findRows(rowIds: readonly number[]): StagedRowRecord[] {
    if (rowIds.length === 0) return [];
    const find = this.db.prepare(`${SELECT_ROWS} WHERE t.id = ?`);
    return rowIds
      .map((id) => find.get(id) as TransactionRow | undefined)
      .filter((row): row is TransactionRow => row !== undefined)
      .map(toTransaction);
  }

  /** @inheritdoc */
  public existingTransactions(bankAccountId: number): StagedRowInput[] {
    return this.db
      .prepare(
        `SELECT t.txn_date AS date, t.description, t.amount_cents AS amountCents
         FROM staged_transactions t JOIN import_batches b ON b.id = t.import_batch_id
         WHERE b.bank_account_id = ?`,
      )
      .all(bankAccountId) as StagedRowInput[];
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
        `INSERT INTO staged_transactions (import_batch_id, row_number, txn_date, description, amount_cents, offset_account_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const row of rows) {
        insert.run(batchId, row.rowNumber, row.date, row.description, row.amountCents, row.offsetAccountId ?? null);
      }
      return batchId;
    })();
  }

  /** @inheritdoc */
  public setOffsetAccount(rowIds: readonly number[], accountId: number | null): void {
    const update = this.db.prepare("UPDATE staged_transactions SET offset_account_id = ? WHERE id = ?");
    this.db.transaction(() => {
      for (const id of rowIds) update.run(accountId, id);
    })();
  }

  /** @inheritdoc */
  public setStatus(rowId: number, status: StagedStatus): void {
    this.db.prepare("UPDATE staged_transactions SET status = ? WHERE id = ?").run(status, rowId);
  }

  /** @inheritdoc */
  public findBatch(batchId: number): BatchInfo | undefined {
    return this.db
      .prepare(
        `SELECT b.id, b.bank_account_id AS bankAccountId,
                (SELECT COUNT(*) FROM staged_transactions t WHERE t.import_batch_id = b.id AND t.status = 'posted') AS postedCount
         FROM import_batches b WHERE b.id = ?`,
      )
      .get(batchId) as BatchInfo | undefined;
  }

  /** @inheritdoc */
  public deleteBatch(batchId: number): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM staged_transactions WHERE import_batch_id = ?").run(batchId);
      this.db.prepare("DELETE FROM import_batches WHERE id = ?").run(batchId);
    })();
  }
}
