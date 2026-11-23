import type { IpcMain } from "electron";

import {
  createBankAccountRequestSchema,
  deleteBankAccountRequestSchema,
  listBankAccountsRequestSchema,
  renameBankAccountRequestSchema,
} from "../../common/bankAccounts/bankAccountSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { BankAccountService } from "../services/BankAccountService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for bank account and credit card tabs.
 * @param ipcMain Electron's main-process IPC.
 * @param bankAccounts The service the handlers delegate to.
 */
export const registerBankAccountHandlers = (
  ipcMain: IpcMain,
  bankAccounts: BankAccountService,
): void => {
  handleValidated(
    ipcMain,
    APP_CHANNELS.BANK_ACCOUNTS_LIST,
    listBankAccountsRequestSchema,
    ({ clientId }) => bankAccounts.list(clientId),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.BANK_ACCOUNTS_CREATE,
    createBankAccountRequestSchema,
    ({ clientId, input }) => bankAccounts.create(clientId, input),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.BANK_ACCOUNTS_RENAME,
    renameBankAccountRequestSchema,
    ({ clientId, bankAccountId, name }) =>
      bankAccounts.rename(clientId, bankAccountId, name),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.BANK_ACCOUNTS_DELETE,
    deleteBankAccountRequestSchema,
    ({ clientId, bankAccountId }) => bankAccounts.delete(clientId, bankAccountId),
  );
};
