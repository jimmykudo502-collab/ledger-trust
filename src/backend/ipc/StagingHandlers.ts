import type { IpcMain } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import {
  listStagedRequestSchema,
  removeBatchRequestSchema,
} from "../../common/staging/stagingSchemas";
import type { StagingService } from "../services/StagingService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for staged transactions.
 * @param ipcMain Electron's main-process IPC.
 * @param staging The service the handlers delegate to.
 */
export const registerStagingHandlers = (ipcMain: IpcMain, staging: StagingService): void => {
  handleValidated(
    ipcMain,
    APP_CHANNELS.STAGING_LIST,
    listStagedRequestSchema,
    ({ clientId, bankAccountId }) => staging.list(clientId, bankAccountId),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.STAGING_REMOVE_BATCH,
    removeBatchRequestSchema,
    ({ clientId, batchId }) => staging.removeBatch(clientId, batchId),
  );
};
