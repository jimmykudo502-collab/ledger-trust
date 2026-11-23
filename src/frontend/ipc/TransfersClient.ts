import { contextBridge } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { TransfersApi } from "../../common/transfers/transferSchemas";
import { invokeResult } from "./invokeResult";

/**
 * The transfers IPC client.
 */
const transfersClient: TransfersApi = {
  review: (clientId) => invokeResult(APP_CHANNELS.TRANSFERS_REVIEW, { clientId }),
  match: (clientId, firstRowId, secondRowId) =>
    invokeResult(APP_CHANNELS.TRANSFERS_MATCH, { clientId, firstRowId, secondRowId }),
  matchAll: (clientId) => invokeResult(APP_CHANNELS.TRANSFERS_MATCH_ALL, { clientId }),
  unmatch: (clientId, matchId) => invokeResult(APP_CHANNELS.TRANSFERS_UNMATCH, { clientId, matchId }),
  notTransfer: (clientId, rowId) => invokeResult(APP_CHANNELS.TRANSFERS_NOT_TRANSFER, { clientId, rowId }),
};

/**
 * Exposes the transfers client to the renderer as `window.transfers`.
 */
export const exposeTransfersClient = (): void => {
  contextBridge.exposeInMainWorld("transfers", transfersClient);
};
