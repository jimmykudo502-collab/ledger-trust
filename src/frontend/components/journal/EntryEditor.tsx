import { useState } from "react";

import type { Account } from "../../../common/accounts/accountSchemas";
import type { JournalEntryView } from "../../../common/journal/journalSchemas";
import { formatCents } from "../../../common/money";
import { ModalForm } from "../common/Modal";
import { checkDraft, emptyLine, toDrafts, type LineDraft } from "./entryEditorLogic";

interface EntryEditorProps {
  clientId: string;
  accounts: readonly Account[];
  /** The entry being edited, or undefined for a new one. */
  entry?: JournalEntryView;
  onSaved: () => void;
  onClose: () => void;
}

const today = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * The journal entry screen (FR-24): a date, a description and two or more
 * debit/credit lines. Posting is only possible once debits equal credits.
 */
export function EntryEditor({ clientId, accounts, entry, onSaved, onClose }: EntryEditorProps) {
  const [date, setDate] = useState(entry?.date ?? today());
  const [description, setDescription] = useState(entry?.description ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    entry ? [...toDrafts(entry.lines, accounts), emptyLine()] : [emptyLine(), emptyLine(), emptyLine()],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = checkDraft(lines, accounts);
  const difference = check.debitCents - check.creditCents;
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));

  const update = (index: number, changes: Partial<LineDraft>) => {
    const next = lines.map((line, i) => (i === index ? { ...line, ...changes } : line));
    // Keep one blank line at the bottom for the next entry.
    const last = next[next.length - 1];
    if (last.code || last.debit || last.credit) next.push(emptyLine());
    setLines(next);
  };

  const save = async () => {
    if (!check.lines) return;
    setBusy(true);
    setError(null);
    try {
      const input = { date, description, lines: check.lines };
      if (entry) await window.journalEntries.update(clientId, entry.id, input);
      else await window.journalEntries.create(clientId, input);
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalForm
      title={entry ? "Edit journal entry" : "New journal entry"}
      submitLabel={entry ? "Save entry" : "Post entry"}
      busy={busy}
      error={error}
      submitDisabled={check.lines === null || description.trim() === ""}
      onSubmit={() => void save()}
      onClose={onClose}
      wide
    >
      <div className="field-row">
        <label className="field code-field date-field">
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="field">
          <span>Description</span>
          <input
            autoFocus
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Opening balances, depreciation, owner contribution"
          />
        </label>
      </div>

      <table className="data-table compact entry-lines">
        <thead>
          <tr>
            <th className="code-col">Code</th>
            <th>Account</th>
            <th className="money">Debit</th>
            <th className="money">Credit</th>
            <th>Memo</th>
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td className="code-col">
                <input
                  className="code-input"
                  list="entry-account-codes"
                  aria-label={`Line ${index + 1} account code`}
                  value={line.code}
                  onChange={(event) => update(index, { code: event.target.value })}
                />
              </td>
              <td>{accountByCode.get(line.code.trim())?.name ?? (line.code.trim() ? <span className="problem">Unknown code</span> : "")}</td>
              <td className="money">
                <input
                  className="money-input"
                  aria-label={`Line ${index + 1} debit`}
                  value={line.debit}
                  onChange={(event) => update(index, { debit: event.target.value })}
                />
              </td>
              <td className="money">
                <input
                  className="money-input"
                  aria-label={`Line ${index + 1} credit`}
                  value={line.credit}
                  onChange={(event) => update(index, { credit: event.target.value })}
                />
              </td>
              <td>
                <input
                  className="memo-input"
                  aria-label={`Line ${index + 1} memo`}
                  value={line.memo}
                  onChange={(event) => update(index, { memo: event.target.value })}
                />
              </td>
              <td className="row-actions">
                {lines.length > 2 && (
                  <button
                    type="button"
                    className="button small"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => setLines(lines.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="totals-row">
            <td colSpan={2}>Totals</td>
            <td className="money">{formatCents(check.debitCents)}</td>
            <td className="money">{formatCents(check.creditCents)}</td>
            <td colSpan={2} className={difference === 0 ? "balanced" : "problem"}>
              {difference === 0 ? "Balanced" : `Out of balance by ${formatCents(Math.abs(difference))}`}
            </td>
          </tr>
        </tfoot>
      </table>
      <datalist id="entry-account-codes">
        {accounts.map((account) => (
          <option key={account.id} value={account.code}>
            {account.name}
          </option>
        ))}
      </datalist>
      {check.problems.length > 0 && check.debitCents + check.creditCents > 0 && (
        <ul className="problem-list">
          {check.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </ModalForm>
  );
}
