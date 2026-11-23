import Database from "better-sqlite3";
import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import type { Migration } from "./Migration";
import { MigrationRunner } from "./MigrationRunner";

/** Builds n migrations that each create a table t<version>. */
const makeMigrations = (count: number): Migration[] =>
  Array.from({ length: count }, (_, index) => ({
    version: index + 1,
    name: `create t${index + 1}`,
    sql: `CREATE TABLE t${index + 1} (id INTEGER PRIMARY KEY);`,
  }));

const tableNames = (db: Database.Database): string[] =>
  (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((row) => row.name);

const openDbs: Database.Database[] = [];
const openDb = (): Database.Database => {
  const db = new Database(":memory:");
  openDbs.push(db);
  return db;
};

afterEach(() => {
  openDbs.splice(0).forEach((db) => db.close());
});

describe("MigrationRunner", () => {
  it("brings a fresh database to the latest version", () => {
    const runner = new MigrationRunner(makeMigrations(3));
    const db = openDb();

    expect(runner.migrate(db)).toEqual([1, 2, 3]);
    expect(runner.currentVersion(db)).toBe(3);
    expect(tableNames(db)).toEqual(["t1", "t2", "t3"]);
  });

  it("rejects migrations whose versions are not 1, 2, 3, ...", () => {
    const [first, , third] = makeMigrations(3);
    expect(() => new MigrationRunner([first, third])).toThrow(/expected 2/);
  });

  it("refuses a database written by a newer app version", () => {
    const db = openDb();
    db.pragma("user_version = 5");

    expect(() => new MigrationRunner(makeMigrations(2)).migrate(db)).toThrow(
      /newer than this app supports/,
    );
  });

  it("rolls back a failing migration and keeps earlier ones", () => {
    const migrations: Migration[] = [
      ...makeMigrations(1),
      {
        version: 2,
        name: "broken",
        sql: "CREATE TABLE half (id INTEGER); THIS IS NOT SQL;",
      },
    ];
    const db = openDb();

    expect(() => new MigrationRunner(migrations).migrate(db)).toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(1);
    expect(tableNames(db)).toEqual(["t1"]);
  });

  it("applies each migration exactly once, however the upgrades are split", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }).chain((total) =>
          fc.tuple(
            fc.constant(total),
            fc.array(fc.integer({ min: 0, max: total }), { maxLength: 5 }),
          ),
        ),
        ([total, stops]) => {
          const migrations = makeMigrations(total);
          const db = openDb();
          const applied: number[] = [];

          // Upgrade through a series of older app versions, then the latest,
          // then run the latest again.
          for (const stop of [...stops].sort((a, b) => a - b)) {
            applied.push(
              ...new MigrationRunner(migrations.slice(0, stop)).migrate(db),
            );
          }
          const latest = new MigrationRunner(migrations);
          applied.push(...latest.migrate(db), ...latest.migrate(db));

          expect(applied).toEqual(migrations.map((m) => m.version));
          expect(latest.currentVersion(db)).toBe(total);
        },
      ),
    );
  });
});
