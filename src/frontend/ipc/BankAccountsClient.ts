import { contextBridge } from "electron";

import type { BankAccountsApi } from "../../common/bankAccounts/bankAccountSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import { invokeResult } from "./invokeResult";

/**
 * The bank-account IPC client.
 */
const bankAccountsClient: BankAccountsApi = {
  list: (clientId) => invokeResult(APP_CHANNELS.BANK_ACCOUNTS_LIST, { clientId }),
  create: (clientId, input) =>
    invokeResult(APP_CHANNELS.BANK_ACCOUNTS_CREATE, { clientId, input }),
  rename: (clientId, bankAccountId, name) =>
    invokeResult(APP_CHANNELS.BANK_ACCOUNTS_RENAME, { clientId, bankAccountId, name }),
  delete: (clientId, bankAccountId) =>
    invokeResult(APP_CHANNELS.BANK_ACCOUNTS_DELETE, { clientId, bankAccountId }),
};

/**
 * Exposes the bank-account client to the renderer as `window.bankAccounts`.
 */
export const exposeBankAccountsClient = (): void => {
  contextBridge.exposeInMainWorld("bankAccounts", bankAccountsClient);
};
