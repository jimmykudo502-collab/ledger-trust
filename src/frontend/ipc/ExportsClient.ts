import { contextBridge } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { ExportsApi } from "../../common/reports/exportSchemas";
import { invokeResult } from "./invokeResult";

/**
 * The export IPC client.
 */
const exportsClient: ExportsApi = {
  exportReport: (clientId, kind, options, format, presentation) =>
    invokeResult(APP_CHANNELS.EXPORTS_REPORT, { clientId, kind, options, format, presentation }),
  showInFolder: (path) => invokeResult(APP_CHANNELS.EXPORTS_SHOW, { path }),
};

/**
 * Exposes the export client to the renderer as `window.exports`.
 */
export const exposeExportsClient = (): void => {
  contextBridge.exposeInMainWorld("exports", exportsClient);
};
