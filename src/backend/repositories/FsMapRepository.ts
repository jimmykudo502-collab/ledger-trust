import type { Database } from "better-sqlite3";

import type { FsAssignment, FsLine, FsLineInput, FsMap, FsSection } from "../../common/fsMaps/fsMapSchemas";
import { UserFacingError } from "../errors";

/**
 * Stores one client's FS map lines and account assignments (FR-33, FR-34).
 * Inputs are already validated and business rules are enforced by the
 * service; implementations only store and retrieve.
 */
export interface FsMapRepository {
  /** Every line of both maps, in no particular order. */
  listLines(): FsLine[];
  /** One line by id. */
  findLine(lineId: number): FsLine | undefined;
  /** One line by its exact map number on a map. */
  findLineByCode(map: FsMap, code: string): FsLine | undefined;
  /** Stores a new line and returns it. */
  insertLine(map: FsMap, line: FsLineInput): FsLine;
  /** Replaces a line's number, name and section and returns it. */
  updateLine(lineId: number, line: FsLineInput): FsLine;
  /** Removes a line and its assignments. */
  deleteLine(lineId: number): void;
  /** Every account's lines (accounts with neither are included with nulls). */
  assignments(): FsAssignment[];
  /** Account ids mapped to a line. */
  accountsOnLine(lineId: number): number[];
  /** Maps an account to a line on a map, or unmaps it with null. */
  assign(accountId: number, map: FsMap, lineId: number | null): void;
}

interface LineRow {
  id: number;
  map: FsMap;
  code: string;
  name: string;
  section: FsSection;
  account_count: number;
}

const SELECT_LINES = `
  SELECT f.id, f.map, f.code, f.name, f.section,
         (SELECT count(*) FROM account_fs_lines a WHERE a.fs_line_id = f.id) AS account_count
  FROM fs_lines f`;

/**
 * FS map repository over a client's SQLite database.
 */
export class SqliteFsMapRepository implements FsMapRepository {
  /**
   * @param db The client's open database.
   */
  public constructor(private readonly db: Database) {}

  /** @inheritdoc */
  public listLines(): FsLine[] {
    return (this.db.prepare(SELECT_LINES).all() as LineRow[]).map(toLine);
  }

  /** @inheritdoc */
  public findLine(lineId: number): FsLine | undefined {
    const row = this.db.prepare(`${SELECT_LINES} WHERE f.id = ?`).get(lineId) as LineRow | undefined;
    return row ? toLine(row) : undefined;
  }

  /** @inheritdoc */
  public findLineByCode(map: FsMap, code: string): FsLine | undefined {
    const row = this.db.prepare(`${SELECT_LINES} WHERE f.map = ? AND f.code = ?`).get(map, code) as LineRow | undefined;
    return row ? toLine(row) : undefined;
  }

  /** @inheritdoc */
  public insertLine(map: FsMap, line: FsLineInput): FsLine {
    const { lastInsertRowid } = this.db
      .prepare("INSERT INTO fs_lines (map, code, name, section) VALUES (?, ?, ?, ?)")
      .run(map, line.code, line.name, line.section);
    return this.require(Number(lastInsertRowid));
  }

  /** @inheritdoc */
  public updateLine(lineId: number, line: FsLineInput): FsLine {
    this.db
      .prepare("UPDATE fs_lines SET code = ?, name = ?, section = ? WHERE id = ?")
      .run(line.code, line.name, line.section, lineId);
    return this.require(lineId);
  }

  /** @inheritdoc */
  public deleteLine(lineId: number): void {
    this.db.prepare("DELETE FROM fs_lines WHERE id = ?").run(lineId);
  }

  /** @inheritdoc */
  public assignments(): FsAssignment[] {
    return this.db
      .prepare(
        `SELECT a.id AS accountId,
                (SELECT fs_line_id FROM account_fs_lines m WHERE m.account_id = a.id AND m.map = 'internal') AS internal,
                (SELECT fs_line_id FROM account_fs_lines m WHERE m.account_id = a.id AND m.map = 'external') AS external
         FROM accounts a`,
      )
      .all() as FsAssignment[];
  }

  /** @inheritdoc */
  public accountsOnLine(lineId: number): number[] {
    return (this.db.prepare("SELECT account_id FROM account_fs_lines WHERE fs_line_id = ?").all(lineId) as { account_id: number }[]).map(
      (row) => row.account_id,
    );
  }

  /** @inheritdoc */
  public assign(accountId: number, map: FsMap, lineId: number | null): void {
    if (lineId === null) {
      this.db.prepare("DELETE FROM account_fs_lines WHERE account_id = ? AND map = ?").run(accountId, map);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO account_fs_lines (account_id, map, fs_line_id) VALUES (?, ?, ?)
         ON CONFLICT (account_id, map) DO UPDATE SET fs_line_id = excluded.fs_line_id`,
      )
      .run(accountId, map, lineId);
  }

  private require(lineId: number): FsLine {
    const line = this.findLine(lineId);
    if (!line) throw new UserFacingError("That FS line no longer exists.");
    return line;
  }
}

const toLine = (row: LineRow): FsLine => ({
  id: row.id,
  map: row.map,
  code: row.code,
  name: row.name,
  section: row.section,
  accountCount: row.account_count,
});
