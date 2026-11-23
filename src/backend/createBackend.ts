import path from "node:path";

import { ClientConnectionPool } from "./db/ClientConnectionPool";
import { ClientDatabaseFactory } from "./db/ClientDatabaseFactory";
import { ClientFileStore } from "./db/ClientFileStore";
import { SqliteClientRepository } from "./repositories/SqliteClientRepository";
import { ClientService } from "./services/ClientService";

/** The wired-up backend services plus a way to shut them down. */
export interface Backend {
  readonly clients: ClientService;
  /** Closes every open client database. */
  dispose(): void;
}

/**
 * Composition root: builds the backend services and their dependencies.
 * @param dataDirectory Folder for app data (Electron's `userData`); client
 *   databases go in its `clients` subfolder.
 */
export const createBackend = (dataDirectory: string): Backend => {
  const fileStore = new ClientFileStore(path.join(dataDirectory, "clients"));
  const pool = new ClientConnectionPool(fileStore, new ClientDatabaseFactory());
  const clients = new ClientService(
    new SqliteClientRepository(fileStore, pool),
  );

  return {
    clients,
    dispose: () => pool.closeAll(),
  };
};
