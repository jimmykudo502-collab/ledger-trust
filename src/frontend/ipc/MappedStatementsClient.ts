import { contextBridge } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { MappedStatementsApi } from "../../common/reports/mappedStatementSchemas";
import { invokeResult } from "./invokeResult";

/**
 * The mapped statements IPC client.
 */
const mappedStatementsClient: MappedStatementsApi = {
  balanceSheet: (clientId, options, map) => invokeResult(APP_CHANNELS.MAPPED_BALANCE_SHEET, { clientId, options, map }),
  incomeStatement: (clientId, options, map) => invokeResult(APP_CHANNELS.MAPPED_INCOME_STATEMENT, { clientId, options, map }),
  trialBalance: (clientId, options, map) => invokeResult(APP_CHANNELS.MAPPED_TRIAL_BALANCE, { clientId, options, map }),
};

/**
 * Exposes the mapped statements client to the renderer as
 * `window.mappedStatements`.
 */
export const exposeMappedStatementsClient = (): void => {
  contextBridge.exposeInMainWorld("mappedStatements", mappedStatementsClient);
};
