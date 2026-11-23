/**
 * One step in the evolution of a client database schema.
 *
 * Versions start at 1 and increase by exactly 1 per migration. The applied
 * version is tracked in SQLite's `PRAGMA user_version`.
 */
export interface Migration {
  /** Schema version this migration brings the database to. */
  readonly version: number;
  /** Short human-readable description, used in error messages. */
  readonly name: string;
  /** SQL executed inside a transaction to apply the migration. */
  readonly sql: string;
}
