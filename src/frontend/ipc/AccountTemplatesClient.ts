import { contextBridge } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { AccountTemplatesApi } from "../../common/templates/accountTemplateSchemas";
import { invokeResult } from "./invokeResult";

/**
 * The master-template IPC client.
 */
const accountTemplatesClient: AccountTemplatesApi = {
  info: () => invokeResult(APP_CHANNELS.TEMPLATES_INFO),
  saveFromClient: (clientId) =>
    invokeResult(APP_CHANNELS.TEMPLATES_SAVE_FROM_CLIENT, { clientId }),
  importIntoClient: (clientId) =>
    invokeResult(APP_CHANNELS.TEMPLATES_IMPORT_INTO_CLIENT, { clientId }),
};

/**
 * Exposes the master-template client to the renderer as
 * `window.accountTemplates`.
 */
export const exposeAccountTemplatesClient = (): void => {
  contextBridge.exposeInMainWorld("accountTemplates", accountTemplatesClient);
};
