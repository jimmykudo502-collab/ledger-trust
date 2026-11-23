import type { IpcMain } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import {
  closeRequestSchema,
  lockRequestSchema,
  overviewRequestSchema,
  reverseRequestSchema,
  unlockRequestSchema,
} from "../../common/years/yearSchemas";
import type { FiscalYearService } from "../services/FiscalYearService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for period locks, year-end close and reversals.
 * @param ipcMain Electron's main-process IPC.
 * @param years The service the handlers delegate to.
 */
export const registerYearEndHandlers = (ipcMain: IpcMain, years: FiscalYearService): void => {
  handleValidated(ipcMain, APP_CHANNELS.YEARS_OVERVIEW, overviewRequestSchema, ({ clientId }) => years.overview(clientId));
  handleValidated(ipcMain, APP_CHANNELS.YEARS_LOCK, lockRequestSchema, ({ clientId, yearEnd }) => years.lock(clientId, yearEnd));
  handleValidated(ipcMain, APP_CHANNELS.YEARS_UNLOCK, unlockRequestSchema, ({ clientId, yearEnd }) => years.unlock(clientId, yearEnd));
  handleValidated(
    ipcMain,
    APP_CHANNELS.YEARS_CLOSE,
    closeRequestSchema,
    ({ clientId, yearEnd, retainedEarningsAccountId }) => years.close(clientId, yearEnd, retainedEarningsAccountId),
  );
  handleValidated(ipcMain, APP_CHANNELS.YEARS_REVERSE, reverseRequestSchema, ({ clientId, entryId, date }) =>
    years.reverse(clientId, entryId, date),
  );
};
