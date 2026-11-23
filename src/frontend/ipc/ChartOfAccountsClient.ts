import { contextBridge } from "electron";

import type { ChartOfAccountsApi } from "../../common/accounts/accountSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import { invokeResult } from "./invokeResult";

/**
 * The chart-of-accounts IPC client.
 */
const chartOfAccountsClient: ChartOfAccountsApi = {
  list: (clientId) => invokeResult(APP_CHANNELS.ACCOUNTS_LIST, { clientId }),
  create: (clientId, account) =>
    invokeResult(APP_CHANNELS.ACCOUNTS_CREATE, { clientId, account }),
  update: (clientId, accountId, account) =>
    invokeResult(APP_CHANNELS.ACCOUNTS_UPDATE, { clientId, accountId, account }),
  delete: (clientId, accountId) =>
    invokeResult(APP_CHANNELS.ACCOUNTS_DELETE, { clientId, accountId }),
};

/**
 * Exposes the chart-of-accounts client to the renderer as
 * `window.chartOfAccounts`.
 */
export const exposeChartOfAccountsClient = (): void => {
  contextBridge.exposeInMainWorld("chartOfAccounts", chartOfAccountsClient);
};
