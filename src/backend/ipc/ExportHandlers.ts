import { app, BrowserWindow, dialog, shell, type IpcMain, type SaveDialogOptions } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

import { exportRequestSchema, showExportRequestSchema } from "../../common/reports/exportSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import { UserFacingError } from "../errors";
import type { ExportService } from "../services/ExportService";
import { handleValidated } from "./handleValidated";

const FILTERS = {
  pdf: [{ name: "PDF", extensions: ["pdf"] }],
  xlsx: [{ name: "Excel workbook", extensions: ["xlsx"] }],
};

/**
 * Registers the IPC handlers for exporting reports (FR-32): ask where to
 * save, then write the file.
 * @param ipcMain Electron's main-process IPC.
 * @param exports The service that builds export files.
 */
export const registerExportHandlers = (ipcMain: IpcMain, exports: ExportService): void => {
  // Only files this session exported can be revealed in the file explorer.
  const exported = new Set<string>();

  handleValidated(ipcMain, APP_CHANNELS.EXPORTS_REPORT, exportRequestSchema, async ({ clientId, kind, options, format }, event) => {
    const file = await exports.export(clientId, kind, options, format);
    const window = BrowserWindow.fromWebContents(event.sender);
    const saveOptions: SaveDialogOptions = {
      title: "Save report",
      defaultPath: path.join(app.getPath("documents"), file.fileName),
      filters: FILTERS[format],
    };
    const result = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, file.bytes);
    exported.add(result.filePath);
    return { path: result.filePath };
  });

  handleValidated(ipcMain, APP_CHANNELS.EXPORTS_SHOW, showExportRequestSchema, ({ path: filePath }) => {
    if (!exported.has(filePath)) throw new UserFacingError("Only files exported in this session can be shown.");
    shell.showItemInFolder(filePath);
  });
};
