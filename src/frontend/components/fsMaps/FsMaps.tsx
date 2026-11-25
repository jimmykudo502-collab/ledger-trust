import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { Account } from "../../../common/accounts/accountSchemas";
import {
  FS_MAP_LABELS,
  FS_MAPS,
  FS_SECTION_INFO,
  type FsLine,
  type FsLineInput,
  type FsMap,
  type FsMapOverview,
} from "../../../common/fsMaps/fsMapSchemas";
import { FsLineDialog } from "./FsLineDialog";
import { FsLineSelect } from "./FsLineSelect";
import { linesBySection, unmappedAccounts } from "./fsMapLogic";

interface FsMapsProps {
  clientId: string;
}

type DialogState = { mode: "add" } | { mode: "edit"; line: FsLine } | null;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The client's internal and external FS maps (FR-33 to FR-35): numbered
 * lines grouped by statement section, the accounts on each line, and the
 * accounts not mapped yet, which can be mapped right here.
 */
export function FsMaps({ clientId }: FsMapsProps) {
  const [map, setMap] = useState<FsMap>("internal");
  const [overview, setOverview] = useState<FsMapOverview>({ lines: [], assignments: [] });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [nextOverview, nextAccounts] = await Promise.all([window.fsMaps.overview(clientId), window.chartOfAccounts.list(clientId)]);
      setOverview(nextOverview);
      setAccounts(nextAccounts);
      setError(null);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
      await reload();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const save = async (input: FsLineInput) => {
    if (dialog?.mode === "edit") await window.fsMaps.updateLine(clientId, dialog.line.id, input);
    else await window.fsMaps.createLine(clientId, map, input);
    await reload();
  };

  const remove = (line: FsLine) => {
    const mapped = line.accountCount > 0 ? ` ${plural(line.accountCount, "account")} on it will become unmapped.` : "";
    if (!window.confirm(`Delete FS line ${line.code} ${line.name}?${mapped}`)) return;
    void run(async () => {
      await window.fsMaps.deleteLine(clientId, line.id);
      return null;
    });
  };

  const addStarter = (): void => {
    void run(async () => {
      const result = await window.fsMaps.addStarterLines(clientId, map);
      return result.skipped > 0
        ? `Added ${plural(result.added, "starter line")}. Skipped ${plural(result.skipped, "line")} whose number this map already uses.`
        : `Added ${plural(result.added, "starter line")}.`;
    });
  };

  const assign = (accountId: number, lineId: number | null): void => {
    void run(async () => {
      await window.fsMaps.assign(clientId, map, [accountId], lineId);
      return null;
    });
  };

  const groups = linesBySection(overview.lines, map);
  const lineOf = new Map(overview.assignments.map((a) => [a.accountId, a[map]]));
  const accountsOn = (lineId: number) => accounts.filter((account) => lineOf.get(account.id) === lineId);
  const unmapped = unmappedAccounts(accounts, overview.lines, overview.assignments, map);
  const label = FS_MAP_LABELS[map].toLowerCase();

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="filter-pills" role="tablist">
          {FS_MAPS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={map === option}
              className={`pill${map === option ? " active" : ""}`}
              onClick={() => {
                setMap(option);
                setNotice(null);
              }}
            >
              {FS_MAP_LABELS[option]} FS map
            </button>
          ))}
        </div>
        <div className="panel-actions">
          <button type="button" className="button" disabled={busy} onClick={addStarter} title="Adds a standard set of lines; numbers already used are skipped">
            Add starter lines
          </button>
          <button type="button" className="button primary" onClick={() => setDialog({ mode: "add" })}>
            + Add line
          </button>
        </div>
      </div>
      <p className="hint">
        Each account rolls up into one line on the internal map and one on the external map. Reports can then show the
        balance sheet and income statement by account, by internal lines or by external lines. The numbers always come
        from the same posted entries.
      </p>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="muted">
          The {label} map has no lines yet. Add your own, or start from the standard set with “Add starter lines”.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="code-col">Map no.</th>
              <th>Line</th>
              <th>Accounts</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <FsSectionRows key={group.section} title={FS_SECTION_INFO[group.section].label}>
                {group.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="code-col">{line.code}</td>
                    <td>{line.name}</td>
                    <td className="muted">
                      {accountsOn(line.id)
                        .map((account) => `${account.code} ${account.name}`)
                        .join(", ") || "None"}
                    </td>
                    <td className="row-actions">
                      <button type="button" className="button small" onClick={() => setDialog({ mode: "edit", line })}>
                        Edit
                      </button>
                      <button type="button" className="button small danger" disabled={busy} onClick={() => remove(line)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </FsSectionRows>
            ))}
          </tbody>
        </table>
      )}

      <h4 className="section-title">
        Accounts not mapped on the {label} map{" "}
        {unmapped.length > 0 ? <span className="warning">· {unmapped.length}</span> : <span className="balanced">· All mapped</span>}
      </h4>
      {unmapped.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th className="code-col">Code</th>
              <th>Account</th>
              <th>{FS_MAP_LABELS[map]} FS line</th>
            </tr>
          </thead>
          <tbody>
            {unmapped.map((account) => (
              <tr key={account.id}>
                <td className="code-col">{account.code}</td>
                <td>{account.name}</td>
                <td>
                  <FsLineSelect
                    map={map}
                    accountType={account.type}
                    lines={overview.lines}
                    value={lineOf.get(account.id) ?? null}
                    disabled={busy}
                    onChange={(lineId) => assign(account.id, lineId)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialog && (
        <FsLineDialog map={map} line={dialog.mode === "edit" ? dialog.line : undefined} onSave={save} onClose={() => setDialog(null)} />
      )}
    </section>
  );
}

function FsSectionRows({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <tr className="section-row">
        <td colSpan={4}>{title}</td>
      </tr>
      {children}
    </>
  );
}
