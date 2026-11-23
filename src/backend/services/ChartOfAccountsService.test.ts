import type { Database } from "better-sqlite3";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ACCOUNT_TYPES,
  compareAccountsByCode,
  type Account,
  type AccountInput,
} from "../../common/accounts/accountSchemas";
import { InMemoryAccountRepository } from "../repositories/InMemoryAccountRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";

/** One chart of accounts under test, plus a way to give an account activity. */
interface Harness {
  service: ChartOfAccountsService;
  clientId: string;
  recordActivity(accountId: number): void;
}

const inMemoryHarness = (): Harness => {
  const repos = new Map<string, InMemoryAccountRepository>();
  const repoFor = (id: string) => {
    if (!repos.has(id)) repos.set(id, new InMemoryAccountRepository());
    return repos.get(id);
  };
  const service = new ChartOfAccountsService(repoFor);
  const clientId = "6f1c2c38-3a56-4c43-9a3d-2f3a7b9e1c10";
  service.initializeClient(clientId);
  return {
    service,
    clientId,
    recordActivity: (accountId) => repoFor(clientId).recordActivity(accountId),
  };
};

let workspace: TempClientWorkspace;

const sqliteHarness = (): Harness => {
  const service = new ChartOfAccountsService(
    (id) => new SqliteAccountRepository(workspace.pool.get(id)),
  );
  const client = new ClientService(workspace.clients, [service]).create({
    name: "Made-up Rentals",
    fiscalYearEnd: "2026-12-31",
  });
  const db: Database = workspace.pool.get(client.id);
  return {
    service,
    clientId: client.id,
    recordActivity: (accountId) => {
      const entryId = db
        .prepare(
          "INSERT INTO journal_entries (entry_date, description, source) VALUES ('2026-01-31', 'Test', 'manual')",
        )
        .run().lastInsertRowid;
      db.prepare(
        "INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit_cents) VALUES (?, 1, ?, 100)",
      ).run(entryId, accountId);
    },
  };
};

beforeEach(() => {
  workspace = new TempClientWorkspace();
});

afterEach(() => {
  workspace.dispose();
});

type Command =
  | { kind: "create"; input: AccountInput }
  | { kind: "update"; pick: number; input: AccountInput }
  | { kind: "delete"; pick: number }
  | { kind: "activity"; pick: number };

// A small pool of codes so collisions (and the system code 1999) come up often.
const inputArb: fc.Arbitrary<AccountInput> = fc.record({
  code: fc.constantFrom("1000", "1999", "2000", " 4000 ", "4000", "", "500"),
  name: fc.constantFrom("Chequing", "Rent income", "Repairs", "  "),
  type: fc.constantFrom(...ACCOUNT_TYPES),
});

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ kind: fc.constant("create" as const), input: inputArb }),
  fc.record({ kind: fc.constant("update" as const), pick: fc.nat(), input: inputArb }),
  fc.record({ kind: fc.constant("delete" as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant("activity" as const), pick: fc.nat() }),
);

