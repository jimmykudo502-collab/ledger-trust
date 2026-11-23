import { contextBridge } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { YearEndApi } from "../../common/years/yearSchemas";
import { invokeResult } from "./invokeResult";

/**
 * The year-end IPC client.
 */
const yearEndClient: YearEndApi = {
  overview: (clientId) => invokeResult(APP_CHANNELS.YEARS_OVERVIEW, { clientId }),
  lock: (clientId, yearEnd) => invokeResult(APP_CHANNELS.YEARS_LOCK, { clientId, yearEnd }),
  unlock: (clientId, yearEnd) => invokeResult(APP_CHANNELS.YEARS_UNLOCK, { clientId, yearEnd }),
  close: (clientId, yearEnd, retainedEarningsAccountId) =>
    invokeResult(APP_CHANNELS.YEARS_CLOSE, { clientId, yearEnd, retainedEarningsAccountId }),
  reverse: (clientId, entryId, date) => invokeResult(APP_CHANNELS.YEARS_REVERSE, { clientId, entryId, date }),
};

/**
 * Exposes the year-end client to the renderer as `window.yearEnd`.
 */
export const exposeYearEndClient = (): void => {
  contextBridge.exposeInMainWorld("yearEnd", yearEndClient);
};
