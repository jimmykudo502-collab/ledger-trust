import { contextBridge } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { ReportsApi } from "../../common/reports/reportSchemas";
import { invokeResult } from "./invokeResult";

/**
 * The reports IPC client.
 */
const reportsClient: ReportsApi = {
  trialBalance: (clientId, options) => invokeResult(APP_CHANNELS.REPORTS_TRIAL_BALANCE, { clientId, options }),
  generalLedger: (clientId, options) => invokeResult(APP_CHANNELS.REPORTS_GENERAL_LEDGER, { clientId, options }),
  balanceSheet: (clientId, options) => invokeResult(APP_CHANNELS.REPORTS_BALANCE_SHEET, { clientId, options }),
  incomeStatement: (clientId, options) => invokeResult(APP_CHANNELS.REPORTS_INCOME_STATEMENT, { clientId, options }),
};

/**
 * Exposes the reports client to the renderer as `window.reports`.
 */
export const exposeReportsClient = (): void => {
  contextBridge.exposeInMainWorld("reports", reportsClient);
};
