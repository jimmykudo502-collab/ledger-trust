import { useState } from "react";

import {
  formatFiscalYearEnd,
  type ClientSummary,
} from "../../../common/clients/clientSchemas";
import { useClientStore } from "../../stores/useClientStore";
import { FiscalYearEndDialog, RenameClientDialog } from "./ClientDialogs";

type OpenDialog = "rename" | "fiscalYearEnd" | null;

interface ClientHeaderProps {
  client: ClientSummary;
}

/**
 * Title bar for the open client, with rename, year-end and archive actions.
 */
export function ClientHeader({ client }: ClientHeaderProps) {
  const setArchived = useClientStore((state) => state.setArchived);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [error, setError] = useState<string | null>(null);
  const archived = client.archivedAt !== null;

  const toggleArchived = async () => {
    if (
      !archived &&
      !window.confirm(
        `Archive ${client.name}? Its books are kept and you can restore it any time from "Show archived".`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await setArchived(client.id, !archived);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <header className="client-header">
      <div>
        <h2 className="client-title">
          {client.name}
          {archived && <span className="badge">Archived</span>}
        </h2>
        <p className="muted">
          Fiscal year-end: {formatFiscalYearEnd(client.fiscalYearEnd)}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="header-actions">
        <button type="button" className="button" onClick={() => setDialog("rename")}>
          Rename
        </button>
        <button
          type="button"
          className="button"
          onClick={() => setDialog("fiscalYearEnd")}
        >
          Change year-end
        </button>
        <button type="button" className="button" onClick={toggleArchived}>
          {archived ? "Restore" : "Archive"}
        </button>
      </div>

      {dialog === "rename" && (
        <RenameClientDialog client={client} onClose={() => setDialog(null)} />
      )}
      {dialog === "fiscalYearEnd" && (
        <FiscalYearEndDialog client={client} onClose={() => setDialog(null)} />
      )}
    </header>
  );
}
