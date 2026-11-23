import type { IpcMain } from "electron";
import { z } from "zod";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import { templateClientRequestSchema } from "../../common/templates/accountTemplateSchemas";
import type { AccountTemplateService } from "../services/AccountTemplateService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for the master chart of accounts template.
 * @param ipcMain Electron's main-process IPC.
 * @param templates The service the handlers delegate to.
 */
export const registerAccountTemplateHandlers = (
  ipcMain: IpcMain,
  templates: AccountTemplateService,
): void => {
  handleValidated(ipcMain, APP_CHANNELS.TEMPLATES_INFO, z.undefined(), () =>
    templates.info(),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.TEMPLATES_SAVE_FROM_CLIENT,
    templateClientRequestSchema,
    ({ clientId }) => templates.saveFromClient(clientId),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.TEMPLATES_IMPORT_INTO_CLIENT,
    templateClientRequestSchema,
    ({ clientId }) => templates.importIntoClient(clientId),
  );
};
