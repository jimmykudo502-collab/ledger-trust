import { contextBridge } from "electron";

import type { ImportsApi } from "../../common/imports/importSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import { invokeResult } from "./invokeResult";

/**
 * The import IPC client.
 */
const importsClient: ImportsApi = {
  openFile: () => invokeResult(APP_CHANNELS.IMPORTS_OPEN_FILE),
  openPaste: (text) => invokeResult(APP_CHANNELS.IMPORTS_OPEN_PASTE, { text }),
  analyze: (ref) => invokeResult(APP_CHANNELS.IMPORTS_ANALYZE, ref),
  preview: (ref, mapping) => invokeResult(APP_CHANNELS.IMPORTS_PREVIEW, { ...ref, mapping }),
  stage: (ref, mapping, excludedRows) =>
    invokeResult(APP_CHANNELS.IMPORTS_STAGE, { ...ref, mapping, excludedRows }),
  discard: (token) => invokeResult(APP_CHANNELS.IMPORTS_DISCARD, { token }),
};

/**
 * Exposes the import client to the renderer as `window.imports`.
 */
export const exposeImportsClient = (): void => {
  contextBridge.exposeInMainWorld("imports", importsClient);
};