/** Runs a command and describes its outcome without database ids. */
const run = (harness: Harness, command: Command): string => {
  const { service, clientId } = harness;
  const accounts = service.list(clientId);
  const target = "pick" in command ? accounts[command.pick % accounts.length] : undefined;
  try {
    switch (command.kind) {
      case "create":
        service.create(clientId, command.input);
        break;
      case "update":
        service.update(clientId, target.id, command.input);
        break;
      case "delete":
        service.delete(clientId, target.id);
        break;
      case "activity":
        harness.recordActivity(target.id);
        break;
    }
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const snapshot = (accounts: Account[]) =>
  accounts.map(({ code, name, type, systemKey, hasActivity }) => ({
    code,
    name,
    type,
    systemKey,
    hasActivity,
  }));

describe("ChartOfAccountsService", () => {
  it("gives a new client the Bank Transfer Control account (FR-7)", () => {
    const { service, clientId } = sqliteHarness();
    expect(snapshot(service.list(clientId))).toEqual([
      {
        code: "1999",
        name: "Bank Transfer Control",
        type: "asset",
        systemKey: "bank_transfer_control",
        hasActivity: false,
      },
    ]);

    service.ensureSystemAccounts(clientId);
    expect(service.list(clientId)).toHaveLength(1);
  });

  it("behaves identically over SQLite and in memory, and keeps its rules", () => {
    fc.assert(
      fc.property(fc.array(commandArb, { maxLength: 25 }), (commands) => {
        const sqlite = sqliteHarness();
        const memory = inMemoryHarness();

        for (const command of commands) {
          expect(run(sqlite, command)).toBe(run(memory, command));

          const accounts = sqlite.service.list(sqlite.clientId);
          expect(snapshot(accounts)).toEqual(
            snapshot(memory.service.list(memory.clientId)),
          );

          // Codes are unique, trimmed, and the list is sorted by code.
          const codes = accounts.map((a) => a.code);
          expect(new Set(codes).size).toBe(codes.length);
          expect(codes.every((code) => code === code.trim() && code !== "")).toBe(true);
          expect([...accounts].sort(compareAccountsByCode)).toEqual(accounts);

          // The system account always exists and stays an asset.
          expect(
            accounts.filter((a) => a.systemKey === "bank_transfer_control"),
          ).toEqual([expect.objectContaining({ type: "asset" })]);
        }
      }),
      { numRuns: 60 },
    );
  }, 30_000);

  it("never loses an account once it has posted activity (FR-8)", () => {
    fc.assert(
      fc.property(fc.array(commandArb, { maxLength: 25 }), (commands) => {
        const harness = sqliteHarness();
        const withActivity = new Map<number, Account>();

        for (const command of commands) {
          run(harness, command);
          const accounts = harness.service.list(harness.clientId);
          for (const account of accounts.filter((a) => a.hasActivity)) {
            const before = withActivity.get(account.id);
            if (before) expect(account.type).toBe(before.type);
            withActivity.set(account.id, account);
          }
          for (const id of withActivity.keys()) {
            expect(accounts.some((a) => a.id === id)).toBe(true);
          }
        }
      }),
      { numRuns: 40 },
    );
  }, 30_000);

  it("explains why a duplicate code is refused", () => {
    const { service, clientId } = sqliteHarness();
    service.create(clientId, { code: "4000", name: "Rent income", type: "revenue" });

    expect(() =>
      service.create(clientId, { code: " 4000", name: "Other", type: "revenue" }),
    ).toThrow('Account code 4000 is already used by "Rent income".');
  });

  it("refuses to delete or retype Bank Transfer Control, but allows a rename", () => {
    const { service, clientId } = sqliteHarness();
    const [control] = service.list(clientId);

    expect(() => service.delete(clientId, control.id)).toThrow(/required by the app/);
    expect(() =>
      service.update(clientId, control.id, { ...control, type: "liability" }),
    ).toThrow(/type can't be changed/);
    expect(
      service.update(clientId, control.id, {
        code: "1090",
        name: "Transfers in transit",
        type: "asset",
      }),
    ).toMatchObject({ code: "1090", name: "Transfers in transit" });
  });

  it("finds accounts by code for the coding grid (FR-6)", () => {
    const { service, clientId } = sqliteHarness();
    service.create(clientId, { code: "5100", name: "Repairs", type: "expense" });

    expect(service.findByCode(clientId, " 5100 ")?.name).toBe("Repairs");
    expect(service.findByCode(clientId, "9999")).toBeUndefined();
  });

  it("reports a client that doesn't exist", () => {
    const service = new ChartOfAccountsService(
      (id) => new SqliteAccountRepository(workspace.pool.get(id)),
    );
    expect(() => service.list("6f1c2c38-3a56-4c43-9a3d-2f3a7b9e1c10")).toThrow(
      /no longer exists/,
    );
  });
});
