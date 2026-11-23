import type { Database } from "better-sqlite3";
import * as fc from "fast-check";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ClientDatabaseFactory,
  IN_MEMORY_DATABASE,
} from "./ClientDatabaseFactory";
import { CLIENT_MIGRATIONS } from "./clientMigrations";

const factory = new ClientDatabaseFactory();
let db: Database;

/** Inserts a made-up account and returns its id. */
const addAccount = (code: string, type = "asset"): number =>
  Number(
    db
      .prepare("INSERT INTO accounts (code, name, type) VALUES (?, ?, ?)")
      .run(code, `Account ${code}`, type).lastInsertRowid,
  );

/** Inserts a manual journal entry and returns its id. */
const addEntry = (entryDate = "2026-01-15"): number =>
  Number(
    db
      .prepare(
        "INSERT INTO journal_entries (entry_date, description, source) VALUES (?, 'Test', 'manual')",
      )
      .run(entryDate).lastInsertRowid,
  );

const insertLine = (
  entryId: number,
  accountId: number,
  debit: number,
  credit: number,
  lineNumber = 1,
) =>
  db
    .prepare(
      "INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit_cents, credit_cents) VALUES (?, ?, ?, ?, ?)",
    )
    .run(entryId, lineNumber, accountId, debit, credit);

beforeEach(() => {
  db = factory.open(IN_MEMORY_DATABASE);
});

afterEach(() => {
  db.close();
});

describe("client database schema", () => {
  it("is migrated to the latest version with foreign keys on", () => {
    expect(db.pragma("user_version", { simple: true })).toBe(
      CLIENT_MIGRATIONS.length,
    );
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("creates every Phase 1 table", () => {
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "client_profile",
        "accounts",
        "bank_accounts",
        "import_batches",
        "staged_transactions",
        "fiscal_years",
        "journal_entries",
        "journal_lines",
        "coding_rules",
      ]),
    );
  });

  it("accepts a journal line only when exactly one of debit and credit is positive", () => {
    const accountId = addAccount("1000");
    const entryId = addEntry();
    let lineNumber = 0;

    fc.assert(
      fc.property(
        fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 2 ** 40 })),
        fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 2 ** 40 })),
        (debit, credit) => {
          lineNumber += 1;
          const insert = () =>
            insertLine(entryId, accountId, debit, credit, lineNumber);

          if ((debit > 0) !== (credit > 0)) {
            expect(insert).not.toThrow();
          } else {
            expect(insert).toThrow(/CHECK constraint/);
          }
        },
      ),
    );
  });

  it("rejects negative or fractional money amounts", () => {
    const accountId = addAccount("1000");
    const entryId = addEntry();

    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ max: -1 }),
          fc
            .double({ min: 0.001, max: 1e9, noNaN: true })
            .filter((n) => !Number.isInteger(n)),
        ),
        (badAmount) => {
          expect(() => insertLine(entryId, accountId, badAmount, 0)).toThrow();
          expect(() =>
            insertLine(entryId, accountId, 0, badAmount),
          ).toThrow();
        },
      ),
    );
  });

  it("stores money as exact integer cents", () => {
    const accountId = addAccount("1000");

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        (cents) => {
          const entryId = addEntry();
          insertLine(entryId, accountId, cents, 0);
          const row = db
            .prepare(
              "SELECT debit_cents, typeof(debit_cents) AS kind FROM journal_lines WHERE journal_entry_id = ?",
            )
            .get(entryId) as { debit_cents: number; kind: string };

          expect(row).toEqual({ debit_cents: cents, kind: "integer" });
        },
      ),
    );
  });

  it("only accepts account types used by the financial statements", () => {
    const validTypes = ["asset", "liability", "equity", "revenue", "expense"];
    let code = 0;

    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(...validTypes), fc.string()),
        (type) => {
          code += 1;
          const insert = () => addAccount(String(code), type);

          if (validTypes.includes(type)) {
            expect(insert).not.toThrow();
          } else {
            expect(insert).toThrow(/CHECK constraint/);
          }
        },
      ),
    );
  });

  it("accepts real calendar dates as YYYY-MM-DD and rejects anything else", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("1900-01-01T00:00:00Z"),
          max: new Date("2199-12-31T00:00:00Z"),
          noInvalidDate: true,
        }),
        (date) => {
          const isoDate = date.toISOString().slice(0, 10);
          expect(() => addEntry(isoDate)).not.toThrow();
        },
      ),
    );

    for (const bad of ["2026-02-30", "2026-13-01", "15/01/2026", "2026-1-5", ""]) {
      expect(() => addEntry(bad), bad).toThrow(/CHECK constraint/);
    }
  });

  it("keeps account codes unique within a client", () => {
    addAccount("4000", "revenue");
    expect(() => addAccount("4000", "revenue")).toThrow(/UNIQUE/);
  });

  it("blocks deleting an account that has posted activity (FR-8)", () => {
    const usedId = addAccount("1000");
    const unusedId = addAccount("1001");
    insertLine(addEntry(), usedId, 500, 0);

    expect(() =>
      db.prepare("DELETE FROM accounts WHERE id = ?").run(usedId),
    ).toThrow(/FOREIGN KEY/);
    expect(() =>
      db.prepare("DELETE FROM accounts WHERE id = ?").run(unusedId),
    ).not.toThrow();
  });

  it("requires bank-import entries to link to their source row (FR-22)", () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO journal_entries (entry_date, description, source) VALUES ('2026-01-15', 'Deposit', 'bank_import')",
        )
        .run(),
    ).toThrow(/CHECK constraint/);
  });

  it("removes an entry's lines when the entry is deleted", () => {
    const entryId = addEntry();
    insertLine(entryId, addAccount("1000"), 100, 0);

    db.prepare("DELETE FROM journal_entries WHERE id = ?").run(entryId);

    expect(
      db.prepare("SELECT COUNT(*) AS n FROM journal_lines").get(),
    ).toEqual({ n: 0 });
  });

  it("allows only one client profile row per database", () => {
    const insert = () =>
      db
        .prepare(
          "INSERT INTO client_profile (id, name, fiscal_year_end) VALUES (1, 'Made-up Rentals', '2026-12-31')",
        )
        .run();

    insert();
    expect(insert).toThrow(/UNIQUE|PRIMARY KEY/);
  });
});

describe("ClientDatabaseFactory with a file", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-trust-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("persists data, reopens without re-migrating, and leaves a single file", () => {
    const filePath = path.join(dir, "client.sqlite");

    const first = factory.open(filePath);
    first
      .prepare("INSERT INTO accounts (code, name, type) VALUES ('1000', 'Chequing', 'asset')")
      .run();
    first.close();

    const second = factory.open(filePath);
    expect(second.prepare("SELECT code, name FROM accounts").all()).toEqual([
      { code: "1000", name: "Chequing" },
    ]);
    second.close();

    expect(fs.readdirSync(dir)).toEqual(["client.sqlite"]);
  });
});
