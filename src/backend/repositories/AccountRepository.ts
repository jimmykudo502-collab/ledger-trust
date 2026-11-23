import type {
  Account,
  AccountInput,
  SystemAccountKey,
} from "../../common/accounts/accountSchemas";

/** What is needed to store a new account. */
export interface NewAccount extends AccountInput {
  readonly systemKey?: SystemAccountKey | null;
}

/**
 * Stores one client's chart of accounts. Inputs are already validated, and
 * business rules (unique codes, protected system accounts) are enforced by
 * the service; implementations only store and retrieve.
 */
export interface AccountRepository {
  /** Every account, in no particular order. */
  list(): Account[];
  /** One account by id. */
  find(accountId: number): Account | undefined;
  /** One account by its exact code. */
  findByCode(code: string): Account | undefined;
  /** The account playing a system role, if it exists. */
  findBySystemKey(key: SystemAccountKey): Account | undefined;
  /** Stores a new account and returns it. */
  insert(account: NewAccount): Account;
  /** Replaces an account's code, name and type and returns it. */
  update(accountId: number, account: AccountInput): Account;
  /** Removes an account. */
  delete(accountId: number): void;
}
