import type { IpcMain } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import { reportRequestSchema } from "../../common/reports/reportSchemas";
import type { ReportService } from "../services/ReportService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for the core reports.
 * @param ipcMain Electron's main-process IPC.
 * @param reports The service the handlers delegate to.
 */
export const registerReportHandlers = (ipcMain: IpcMain, reports: ReportService): void => {
  handleValidated(ipcMain, APP_CHANNELS.REPORTS_TRIAL_BALANCE, reportRequestSchema, ({ clientId, options }) =>
    reports.trialBalance(clientId, options),
  );
  handleValidated(ipcMain, APP_CHANNELS.REPORTS_GENERAL_LEDGER, reportRequestSchema, ({ clientId, options }) =>
    reports.generalLedger(clientId, options),
  );
  handleValidated(ipcMain, APP_CHANNELS.REPORTS_BALANCE_SHEET, reportRequestSchema, ({ clientId, options }) =>
    reports.balanceSheet(clientId, options),
  );
  handleValidated(ipcMain, APP_CHANNELS.REPORTS_INCOME_STATEMENT, reportRequestSchema, ({ clientId, options }) =>
    reports.incomeStatement(clientId, options),
  );
};
