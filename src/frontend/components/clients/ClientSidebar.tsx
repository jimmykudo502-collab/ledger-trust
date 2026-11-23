import { useState } from "react";

import { formatFiscalYearEnd } from "../../../common/clients/clientSchemas";
import { visibleClients } from "../../stores/clientListLogic";
import { useClientStore } from "../../stores/useClientStore";
import { NewClientDialog } from "./ClientDialogs";

/**
 * The left-hand client list (FR-1): pick a client, create one, and choose
 * whether archived clients are shown.
 */
export function ClientSidebar() {
  const clients = useClientStore((state) => state.clients);
  const selectedClientId = useClientStore((state) => state.selectedClientId);
  const showArchived = useClientStore((state) => state.showArchived);
  const loading = useClientStore((state) => state.loading);
  const loadError = useClientStore((state) => state.loadError);
  const select = useClientStore((state) => state.select);
  const setShowArchived = useClientStore((state) => state.setShowArchived);
  const [creating, setCreating] = useState(false);

  const shown = visibleClients(clients, showArchived);
  const archivedCount = clients.length - visibleClients(clients, false).length;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="app-title">Ledger Trust</h1>
        <button
          type="button"
          className="button primary"
          onClick={() => setCreating(true)}
        >
          + New client
        </button>
      </div>

      <h2 className="sidebar-section">Clients</h2>
      {loading && <p className="muted">Loading…</p>}
      {loadError && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {!loading && shown.length === 0 && (
        <p className="muted">No clients yet.</p>
      )}
      <ul className="client-list">
        {shown.map((client) => (
          <li key={client.id}>
            <button
              type="button"
              className={`client-item${client.id === selectedClientId ? " selected" : ""}`}
              onClick={() => select(client.id)}
            >
              <span className="client-name">{client.name}</span>
              <span className="client-meta">
                Year-end {formatFiscalYearEnd(client.fiscalYearEnd)}
                {client.archivedAt && <span className="badge">Archived</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <label className="sidebar-toggle">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        Show archived ({archivedCount})
      </label>

      {creating && <NewClientDialog onClose={() => setCreating(false)} />}
    </aside>
  );
}
