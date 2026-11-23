import { z } from "zod";

import {
  accountCodeSchema,
  accountIdSchema,
  type AccountType,
} from "../accounts/accountSchemas";
import { clientIdSchema, type ClientId } from "../clients/clientSchemas";

/** Kinds of account that get their own import tab (FR-9). */
export const BANK_ACCOUNT_KINDS = ["bank", "credit_card"] as const;
export const bankAccountKindSchema = z.enum(BANK_ACCOUNT_KINDS);
export type BankAccountKind = z.infer<typeof bankAccountKindSchema>;

export const BANK_ACCOUNT_KIND_LABELS: Record<BankAccountKind, string> = {
  bank: "Bank account",
  credit_card: "Credit card",
};

/**
 * The ledger account type each kind posts against (FR-10, FR-16): a bank
 * account is an asset, a credit card is a liability.
 */
export const LEDGER_TYPE_FOR_KIND: Record<BankAccountKind, AccountType> = {
  bank: "asset",
  credit_card: "liability",
};

export const bankAccountNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name for the account.")
  .max(100, "Names can be at most 100 characters.");

export const bankAccountIdSchema = z.number().int().positive();

/** Which ledger account a new tab posts against. */
export const ledgerChoiceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("new"), code: accountCodeSchema }),
  z.object({ mode: z.literal("existing"), accountId: accountIdSchema }),
]);

/** Everything needed to add a bank account or credit card tab. */
export const createBankAccountInputSchema = z.object({
  name: bankAccountNameSchema,
  kind: bankAccountKindSchema,
  ledger: ledgerChoiceSchema,
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountInputSchema>;

/** A bank account or credit card tab and its linked ledger account. */
export interface BankAccount {
  readonly id: number;
  readonly name: string;
  readonly kind: BankAccountKind;
  readonly accountId: number;
  readonly accountCode: string;
  readonly accountName: string;
  /** Whether anything has been imported into this tab. */
  readonly hasImports: boolean;
  /**
   * The linked account's balance from posted journal lines (FR-31), as
   * debits minus credits in cents. Negative for a card that is owed.
   */
  readonly ledgerBalanceCents: number;
}

export const listBankAccountsRequestSchema = z.object({ clientId: clientIdSchema });

export const createBankAccountRequestSchema = z.object({
  clientId: clientIdSchema,
  input: createBankAccountInputSchema,
});

export const renameBankAccountRequestSchema = z.object({
  clientId: clientIdSchema,
  bankAccountId: bankAccountIdSchema,
  name: bankAccountNameSchema,
});

export const deleteBankAccountRequestSchema = z.object({
  clientId: clientIdSchema,
  bankAccountId: bankAccountIdSchema,
});

/**
 * The bank-account API the preload script exposes to the renderer as
 * `window.bankAccounts`.
 */
export interface BankAccountsApi {
  list(clientId: ClientId): Promise<BankAccount[]>;
  create(clientId: ClientId, input: CreateBankAccountInput): Promise<BankAccount>;
  rename(clientId: ClientId, bankAccountId: number, name: string): Promise<BankAccount>;
  delete(clientId: ClientId, bankAccountId: number): Promise<void>;
}
