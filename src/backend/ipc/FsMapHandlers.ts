import type { IpcMain } from "electron";

import {
  assignFsLineRequestSchema,
  createFsLineRequestSchema,
  deleteFsLineRequestSchema,
  fsOverviewRequestSchema,
  starterLinesRequestSchema,
  updateFsLineRequestSchema,
} from "../../common/fsMaps/fsMapSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { FsMapService } from "../services/FsMapService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for the internal and external FS maps.
 * @param ipcMain Electron's main-process IPC.
 * @param fsMaps The service the handlers delegate to.
 */
export const registerFsMapHandlers = (ipcMain: IpcMain, fsMaps: FsMapService): void => {
  handleValidated(ipcMain, APP_CHANNELS.FS_MAPS_OVERVIEW, fsOverviewRequestSchema, ({ clientId }) => fsMaps.overview(clientId));
  handleValidated(ipcMain, APP_CHANNELS.FS_MAPS_CREATE_LINE, createFsLineRequestSchema, ({ clientId, map, line }) =>
    fsMaps.createLine(clientId, map, line),
  );
  handleValidated(ipcMain, APP_CHANNELS.FS_MAPS_UPDATE_LINE, updateFsLineRequestSchema, ({ clientId, lineId, line }) =>
    fsMaps.updateLine(clientId, lineId, line),
  );
  handleValidated(ipcMain, APP_CHANNELS.FS_MAPS_DELETE_LINE, deleteFsLineRequestSchema, ({ clientId, lineId }) =>
    fsMaps.deleteLine(clientId, lineId),
  );
  handleValidated(ipcMain, APP_CHANNELS.FS_MAPS_ASSIGN, assignFsLineRequestSchema, ({ clientId, map, accountIds, lineId }) =>
    fsMaps.assign(clientId, map, accountIds, lineId),
  );
  handleValidated(ipcMain, APP_CHANNELS.FS_MAPS_ADD_STARTER_LINES, starterLinesRequestSchema, ({ clientId, map }) =>
    fsMaps.addStarterLines(clientId, map),
  );
};
