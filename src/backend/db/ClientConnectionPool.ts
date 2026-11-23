import type { Database } from "better-sqlite3";

import type { ClientId } from "../../common/clients/clientSchemas";
import type { ClientDatabaseFactory } from "./ClientDatabaseFactory";
import type { ClientFileStore } from "./ClientFileStore";

/**
 * Keeps one open connection per client database, opening each lazily on
 * first use. Call {@link closeAll} when the app quits.
 */
export class ClientConnectionPool {
  private readonly connections = new Map<ClientId, Database>();

  /**
   * @param fileStore Resolves client ids to database files.
   * @param factory Opens and migrates database files.
   */
  public constructor(
    private readonly fileStore: ClientFileStore,
    private readonly factory: ClientDatabaseFactory,
  ) {}

  /**
   * Returns the open connection for a client, opening (and creating) its
   * database file if needed.
   * @param clientId The client's id.
   */
  public get(clientId: ClientId): Database {
    const existing = this.connections.get(clientId);
    if (existing) {
      return existing;
    }
    this.fileStore.ensureDirectory();
    const db = this.factory.open(this.fileStore.pathFor(clientId));
    this.connections.set(clientId, db);
    return db;
  }

  /**
   * Closes every open connection.
   */
  public closeAll(): void {
    for (const db of this.connections.values()) {
      db.close();
    }
    this.connections.clear();
  }
}
