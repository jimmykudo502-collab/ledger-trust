import type {
  Account,
  AccountInput,
  SystemAccountKey,
} from "../../common/accounts/accountSchemas";
import { UserFacingError } from "../errors";
import type { AccountRepository, NewAccount } from "./AccountRepository";

/**
 * In-memory account repository for tests. Behaves like the SQLite one,
 * including refusing to delete accounts with activity.
 */
export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<number, Account>();
  private nextId = 1;

  /** @inheritdoc */
  public list(): Account[] {
    return [...this.accounts.values()];
  }

  /** @inheritdoc */
  public find(accountId: number): Account | undefined {
    return this.accounts.get(accountId);
  }

  /** @inheritdoc */
  public findByCode(code: string): Account | undefined {
    return this.list().find((account) => account.code === code);
  }

  /** @inheritdoc */
  public findBySystemKey(key: SystemAccountKey): Account | undefined {
    return this.list().find((account) => account.systemKey === key);
  }

  /** @inheritdoc */
  public insert(account: NewAccount): Account {
    if (this.findByCode(account.code)) {
      throw new Error(`UNIQUE constraint failed: accounts.code`);
    }
    const stored: Account = {
      id: this.nextId++,
      code: account.code,
      name: account.name,
      type: account.type,
      systemKey: account.systemKey ?? null,
      hasActivity: false,
    };
    this.accounts.set(stored.id, stored);
    return stored;
  }

  /** @inheritdoc */
  public update(accountId: number, account: AccountInput): Account {
    const existing = this.require(accountId);
    const updated = { ...existing, ...account };
    this.accounts.set(accountId, updated);
    return updated;
  }

  /** @inheritdoc */
  public delete(accountId: number): void {
    if (this.accounts.get(accountId)?.hasActivity) {
      throw new UserFacingError(
        "This account is still in use (by entries, bank accounts, imported rows or coding rules), so it can't be deleted.",
      );
    }
    this.accounts.delete(accountId);
  }

  /**
   * Test helper: marks an account as having posted journal lines.
   * @param accountId The account to mark.
   */
  public recordActivity(accountId: number): void {
    this.accounts.set(accountId, { ...this.require(accountId), hasActivity: true });
  }

  private require(accountId: number): Account {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new UserFacingError("That account no longer exists.");
    }
    return account;
  }
}
