import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ClientConnectionPool } from "../db/ClientConnectionPool";
import { ClientDatabaseFactory } from "../db/ClientDatabaseFactory";
import { ClientFileStore } from "../db/ClientFileStore";
import type { TransactionRunner } from "../db/TransactionRunner";
import { SqliteClientRepository } from "../repositories/SqliteClientRepository";

/**
 * A throwaway folder of client databases for tests. Call {@link dispose}
 * afterwards to close connections and delete the folder.
 */
export class TempClientWorkspace {
  public readonly directory: string;
  public readonly fileStore: ClientFileStore;
  public readonly pool: ClientConnectionPool;
  public readonly clients: SqliteClientRepository;

  public constructor() {
    this.directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "ledger-trust-test-"),
    );
    this.fileStore = new ClientFileStore(this.directory);
    this.pool = new ClientConnectionPool(
      this.fileStore,
      new ClientDatabaseFactory(),
    );
    this.clients = new SqliteClientRepository(this.fileStore, this.pool);
  }

  /** Runs work in one transaction on a client's database. */
  public readonly inTransaction: TransactionRunner = (clientId, work) =>
    this.pool.get(clientId).transaction(work)();

  /** Closes every connection and deletes the folder. */
  public dispose(): void {
    this.pool.closeAll();
    fs.rmSync(this.directory, { recursive: true, force: true });
  }
}
