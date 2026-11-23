import { z } from "zod";

import { clientIdSchema, type ClientId } from "../clients/clientSchemas";

/** Account types, which decide where an account appears in the statements (FR-5). */
export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const;

/** Display labels for account types. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

/** Roles of accounts the app creates and relies on. */
export const SYSTEM_ACCOUNT_KEYS = ["bank_transfer_control"] as const;

export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export const systemAccountKeySchema = z.enum(SYSTEM_ACCOUNT_KEYS);

/** An account code as typed in the coding grid, e.g. "4000". */
export const accountCodeSchema = z
  .string()
  .trim()
  .min(1, "Enter an account code.")
  .max(20, "Account codes can be at most 20 characters.");

export const accountNameSchema = z
  .string()
  .trim()
  .min(1, "Enter an account name.")
  .max(200, "Account names can be at most 200 characters.");

/** The editable fields of an account. */
export const accountInputSchema = z.object({
  code: accountCodeSchema,
  name: accountNameSchema,
  type: accountTypeSchema,
});

/** An account in a client's chart of accounts. */
export interface Account {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  /** Set for accounts the app requires, such as Bank Transfer Control. */
  readonly systemKey: SystemAccountKey | null;
  /** Whether any posted journal line uses this account. */
  readonly hasActivity: boolean;
}

export const accountIdSchema = z.number().int().positive();

/** IPC request: list a client's accounts. */
export const listAccountsRequestSchema = z.object({ clientId: clientIdSchema });

/** IPC request: add an account. */
export const createAccountRequestSchema = z.object({
  clientId: clientIdSchema,
  account: accountInputSchema,
});

/** IPC request: change an account. */
export const updateAccountRequestSchema = z.object({
  clientId: clientIdSchema,
  accountId: accountIdSchema,
  account: accountInputSchema,
});

/** IPC request: delete an account. */
export const deleteAccountRequestSchema = z.object({
  clientId: clientIdSchema,
  accountId: accountIdSchema,
});

export type AccountType = z.infer<typeof accountTypeSchema>;
export type SystemAccountKey = z.infer<typeof systemAccountKeySchema>;
export type AccountInput = z.infer<typeof accountInputSchema>;

/** Accounts every client gets when created (FR-7). */
export const SYSTEM_ACCOUNTS: readonly (AccountInput & {
  readonly systemKey: SystemAccountKey;
})[] = [
  {
    systemKey: "bank_transfer_control",
    code: "1999",
    name: "Bank Transfer Control",
    type: "asset",
  },
];

/**
 * Orders accounts by code, comparing digit runs as numbers ("900" before
 * "1000").
 * @param a First account.
 * @param b Second account.
 */
export const compareAccountsByCode = (
  a: Pick<Account, "code">,
  b: Pick<Account, "code">,
): number => a.code.localeCompare(b.code, undefined, { numeric: true });

/**
 * The chart-of-accounts API the preload script exposes to the renderer as
 * `window.chartOfAccounts`.
 */
export interface ChartOfAccountsApi {
  list(clientId: ClientId): Promise<Account[]>;
  create(clientId: ClientId, account: AccountInput): Promise<Account>;
  update(
    clientId: ClientId,
    accountId: number,
    account: AccountInput,
  ): Promise<Account>;
  delete(clientId: ClientId, accountId: number): Promise<void>;
}
