import { useCallback, useEffect, useState } from "react";

import {
  ACCOUNT_TYPE_LABELS,
  type Account,
  type AccountInput,
} from "../../../common/accounts/accountSchemas";
import { FS_MAPS, type FsMap, type FsMapOverview } from "../../../common/fsMaps/fsMapSchemas";
import { FsLineSelect } from "../fsMaps/FsLineSelect";
import { unmappedAccounts } from "../fsMaps/fsMapLogic";
import { AccountDialog } from "./AccountDialog";
import { filterAccounts } from "./accountFilter";
import { TemplateActions } from "./TemplateActions";

interface ChartOfAccountsProps {
  clientId: string;
}

type DialogState = { mode: "add" } | { mode: "edit"; account: Account } | null;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * The open client's chart of accounts (FR-4, FR-5): list, search, add, edit
 * and delete accounts, and set each account's internal and external FS map
 * line (FR-34).
 */
export function ChartOfAccounts({ clientId }: ChartOfAccountsProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [fsOverview, setFsOverview] = useState<FsMapOverview>({ lines: [], assignments: [] });

  const reload = useCallback(async () => {
    try {
      const [nextAccounts, nextOverview] = await Promise.all([
        window.chartOfAccounts.list(clientId),
        window.fsMaps.overview(clientId),
      ]);
      setAccounts(nextAccounts);
      setFsOverview(nextOverview);
      setError(null);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setLoading(true);
    setQuery("");
    void reload();
  }, [reload]);

  const save = async (input: AccountInput) => {
    if (dialog?.mode === "edit") {
      await window.chartOfAccounts.update(clientId, dialog.account.id, input);
    } else {
      await window.chartOfAccounts.create(clientId, input);
    }
    await reload();
  };

  const remove = async (account: Account) => {
    if (!window.confirm(`Delete account ${account.code} ${account.name}?`)) {
      return;
    }
    try {
      await window.chartOfAccounts.delete(clientId, account.id);
      await reload();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const assignFs = async (accountId: number, map: FsMap, lineId: number | null) => {
    try {
      await window.fsMaps.assign(clientId, map, [accountId], lineId);
      await reload();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const shown = filterAccounts(accounts, query);
  const assignmentOf = new Map(fsOverview.assignments.map((a) => [a.accountId, a]));
  const hasFsLines = fsOverview.lines.length > 0;
  const unmappedText = FS_MAPS.map((map) => {
    const count = unmappedAccounts(accounts, fsOverview.lines, fsOverview.assignments, map).length;
    return `${count} not mapped on the ${map} map`;
  }).join(", ");

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>Chart of accounts</h3>
        <div className="panel-actions">
          <input
            type="search"
            className="search"
            placeholder="Search code or name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="button primary"
            onClick={() => setDialog({ mode: "add" })}
          >
            + Add account
          </button>
        </div>
      </div>

      <TemplateActions
        clientId={clientId}
        ownAccountCount={accounts.filter((a) => a.systemKey === null).length}
        onImported={() => void reload()}
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th className="code-col">Code</th>
            <th>Name</th>
            <th className="type-col">Type</th>
            {hasFsLines && <th>Internal FS line</th>}
            {hasFsLines && <th>External FS line</th>}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={hasFsLines ? 6 : 4} className="muted">
                Loading…
              </td>
            </tr>
          )}
          {!loading && shown.length === 0 && (
            <tr>
              <td colSpan={hasFsLines ? 6 : 4} className="muted">
                {accounts.length === 0 ? "No accounts yet." : "No accounts match your search."}
              </td>
            </tr>
          )}
          {shown.map((account) => (
            <tr key={account.id}>
              <td className="code-col">{account.code}</td>
              <td>
                {account.name}
                {account.systemKey && <span className="badge">System</span>}
                {account.hasActivity && <span className="badge">Has entries</span>}
              </td>
              <td className="type-col">{ACCOUNT_TYPE_LABELS[account.type]}</td>
              {hasFsLines &&
                FS_MAPS.map((map) => (
                  <td key={map}>
                    <FsLineSelect
                      map={map}
                      accountType={account.type}
                      lines={fsOverview.lines}
                      value={assignmentOf.get(account.id)?.[map] ?? null}
                      onChange={(lineId) => void assignFs(account.id, map, lineId)}
                    />
                  </td>
                ))}
              <td className="row-actions">
                <button
                  type="button"
                  className="button small"
                  onClick={() => setDialog({ mode: "edit", account })}
                >
                  Edit
                </button>
                {!account.systemKey && !account.hasActivity && (
                  <button
                    type="button"
                    className="button small danger"
                    onClick={() => void remove(account)}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        {accounts.length} account{accounts.length === 1 ? "" : "s"}
        {hasFsLines ? ` · ${unmappedText}` : " · Set up FS map lines on the FS maps tab to map accounts for internal and external statements."}
      </p>

      {dialog && (
        <AccountDialog
          account={dialog.mode === "edit" ? dialog.account : undefined}
          onSave={save}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
