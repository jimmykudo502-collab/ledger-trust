import type { IpcMain } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import {
  applyRulesRequestSchema,
  createRuleRequestSchema,
  deleteRuleRequestSchema,
  listRulesRequestSchema,
} from "../../common/rules/ruleSchemas";
import type { CodingRuleService } from "../services/CodingRuleService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for remembered coding rules.
 * @param ipcMain Electron's main-process IPC.
 * @param rules The service the handlers delegate to.
 */
export const registerCodingRuleHandlers = (ipcMain: IpcMain, rules: CodingRuleService): void => {
  handleValidated(ipcMain, APP_CHANNELS.RULES_LIST, listRulesRequestSchema, ({ clientId }) =>
    rules.list(clientId),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.RULES_CREATE,
    createRuleRequestSchema,
    ({ clientId, rule, applyNow }) => rules.create(clientId, rule, applyNow),
  );
  handleValidated(ipcMain, APP_CHANNELS.RULES_DELETE, deleteRuleRequestSchema, ({ clientId, ruleId }) =>
    rules.delete(clientId, ruleId),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.RULES_APPLY,
    applyRulesRequestSchema,
    ({ clientId, bankAccountId }) => rules.apply(clientId, bankAccountId),
  );
};
