import type { IpcMain } from "electron";

import {
  createAccountRequestSchema,
  deleteAccountRequestSchema,
  listAccountsRequestSchema,
  updateAccountRequestSchema,
} from "../../common/accounts/accountSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { ChartOfAccountsService } from "../services/ChartOfAccountsService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for the chart of accounts.
 * @param ipcMain Electron's main-process IPC.
 * @param chartOfAccounts The service the handlers delegate to.
 */
export const registerChartOfAccountsHandlers = (
  ipcMain: IpcMain,
  chartOfAccounts: ChartOfAccountsService,
): void => {
  handleValidated(
    ipcMain,
    APP_CHANNELS.ACCOUNTS_LIST,
    listAccountsRequestSchema,
    ({ clientId }) => chartOfAccounts.list(clientId),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.ACCOUNTS_CREATE,
    createAccountRequestSchema,
    ({ clientId, account }) => chartOfAccounts.create(clientId, account),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.ACCOUNTS_UPDATE,
    updateAccountRequestSchema,
    ({ clientId, accountId, account }) =>
      chartOfAccounts.update(clientId, accountId, account),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.ACCOUNTS_DELETE,
    deleteAccountRequestSchema,
    ({ clientId, accountId }) => chartOfAccounts.delete(clientId, accountId),
  );
};
