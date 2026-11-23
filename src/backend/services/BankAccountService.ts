import { ACCOUNT_TYPE_LABELS } from "../../common/accounts/accountSchemas";
import {
  bankAccountIdSchema,
  bankAccountNameSchema,
  BANK_ACCOUNT_KIND_LABELS,
  createBankAccountInputSchema,
  LEDGER_TYPE_FOR_KIND,
  type BankAccount,
  type CreateBankAccountInput,
} from "../../common/bankAccounts/bankAccountSchemas";
import { clientIdSchema } from "../../common/clients/clientSchemas";
import { UserFacingError } from "../errors";
import type { BankAccountRepository } from "../repositories/BankAccountRepository";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";

/** Gives the bank account repository for one client. */
export type BankAccountRepositoryProvider = (clientId: string) => BankAccountRepository;

/**
 * Manages a client's bank account and credit card tabs (FR-9). Each tab is
 * linked to exactly one ledger account of the right type (FR-10): an asset
 * for a bank account, a liability for a credit card.
 */
export class BankAccountService {
  /**
   * @param bankAccountsFor Returns the bank account repository for a client.
   * @param chartOfAccounts Looks up and creates the linked ledger accounts.
   */
  public constructor(
    private readonly bankAccountsFor: BankAccountRepositoryProvider,
    private readonly chartOfAccounts: ChartOfAccountsService,
  ) {}

  /**
   * Lists a client's tabs in display order.
   * @param clientId The client.
   */
  public list(clientId: string): BankAccount[] {
    return this.repo(clientId).list();
  }

  /**
   * Finds one tab.
   * @param clientId The client.
   * @param bankAccountId The tab's id.
   * @throws UserFacingError if it doesn't exist.
   */
  public require(clientId: string, bankAccountId: number): BankAccount {
    const bankAccount = this.repo(clientId).find(bankAccountIdSchema.parse(bankAccountId));
    if (!bankAccount) {
      throw new UserFacingError("That bank account no longer exists.");
    }
    return bankAccount;
  }

  /**
   * Adds a tab, linking it to a new or existing ledger account.
   * @param clientId The client.
   * @param input Name, kind and ledger account choice.
   */
  public create(clientId: string, input: CreateBankAccountInput): BankAccount {
    const bankAccounts = this.repo(clientId);
    const { name, kind, ledger } = createBankAccountInputSchema.parse(input);
    const type = LEDGER_TYPE_FOR_KIND[kind];

    let accountId: number;
    if (ledger.mode === "new") {
      accountId = this.chartOfAccounts.create(clientId, { code: ledger.code, name, type }).id;
    } else {
      const account = this.chartOfAccounts.find(clientId, ledger.accountId);
      if (!account) {
        throw new UserFacingError("That ledger account no longer exists.");
      }
      if (account.systemKey) {
        throw new UserFacingError(`${account.name} is a system account and can't be used for a tab.`);
      }
      if (account.type !== type) {
        throw new UserFacingError(
          `${capitalize(withArticle(BANK_ACCOUNT_KIND_LABELS[kind].toLowerCase()))} must post to ${withArticle(ACCOUNT_TYPE_LABELS[type].toLowerCase())} account, but ${account.code} ${account.name} is ${withArticle(ACCOUNT_TYPE_LABELS[account.type].toLowerCase())} account.`,
        );
      }
      const linked = bankAccounts.findByAccountId(account.id);
      if (linked) {
        throw new UserFacingError(
          `${account.code} ${account.name} is already linked to the "${linked.name}" tab.`,
        );
      }
      accountId = account.id;
    }
    return bankAccounts.insert({ accountId, name, kind });
  }

  /**
   * Renames a tab. The linked ledger account keeps its own name.
   * @param clientId The client.
   * @param bankAccountId The tab.
   * @param name The new name.
   */
  public rename(clientId: string, bankAccountId: number, name: string): BankAccount {
    this.require(clientId, bankAccountId);
    return this.repo(clientId).rename(bankAccountId, bankAccountNameSchema.parse(name));
  }

  /**
   * Removes a tab that has nothing imported. Its ledger account stays in the
   * chart of accounts.
   * @param clientId The client.
   * @param bankAccountId The tab.
   */
  public delete(clientId: string, bankAccountId: number): void {
    const bankAccount = this.require(clientId, bankAccountId);
    if (bankAccount.hasImports) {
      throw new UserFacingError(
        `"${bankAccount.name}" has imported transactions, so it can't be removed.`,
      );
    }
    this.repo(clientId).delete(bankAccountId);
  }

  private repo(clientId: string): BankAccountRepository {
    return this.bankAccountsFor(clientIdSchema.parse(clientId));
  }
}

const withArticle = (noun: string): string =>
  `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
