import { BrowserWindow, dialog, type IpcMain, type OpenDialogOptions } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import {
  analyzeRequestSchema,
  discardRequestSchema,
  pasteRequestSchema,
  previewRequestSchema,
  stageRequestSchema,
} from "../../common/imports/importSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { ImportService } from "../services/ImportService";
import { handleValidated } from "./handleValidated";

const OPEN_OPTIONS: OpenDialogOptions = {
  title: "Choose a bank or credit card write-up",
  properties: ["openFile"],
  filters: [{ name: "Spreadsheets", extensions: ["xlsx", "ods"] }],
};

/**
 * Registers the IPC handlers for importing bank write-ups.
 * @param ipcMain Electron's main-process IPC.
 * @param imports The service the handlers delegate to.
 */
export const registerImportHandlers = (ipcMain: IpcMain, imports: ImportService): void => {
  handleValidated(ipcMain, APP_CHANNELS.IMPORTS_OPEN_FILE, z.undefined(), async (_request, event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, OPEN_OPTIONS)
      : await dialog.showOpenDialog(OPEN_OPTIONS);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    return imports.openFile(path.basename(filePath), await fs.readFile(filePath));
  });
  handleValidated(ipcMain, APP_CHANNELS.IMPORTS_OPEN_PASTE, pasteRequestSchema, ({ text }) =>
    imports.openPaste(text),
  );
  handleValidated(ipcMain, APP_CHANNELS.IMPORTS_ANALYZE, analyzeRequestSchema, (ref) =>
    imports.analyze(ref),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.IMPORTS_PREVIEW,
    previewRequestSchema,
    ({ mapping, ...ref }) => imports.preview(ref, mapping),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.IMPORTS_STAGE,
    stageRequestSchema,
    ({ mapping, excludedRows, ...ref }) => imports.stage(ref, mapping, excludedRows),
  );
  handleValidated(ipcMain, APP_CHANNELS.IMPORTS_DISCARD, discardRequestSchema, ({ token }) =>
    imports.discard(token),
  );
};
