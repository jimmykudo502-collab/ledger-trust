import type { IpcMain } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import {
  listStagedRequestSchema,
  postRequestSchema,
  removeBatchRequestSchema,
  setCodeRequestSchema,
  unpostRequestSchema,
} from "../../common/staging/stagingSchemas";
import type { BankPostingService } from "../services/BankPostingService";
import type { CodingService } from "../services/CodingService";
import type { StagingService } from "../services/StagingService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for staged transactions: imports, coding and
 * posting.
 * @param ipcMain Electron's main-process IPC.
 * @param staging Lists and removes imports.
 * @param coding Lists and codes rows.
 * @param posting Posts and unposts rows.
 */
export const registerStagingHandlers = (
  ipcMain: IpcMain,
  staging: StagingService,
  coding: CodingService,
  posting: BankPostingService,
): void => {
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
  handleValidated(
    ipcMain,
    APP_CHANNELS.STAGING_ROWS,
    listStagedRequestSchema,
    ({ clientId, bankAccountId }) => coding.rows(clientId, bankAccountId),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.STAGING_SET_CODE,
    setCodeRequestSchema,
    ({ clientId, bankAccountId, rowIds, code }) => coding.setCode(clientId, bankAccountId, rowIds, code),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.STAGING_POST,
    postRequestSchema,
    ({ clientId, bankAccountId }) => posting.post(clientId, bankAccountId),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.STAGING_UNPOST,
    unpostRequestSchema,
    ({ clientId, rowId }) => posting.unpost(clientId, rowId),
  );
};
