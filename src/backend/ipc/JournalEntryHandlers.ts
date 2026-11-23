import type { IpcMain } from "electron";

import { APP_CHANNELS } from "../../common/ipc/AppChannels";
import {
  createEntryRequestSchema,
  deleteEntryRequestSchema,
  listEntriesRequestSchema,
  updateEntryRequestSchema,
} from "../../common/journal/journalSchemas";
import type { ManualEntryService } from "../services/ManualEntryService";
import { handleValidated } from "./handleValidated";

/**
 * Registers the IPC handlers for manual journal entries.
 * @param ipcMain Electron's main-process IPC.
 * @param entries The service the handlers delegate to.
 */
export const registerJournalEntryHandlers = (ipcMain: IpcMain, entries: ManualEntryService): void => {
  handleValidated(ipcMain, APP_CHANNELS.ENTRIES_LIST, listEntriesRequestSchema, ({ clientId }) =>
    entries.list(clientId),
  );
  handleValidated(ipcMain, APP_CHANNELS.ENTRIES_CREATE, createEntryRequestSchema, ({ clientId, entry }) =>
    entries.create(clientId, entry),
  );
  handleValidated(
    ipcMain,
    APP_CHANNELS.ENTRIES_UPDATE,
    updateEntryRequestSchema,
    ({ clientId, entryId, entry }) => entries.update(clientId, entryId, entry),
  );
  handleValidated(ipcMain, APP_CHANNELS.ENTRIES_DELETE, deleteEntryRequestSchema, ({ clientId, entryId }) =>
    entries.delete(clientId, entryId),
  );
};
