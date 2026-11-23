import type { Database } from "better-sqlite3";

import type {
  BankAccount,
  BankAccountKind,
} from "../../common/bankAccounts/bankAccountSchemas";
import { UserFacingError } from "../errors";

/** What is needed to store a new bank account tab. */
export interface NewBankAccount {
  readonly accountId: number;
  readonly name: string;
  readonly kind: BankAccountKind;
}

/**
 * Stores one client's bank account and credit card tabs.
 */
export interface BankAccountRepository {
  /** Every tab in display order. */
  list(): BankAccount[];
  /** One tab by id. */
  find(bankAccountId: number): BankAccount | undefined;
  /** The tab linked to a ledger account, if any. */
  findByAccountId(accountId: number): BankAccount | undefined;
  /** Stores a new tab after the existing ones. */
  insert(bankAccount: NewBankAccount): BankAccount;
  /** Renames a tab. */
  rename(bankAccountId: number, name: string): BankAccount;
  /** Removes a tab (its ledger account stays). */
  delete(bankAccountId: number): void;
}

interface BankAccountRow {
  id: number;
  name: string;
  kind: BankAccountKind;
  account_id: number;
  account_code: string;
  account_name: string;
  has_imports: number;
}

const SELECT_BANK_ACCOUNTS = `
  SELECT b.id, b.name, b.kind, b.account_id,
         a.code AS account_code, a.name AS account_name,
         EXISTS (SELECT 1 FROM import_batches i WHERE i.bank_account_id = b.id) AS has_imports
  FROM bank_accounts b JOIN accounts a ON a.id = b.account_id`;

/**
 * Bank account repository over a client's SQLite database.
 */
export class SqliteBankAccountRepository implements BankAccountRepository {
  /**
   * @param db The client's open database.
   */
  public constructor(private readonly db: Database) {}

  /** @inheritdoc */
  public list(): BankAccount[] {
    return (
      this.db
        .prepare(`${SELECT_BANK_ACCOUNTS} ORDER BY b.sort_order, b.id`)
        .all() as BankAccountRow[]
    ).map(toBankAccount);
  }

  /** @inheritdoc */
  public find(bankAccountId: number): BankAccount | undefined {
    const row = this.db
      .prepare(`${SELECT_BANK_ACCOUNTS} WHERE b.id = ?`)
      .get(bankAccountId) as BankAccountRow | undefined;
    return row ? toBankAccount(row) : undefined;
  }

  /** @inheritdoc */
  public findByAccountId(accountId: number): BankAccount | undefined {
    const row = this.db
      .prepare(`${SELECT_BANK_ACCOUNTS} WHERE b.account_id = ?`)
      .get(accountId) as BankAccountRow | undefined;
    return row ? toBankAccount(row) : undefined;
  }

  /** @inheritdoc */
  public insert(bankAccount: NewBankAccount): BankAccount {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO bank_accounts (account_id, name, kind, sort_order)
         VALUES (?, ?, ?, (SELECT coalesce(max(sort_order), 0) + 1 FROM bank_accounts))`,
      )
      .run(bankAccount.accountId, bankAccount.name, bankAccount.kind);
    return this.require(Number(lastInsertRowid));
  }

  /** @inheritdoc */
  public rename(bankAccountId: number, name: string): BankAccount {
    this.db
      .prepare("UPDATE bank_accounts SET name = ? WHERE id = ?")
      .run(name, bankAccountId);
    return this.require(bankAccountId);
  }

  /** @inheritdoc */
  public delete(bankAccountId: number): void {
    this.db.prepare("DELETE FROM bank_accounts WHERE id = ?").run(bankAccountId);
  }

  private require(bankAccountId: number): BankAccount {
    const bankAccount = this.find(bankAccountId);
    if (!bankAccount) {
      throw new UserFacingError("That bank account no longer exists.");
    }
    return bankAccount;
  }
}

const toBankAccount = (row: BankAccountRow): BankAccount => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  accountId: row.account_id,
  accountCode: row.account_code,
  accountName: row.account_name,
  hasImports: row.has_imports === 1,
});
