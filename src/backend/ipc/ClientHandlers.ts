import type { IpcMain } from "electron";
import { z } from "zod";

import {
  createClientInputSchema,
  renameClientRequestSchema,
  setArchivedRequestSchema,
  setFiscalYearEndRequestSchema,
} from "../../common/clients/clientSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { ClientService } from "../services/ClientService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for the client list.
 * @param ipcMain Electron's main-process IPC.
 * @param clients The client service the handlers delegate to.
 */
export const registerClientHandlers = (
  ipcMain: IpcMain,
  clients: ClientService,
): void => {
  handleValidated(ipcMain, APP_CHANNELS.CLIENTS_LIST, z.undefined(), () =>
    clients.list(),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.CLIENTS_CREATE,
    createClientInputSchema,
    (input) => clients.create(input),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.CLIENTS_RENAME,
    renameClientRequestSchema,
    ({ clientId, name }) => clients.rename(clientId, name),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.CLIENTS_SET_FISCAL_YEAR_END,
    setFiscalYearEndRequestSchema,
    ({ clientId, fiscalYearEnd }) =>
      clients.setFiscalYearEnd(clientId, fiscalYearEnd),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.CLIENTS_SET_ARCHIVED,
    setArchivedRequestSchema,
    ({ clientId, archived }) => clients.setArchived(clientId, archived),
  );
};
