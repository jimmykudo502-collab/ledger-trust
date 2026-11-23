import { create } from "zustand";

import type {
  ClientSummary,
  CreateClientInput,
  FiscalYearEnd,
} from "../../common/clients/clientSchemas";
import { sortClients, upsertClient } from "./clientListLogic";

interface ClientState {
  /** Every client, sorted by name. */
  clients: ClientSummary[];
  /** The client whose books are open, if any. */
  selectedClientId: string | null;
  /** Whether the sidebar lists archived clients too. */
  showArchived: boolean;
  /** True while the client list is loading. */
  loading: boolean;
  /** Message from the last failed list load. */
  loadError: string | null;

  /** Loads the client list from the main process. */
  load(): Promise<void>;
  /** Opens a client's books. */
  select(clientId: string | null): void;
  /** Shows or hides archived clients. */
  setShowArchived(showArchived: boolean): void;
  /** Creates a client and opens it. Rejects with a user-facing message. */
  create(input: CreateClientInput): Promise<ClientSummary>;
  /** Renames a client. Rejects with a user-facing message. */
  rename(clientId: string, name: string): Promise<void>;
  /** Changes a client's year-end. Rejects with a user-facing message. */
  setFiscalYearEnd(clientId: string, fiscalYearEnd: FiscalYearEnd): Promise<void>;
  /** Creates the made-up demo client and opens it. */
  createDemo(): Promise<ClientSummary>;
  /** Archives or restores a client. Rejects with a user-facing message. */
  setArchived(clientId: string, archived: boolean): Promise<void>;
}

/**
 * Shared state for the client list and the selected client. Data lives in
 * the main process; this store only caches what `window.clients` returns.
 */
export const useClientStore = create<ClientState>()((set) => {
  const applyUpdate = (client: ClientSummary) =>
    set((state) => ({ clients: upsertClient(state.clients, client) }));

  return {
    clients: [],
    selectedClientId: null,
    showArchived: false,
    loading: false,
    loadError: null,

    load: async () => {
      set({ loading: true, loadError: null });
      try {
        const clients = await window.clients.list();
        set({ clients: sortClients(clients), loading: false });
      } catch (error) {
        set({
          loading: false,
          loadError: error instanceof Error ? error.message : String(error),
        });
      }
    },

    select: (clientId) => set({ selectedClientId: clientId }),

    setShowArchived: (showArchived) => set({ showArchived }),

    create: async (input) => {
      const client = await window.clients.create(input);
      set((state) => ({
        clients: upsertClient(state.clients, client),
        selectedClientId: client.id,
      }));
      return client;
    },

    createDemo: async () => {
      const client = await window.clients.createDemo();
      set((state) => ({
        clients: upsertClient(state.clients, client),
        selectedClientId: client.id,
      }));
      return client;
    },

    rename: async (clientId, name) => {
      applyUpdate(await window.clients.rename(clientId, name));
    },

    setFiscalYearEnd: async (clientId, fiscalYearEnd) => {
      applyUpdate(await window.clients.setFiscalYearEnd(clientId, fiscalYearEnd));
    },

    setArchived: async (clientId, archived) => {
      applyUpdate(await window.clients.setArchived(clientId, archived));
    },
  };
});
