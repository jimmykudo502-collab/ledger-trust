import { contextBridge } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { StagingApi } from "../../common/staging/stagingSchemas";
import { invokeResult } from "./invokeResult";

/**
 * The staging IPC client.
 */
const stagingClient: StagingApi = {
  list: (clientId, bankAccountId) =>
    invokeResult(APP_CHANNELS.STAGING_LIST, { clientId, bankAccountId }),
  rows: (clientId, bankAccountId) =>
    invokeResult(APP_CHANNELS.STAGING_ROWS, { clientId, bankAccountId }),
  removeBatch: (clientId, batchId) =>
    invokeResult(APP_CHANNELS.STAGING_REMOVE_BATCH, { clientId, batchId }),
  setCode: (clientId, bankAccountId, rowIds, code) =>
    invokeResult(APP_CHANNELS.STAGING_SET_CODE, { clientId, bankAccountId, rowIds, code }),
  post: (clientId, bankAccountId) =>
    invokeResult(APP_CHANNELS.STAGING_POST, { clientId, bankAccountId }),
  unpost: (clientId, rowId) => invokeResult(APP_CHANNELS.STAGING_UNPOST, { clientId, rowId }),
};

/**
 * Exposes the staging client to the renderer as `window.staging`.
 */
export const exposeStagingClient = (): void => {
  contextBridge.exposeInMainWorld("staging", stagingClient);
};
