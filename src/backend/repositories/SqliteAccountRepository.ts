import { SqliteError, type Database } from "better-sqlite3";

import type {
  Account,
  AccountInput,
  AccountType,
  SystemAccountKey,
} from "../../common/accounts/accountSchemas";
import { UserFacingError } from "../errors";
import type { AccountRepository, NewAccount } from "./AccountRepository";

interface AccountRow {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  system_key: SystemAccountKey | null;
  has_activity: number;
}

const SELECT_ACCOUNTS = `
  SELECT a.id, a.code, a.name, a.type, a.system_key,
         EXISTS (SELECT 1 FROM journal_lines l WHERE l.account_id = a.id) AS has_activity
  FROM accounts a`;

/**
 * Account repository over a client's SQLite database. Whether an account has
 * activity is computed from journal lines, never stored (FR-31).
 */
export class SqliteAccountRepository implements AccountRepository {
  /**
   * @param db The client's open database.
   */
  public constructor(private readonly db: Database) {}

  /** @inheritdoc */
  public list(): Account[] {
    return (this.db.prepare(SELECT_ACCOUNTS).all() as AccountRow[]).map(toAccount);
  }

  /** @inheritdoc */
  public find(accountId: number): Account | undefined {
    return this.findWhere("a.id = ?", accountId);
  }

  /** @inheritdoc */
  public findByCode(code: string): Account | undefined {
    return this.findWhere("a.code = ?", code);
  }

  /** @inheritdoc */
  public findBySystemKey(key: SystemAccountKey): Account | undefined {
    return this.findWhere("a.system_key = ?", key);
  }

  /** @inheritdoc */
  public insert(account: NewAccount): Account {
    const { lastInsertRowid } = this.db
      .prepare(
        "INSERT INTO accounts (code, name, type, system_key) VALUES (?, ?, ?, ?)",
      )
      .run(account.code, account.name, account.type, account.systemKey ?? null);
    return this.require(Number(lastInsertRowid));
  }

  /** @inheritdoc */
  public update(accountId: number, account: AccountInput): Account {
    this.db
      .prepare("UPDATE accounts SET code = ?, name = ?, type = ? WHERE id = ?")
      .run(account.code, account.name, account.type, accountId);
    return this.require(accountId);
  }

  /** @inheritdoc */
  public delete(accountId: number): void {
    try {
      this.db.prepare("DELETE FROM accounts WHERE id = ?").run(accountId);
    } catch (error) {
      if (error instanceof SqliteError && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        throw new UserFacingError(
          "This account is still in use (by entries, bank accounts, imported rows or coding rules), so it can't be deleted.",
        );
      }
      throw error;
    }
  }

  private findWhere(condition: string, value: unknown): Account | undefined {
    const row = this.db
      .prepare(`${SELECT_ACCOUNTS} WHERE ${condition}`)
      .get(value) as AccountRow | undefined;
    return row ? toAccount(row) : undefined;
  }

  private require(accountId: number): Account {
    const account = this.find(accountId);
    if (!account) {
      throw new UserFacingError("That account no longer exists.");
    }
    return account;
  }
}

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  code: row.code,
  name: row.name,
  type: row.type,
  systemKey: row.system_key,
  hasActivity: row.has_activity === 1,
});
