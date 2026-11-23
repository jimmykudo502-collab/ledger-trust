import {
  accountIdSchema,
  accountInputSchema,
  compareAccountsByCode,
  SYSTEM_ACCOUNTS,
  type Account,
  type AccountInput,
  type SystemAccountKey,
} from "../../common/accounts/accountSchemas";
import { clientIdSchema } from "../../common/clients/clientSchemas";
import { UserFacingError } from "../errors";
import type { AccountRepository } from "../repositories/AccountRepository";
import type { ClientInitializer } from "./ClientService";

/** Gives the account repository for one client. */
export type AccountRepositoryProvider = (clientId: string) => AccountRepository;

/**
 * Manages each client's chart of accounts (FR-4 to FR-8): unique codes,
 * the required Bank Transfer Control account, and protection for accounts
 * that already have posted activity.
 */
export class ChartOfAccountsService implements ClientInitializer {
  /**
   * @param accountsFor Returns the account repository for a client.
   */
  public constructor(private readonly accountsFor: AccountRepositoryProvider) {}

  /**
   * Adds the system accounts (FR-7) to a new client.
   * @param clientId The new client's id.
   */
  public initializeClient(clientId: string): void {
    this.ensureSystemAccounts(clientId);
  }

  /**
   * Creates any missing system accounts. Safe to call repeatedly.
   * @param clientId The client to check.
   * @throws UserFacingError if a system account's default code is taken.
   */
  public ensureSystemAccounts(clientId: string): void {
    const accounts = this.repo(clientId);
    for (const system of SYSTEM_ACCOUNTS) {
      if (accounts.findBySystemKey(system.systemKey)) {
        continue;
      }
      const clash = accounts.findByCode(system.code);
      if (clash) {
        throw new UserFacingError(
          `The ${system.name} account needs code ${system.code}, but "${clash.name}" already uses it.`,
        );
      }
      accounts.insert(system);
    }
  }

  /**
   * The account playing a system role, creating it first if it is missing.
   * @param clientId The client.
   * @param key The role, e.g. "bank_transfer_control".
   */
  public systemAccount(clientId: string, key: SystemAccountKey): Account {
    this.ensureSystemAccounts(clientId);
    return this.repo(clientId).findBySystemKey(key);
  }

  /**
   * Lists a client's accounts sorted by code.
   * @param clientId The client.
   */
  public list(clientId: string): Account[] {
    return this.repo(clientId).list().sort(compareAccountsByCode);
  }

  /**
   * Finds an account by id.
   * @param clientId The client.
   * @param accountId The account's id.
   */
  public find(clientId: string, accountId: number): Account | undefined {
    return this.repo(clientId).find(accountIdSchema.parse(accountId));
  }

  /**
   * Finds an account by its code, e.g. one typed in the coding grid (FR-6).
   * @param clientId The client.
   * @param code The code to look up (surrounding spaces are ignored).
   */
  public findByCode(clientId: string, code: string): Account | undefined {
    return this.repo(clientId).findByCode(code.trim());
  }

  /**
   * Adds an account (FR-4, FR-6).
   * @param clientId The client.
   * @param input Code, name and type.
   * @throws UserFacingError if the code is already used.
   */
  public create(clientId: string, input: AccountInput): Account {
    const accounts = this.repo(clientId);
    const account = accountInputSchema.parse(input);
    this.assertCodeFree(accounts, account.code);
    return accounts.insert(account);
  }

  /**
   * Changes an account's code, name or type. The type is locked for system
   * accounts and for accounts with posted activity, so past statements
   * don't change underneath the user.
   * @param clientId The client.
   * @param accountId The account to change.
   * @param input The new code, name and type.
   */
  public update(clientId: string, accountId: number, input: AccountInput): Account {
    const accounts = this.repo(clientId);
    const existing = this.require(accounts, accountId);
    const account = accountInputSchema.parse(input);

    if (account.code !== existing.code) {
      this.assertCodeFree(accounts, account.code);
    }
    if (account.type !== existing.type) {
      if (existing.systemKey) {
        throw new UserFacingError(
          `${existing.name} is required by the app, so its type can't be changed.`,
        );
      }
      if (existing.hasActivity) {
        throw new UserFacingError(
          `${existing.name} has posted entries, so its type can't be changed.`,
        );
      }
    }
    return accounts.update(accountId, account);
  }

  /**
   * Deletes an account. System accounts and accounts with posted activity
   * can't be deleted (FR-7, FR-8).
   * @param clientId The client.
   * @param accountId The account to delete.
   */
  public delete(clientId: string, accountId: number): void {
    const accounts = this.repo(clientId);
    const existing = this.require(accounts, accountId);
    if (existing.systemKey) {
      throw new UserFacingError(
        `${existing.name} is required by the app, so it can't be deleted.`,
      );
    }
    if (existing.hasActivity) {
      throw new UserFacingError(
        `${existing.name} has posted entries, so it can't be deleted.`,
      );
    }
    accounts.delete(accountId);
  }

  private repo(clientId: string): AccountRepository {
    return this.accountsFor(clientIdSchema.parse(clientId));
  }

  private require(accounts: AccountRepository, accountId: number): Account {
    const account = accounts.find(accountIdSchema.parse(accountId));
    if (!account) {
      throw new UserFacingError("That account no longer exists.");
    }
    return account;
  }

  private assertCodeFree(accounts: AccountRepository, code: string): void {
    const clash = accounts.findByCode(code);
    if (clash) {
      throw new UserFacingError(
        `Account code ${code} is already used by "${clash.name}".`,
      );
    }
  }
}
