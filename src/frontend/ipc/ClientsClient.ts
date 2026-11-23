import { contextBridge } from "electron";

import type { ClientsApi } from "../../common/clients/clientSchemas";
import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import { invokeResult } from "./invokeResult";

/**
 * The client-list IPC client.
 */
const clientsClient: ClientsApi = {
  list: () => invokeResult(APP_CHANNELS.CLIENTS_LIST),
  create: (input) => invokeResult(APP_CHANNELS.CLIENTS_CREATE, input),
  rename: (clientId, name) =>
    invokeResult(APP_CHANNELS.CLIENTS_RENAME, { clientId, name }),
  setFiscalYearEnd: (clientId, fiscalYearEnd) =>
    invokeResult(APP_CHANNELS.CLIENTS_SET_FISCAL_YEAR_END, {
      clientId,
      fiscalYearEnd,
    }),
  setArchived: (clientId, archived) =>
    invokeResult(APP_CHANNELS.CLIENTS_SET_ARCHIVED, { clientId, archived }),
};

/**
 * Exposes the client-list client to the renderer as `window.clients`.
 */
export const exposeClientsClient = (): void => {
  contextBridge.exposeInMainWorld("clients", clientsClient);
};
