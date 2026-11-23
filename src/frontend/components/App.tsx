import { useEffect } from "react";

import { useClientStore } from "../stores/useClientStore";
import { ChartOfAccounts } from "./accounts/ChartOfAccounts";
import { ClientHeader } from "./clients/ClientHeader";
import { ClientSidebar } from "./clients/ClientSidebar";

/**
 * The app shell: client list on the left, the open client's books on the
 * right.
 */
export function App() {
  const load = useClientStore((state) => state.load);
  const selectedClient = useClientStore((state) =>
    state.clients.find((client) => client.id === state.selectedClientId),
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="app-layout">
      <ClientSidebar />
      <main className="workspace">
        {selectedClient ? (
          <>
            <ClientHeader client={selectedClient} />
            <ChartOfAccounts key={selectedClient.id} clientId={selectedClient.id} />
          </>
        ) : (
          <div className="empty-state">
            <h2>No client open</h2>
            <p className="muted">
              Pick a client on the left, or create one with “New client”.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
