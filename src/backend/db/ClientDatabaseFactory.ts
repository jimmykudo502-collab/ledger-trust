import Database from "better-sqlite3";

import { CLIENT_MIGRATIONS } from "./clientMigrations";
import { MigrationRunner } from "./MigrationRunner";

/** Path SQLite understands as a private, throwaway in-memory database. */
export const IN_MEMORY_DATABASE = ":memory:";

/**
 * Opens client database files (one SQLite file per client, FR-2) with the
 * connection settings the app relies on, and brings the schema up to date.
 */
export class ClientDatabaseFactory {
  /**
   * @param migrationRunner Runner holding the client schema migrations.
   */
  public constructor(
    private readonly migrationRunner: MigrationRunner = new MigrationRunner(
      CLIENT_MIGRATIONS,
    ),
  ) {}

  /**
   * Opens (creating if needed) a client database and migrates it.
   * @param filePath Path to the client's `.sqlite` file, or
   *   {@link IN_MEMORY_DATABASE} for tests.
   * @returns An open connection with foreign keys enforced. The caller owns it
   *   and must call `close()` when done.
   */
  public open(filePath: string): Database.Database {
    const db = new Database(filePath);
    try {
      db.pragma("foreign_keys = ON");
      // Keep SQLite's default rollback journal (not WAL) so a closed client
      // database is one self-contained file that can be copied as a backup.
      this.migrationRunner.migrate(db);
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }
}
