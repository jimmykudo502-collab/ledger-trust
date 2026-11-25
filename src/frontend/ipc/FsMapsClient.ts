import { contextBridge } from "electron";

import type { FsMapsApi } from "../../common/fsMaps/fsMapSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import { invokeResult } from "./invokeResult";

/**
 * The FS maps IPC client.
 */
const fsMapsClient: FsMapsApi = {
  overview: (clientId) => invokeResult(APP_CHANNELS.FS_MAPS_OVERVIEW, { clientId }),
  createLine: (clientId, map, line) => invokeResult(APP_CHANNELS.FS_MAPS_CREATE_LINE, { clientId, map, line }),
  updateLine: (clientId, lineId, line) => invokeResult(APP_CHANNELS.FS_MAPS_UPDATE_LINE, { clientId, lineId, line }),
  deleteLine: (clientId, lineId) => invokeResult(APP_CHANNELS.FS_MAPS_DELETE_LINE, { clientId, lineId }),
  assign: (clientId, map, accountIds, lineId) =>
    invokeResult(APP_CHANNELS.FS_MAPS_ASSIGN, { clientId, map, accountIds: [...accountIds], lineId }),
  addStarterLines: (clientId, map) => invokeResult(APP_CHANNELS.FS_MAPS_ADD_STARTER_LINES, { clientId, map }),
};

/**
 * Exposes the FS maps client to the renderer as `window.fsMaps`.
 */
export const exposeFsMapsClient = (): void => {
  contextBridge.exposeInMainWorld("fsMaps", fsMapsClient);
};
