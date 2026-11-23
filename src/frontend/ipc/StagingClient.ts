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
  removeBatch: (clientId, batchId) =>
    invokeResult(APP_CHANNELS.STAGING_REMOVE_BATCH, { clientId, batchId }),
};

/**
 * Exposes the staging client to the renderer as `window.staging`.
 */
export const exposeStagingClient = (): void => {
  contextBridge.exposeInMainWorld("staging", stagingClient);
};
