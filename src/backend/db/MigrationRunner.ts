import type { Database } from "better-sqlite3";

import type { Migration } from "./Migration";

/**
 * Applies schema migrations to a SQLite database, tracking progress in
 * `PRAGMA user_version`. Each migration runs in its own transaction, so a
 * failure leaves the database at the last fully applied version.
 */
export class MigrationRunner {
  private readonly migrations: readonly Migration[];

  /**
   * @param migrations Migrations ordered by version, starting at 1 with no gaps.
   * @throws Error if the versions are not 1, 2, 3, ... in order.
   */
  public constructor(migrations: readonly Migration[]) {
    migrations.forEach((migration, index) => {
      if (migration.version !== index + 1) {
        throw new Error(
          `Migration "${migration.name}" has version ${migration.version}; expected ${index + 1}.`,
        );
      }
    });
    this.migrations = migrations;
  }

  /** The version a database is at once every migration has been applied. */
  public get latestVersion(): number {
    return this.migrations.length;
  }

  /**
   * Reads the schema version currently recorded in the database.
   * @param db The database to inspect.
   * @returns The value of `PRAGMA user_version`.
   */
  public currentVersion(db: Database): number {
    return db.pragma("user_version", { simple: true }) as number;
  }

  /**
   * Applies every migration newer than the database's current version.
   * Safe to call repeatedly: an up-to-date database is left untouched.
   * @param db The database to migrate.
   * @returns The versions that were applied, in order.
   * @throws Error if the database was written by a newer version of the app.
   */
  public migrate(db: Database): number[] {
    const current = this.currentVersion(db);
    if (current > this.latestVersion) {
      throw new Error(
        `Database schema version ${current} is newer than this app supports (${this.latestVersion}).`,
      );
    }

    const pending = this.migrations.slice(current);
    for (const migration of pending) {
      db.transaction(() => {
        db.exec(migration.sql);
        db.pragma(`user_version = ${migration.version}`);
      })();
    }
    return pending.map((migration) => migration.version);
  }
}
