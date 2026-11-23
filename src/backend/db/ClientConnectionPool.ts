import type { Database } from "better-sqlite3";

import type { ClientId } from "../../common/clients/clientSchemas";
import type { ClientDatabaseFactory } from "./ClientDatabaseFactory";
import { UserFacingError } from "../errors";
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
   * Returns the open connection for an existing client, opening its database
   * file if needed.
   * @param clientId The client's id.
   * @throws UserFacingError if the client has no database file.
   */
  public get(clientId: ClientId): Database {
    const existing = this.connections.get(clientId);
    if (existing) {
      return existing;
    }
    if (!this.fileStore.exists(clientId)) {
      throw new UserFacingError("That client no longer exists.");
    }
    return this.open(clientId);
  }

  /**
   * Creates the database file for a new client and returns its connection.
   * @param clientId An id from `ClientFileStore.newClientId()`.
   * @throws Error if the client already has a database file.
   */
  public create(clientId: ClientId): Database {
    if (this.fileStore.exists(clientId)) {
      throw new Error(`Client ${clientId} already has a database file.`);
    }
    this.fileStore.ensureDirectory();
    return this.open(clientId);
  }

  private open(clientId: ClientId): Database {
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
