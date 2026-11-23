import { contextBridge } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import type { JournalEntriesApi } from "../../common/journal/journalSchemas";
import { invokeResult } from "./invokeResult";

/**
 * The journal entry IPC client.
 */
const journalEntriesClient: JournalEntriesApi = {
  list: (clientId) => invokeResult(APP_CHANNELS.ENTRIES_LIST, { clientId }),
  create: (clientId, entry) => invokeResult(APP_CHANNELS.ENTRIES_CREATE, { clientId, entry }),
  update: (clientId, entryId, entry) => invokeResult(APP_CHANNELS.ENTRIES_UPDATE, { clientId, entryId, entry }),
  delete: (clientId, entryId) => invokeResult(APP_CHANNELS.ENTRIES_DELETE, { clientId, entryId }),
};

/**
 * Exposes the journal entry client to the renderer as `window.journalEntries`.
 */
export const exposeJournalEntriesClient = (): void => {
  contextBridge.exposeInMainWorld("journalEntries", journalEntriesClient);
};
