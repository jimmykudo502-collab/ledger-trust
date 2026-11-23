import { useCallback, useEffect, useState } from "react";

import type { Account } from "../../../common/accounts/accountSchemas";
import { entryTotals, type JournalEntryView, type JournalSource } from "../../../common/journal/journalSchemas";
import { formatCents } from "../../../common/money";
import type { FiscalYearView } from "../../../common/years/yearSchemas";
import { lockedYearFor } from "../years/yearLogic";
import { ReverseDialog } from "../years/ReverseDialog";
import { EntryEditor } from "./EntryEditor";

interface JournalEntriesProps {
  clientId: string;
}

const SOURCE_LABELS: Record<JournalSource, string> = {
  manual: "Manual",
  bank_import: "Bank",
  reversal: "Reversal",
  year_end_close: "Year-end close",
  opening_balance: "Opening balance",
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Manual journal entries (FR-24, FR-25): list, add, edit and delete.
 * Reversals and year-end closing entries are listed too, read-only.
 */
export function JournalEntries({ clientId }: JournalEntriesProps) {
  const [entries, setEntries] = useState<JournalEntryView[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState<{ entry?: JournalEntryView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [years, setYears] = useState<FiscalYearView[]>([]);
  const [reversing, setReversing] = useState<JournalEntryView | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextEntries, nextAccounts, overview] = await Promise.all([
        window.journalEntries.list(clientId),
        window.chartOfAccounts.list(clientId),
        window.yearEnd.overview(clientId),
      ]);
      setEntries(nextEntries);
      setAccounts(nextAccounts);
      setYears([...overview.years]);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = async (entry: JournalEntryView) => {
    if (!window.confirm(`Delete the entry "${entry.description}" dated ${entry.date}?`)) return;
    try {
      await window.journalEntries.delete(clientId, entry.id);
      await reload();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Journal entries</h3>
          <p className="muted">For corrections, non-cash transactions, opening balances and adjustments.</p>
        </div>
        <div className="panel-actions">
          <button type="button" className="button primary" onClick={() => setEditing({})}>
            + New entry
          </button>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <div className="empty-panel">
          <p>No journal entries yet.</p>
          <p className="muted">Bank rows post from their tabs; use a journal entry for everything else.</p>
        </div>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className="entry-card">
            <div className="batch-header">
              <div>
                <strong>{entry.date}</strong> · {entry.description}{" "}
                <span className="badge">{SOURCE_LABELS[entry.source]}</span>
                {entry.reversedByEntryId !== null && <span className="badge">Reversed</span>}
              </div>
              <div className="panel-actions">
                <span className="muted">{formatCents(entryTotals(entry.lines).debitCents)}</span>
                {entry.source === "manual" && entry.reversedByEntryId === null && lockedYearFor(years, entry.date) && (
                  <button type="button" className="button small" onClick={() => setReversing(entry)}>
                    Reverse…
                  </button>
                )}
                {entry.source === "manual" && entry.reversedByEntryId === null && !lockedYearFor(years, entry.date) && (
                  <>
                    <button type="button" className="button small" onClick={() => setEditing({ entry })}>
                      Edit
                    </button>
                    <button type="button" className="button small danger" onClick={() => void remove(entry)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
            <table className="data-table compact">
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.lineNumber}>
                    <td className="code-col">{line.accountCode}</td>
                    <td>
                      {line.accountName}
                      {line.memo && <span className="muted"> · {line.memo}</span>}
                    </td>
                    <td className="money">{line.debitCents > 0 ? formatCents(line.debitCents) : ""}</td>
                    <td className="money">{line.creditCents > 0 ? formatCents(line.creditCents) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {reversing && (
        <ReverseDialog
          clientId={clientId}
          entry={reversing}
          years={years}
          onReversed={() => void reload()}
          onClose={() => setReversing(null)}
        />
      )}
      {editing && (
        <EntryEditor
          clientId={clientId}
          accounts={accounts}
          entry={editing.entry}
          onSaved={() => void reload()}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
