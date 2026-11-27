import type { IpcMain } from "electron";

import { fsMapSchema } from "../../common/fsMaps/fsMapSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import { reportRequestSchema } from "../../common/reports/reportSchemas";
import type { MappedStatementService } from "../services/MappedStatementService";
import { handleValidated } from "./handleValidated";

const mappedRequestSchema = reportRequestSchema.extend({ map: fsMapSchema });

/**
 * Registers the IPC handlers for statements rolled up by an FS map.
 * @param ipcMain Electron's main-process IPC.
 * @param mapped The service the handlers delegate to.
 */
export const registerMappedStatementHandlers = (ipcMain: IpcMain, mapped: MappedStatementService): void => {
  handleValidated(ipcMain, APP_CHANNELS.MAPPED_BALANCE_SHEET, mappedRequestSchema, ({ clientId, options, map }) =>
    mapped.balanceSheet(clientId, options, map),
  );
  handleValidated(ipcMain, APP_CHANNELS.MAPPED_INCOME_STATEMENT, mappedRequestSchema, ({ clientId, options, map }) =>
    mapped.incomeStatement(clientId, options, map),
  );
  handleValidated(ipcMain, APP_CHANNELS.MAPPED_TRIAL_BALANCE, mappedRequestSchema, ({ clientId, options, map }) =>
    mapped.trialBalance(clientId, options, map),
  );
};
