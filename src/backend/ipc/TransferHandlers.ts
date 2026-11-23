import type { IpcMain } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import {
  matchRequestSchema,
  notTransferRequestSchema,
  reviewRequestSchema,
  unmatchRequestSchema,
} from "../../common/transfers/transferSchemas";
import type { TransferService } from "../services/TransferService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for transfer matching and the control account
 * review.
 * @param ipcMain Electron's main-process IPC.
 * @param transfers The service the handlers delegate to.
 */
export const registerTransferHandlers = (ipcMain: IpcMain, transfers: TransferService): void => {
  handleValidated(ipcMain, APP_CHANNELS.TRANSFERS_REVIEW, reviewRequestSchema, ({ clientId }) =>
    transfers.review(clientId),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.TRANSFERS_MATCH,
    matchRequestSchema,
    ({ clientId, firstRowId, secondRowId }) => transfers.match(clientId, firstRowId, secondRowId),
  );
  handleValidated(ipcMain, APP_CHANNELS.TRANSFERS_MATCH_ALL, reviewRequestSchema, ({ clientId }) =>
    transfers.matchAll(clientId),
  );
  handleValidated(ipcMain, APP_CHANNELS.TRANSFERS_UNMATCH, unmatchRequestSchema, ({ clientId, matchId }) =>
    transfers.unmatch(clientId, matchId),
  );
  handleValidated(ipcMain, APP_CHANNELS.TRANSFERS_NOT_TRANSFER, notTransferRequestSchema, ({ clientId, rowId }) =>
    transfers.notTransfer(clientId, rowId),
  );
};
