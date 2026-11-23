import { contextBridge } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { CodingRulesApi } from "../../common/rules/ruleSchemas";
import { invokeResult } from "./invokeResult";

/**
 * The coding-rules IPC client.
 */
const codingRulesClient: CodingRulesApi = {
  list: (clientId) => invokeResult(APP_CHANNELS.RULES_LIST, { clientId }),
  create: (clientId, rule, applyNow) =>
    invokeResult(APP_CHANNELS.RULES_CREATE, { clientId, rule, applyNow }),
  delete: (clientId, ruleId) => invokeResult(APP_CHANNELS.RULES_DELETE, { clientId, ruleId }),
  apply: (clientId, bankAccountId) =>
    invokeResult(APP_CHANNELS.RULES_APPLY, { clientId, bankAccountId }),
};

/**
 * Exposes the coding-rules client to the renderer as `window.codingRules`.
 */
export const exposeCodingRulesClient = (): void => {
  contextBridge.exposeInMainWorld("codingRules", codingRulesClient);
};
