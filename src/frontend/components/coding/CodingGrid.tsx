import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { Account, AccountInput } from "../../../common/accounts/accountSchemas";
import type { BankAccount } from "../../../common/bankAccounts/bankAccountSchemas";
import { formatCents } from "../../../common/money";
import type { StagedTransaction } from "../../../common/staging/stagingSchemas";
import { AccountDialog } from "../accounts/AccountDialog";
import {
  filterCounts,
  lookUpCode,
  matchesFilter,
  ROW_FILTER_LABELS,
  ROW_FILTERS,
  suggestedType,
  type RowFilter,
} from "./codingGridLogic";
import { RuleDialog } from "./RuleDialog";

interface CodingGridProps {
  clientId: string;
  bankAccount: BankAccount;
  bankAccounts: readonly BankAccount[];
  rows: readonly StagedTransaction[];
  accounts: readonly Account[];
  /** Reloads rows, accounts and the tab after any change. */
  onChanged: () => Promise<void>;
  /** Shows a confirmation message above the grid. */
  onNotice: (message: string) => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The coding grid (FR-15): date, description, amount and an editable code
 * column. The code is the offsetting account; the tab's account is always
 * the other side (FR-16). Coded rows can be posted (FR-21); uncoded rows
 * can't (FR-17).
 */
export function CodingGrid({ clientId, bankAccount, bankAccounts, rows, accounts, onChanged, onNotice }: CodingGridProps) {
  const counts = filterCounts(rows);
  const [filter, setFilter] = useState<RowFilter>(counts.toCode > 0 ? "toCode" : "all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<{ row: StagedTransaction; code: string } | null>(null);
  const [remembering, setRemembering] = useState<StagedTransaction | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const shown = rows.filter((row) => matchesFilter(row, filter));

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  /** Saves a typed code; returns false if it needs the user's attention. */
  const commitCode = async (row: StagedTransaction, typed: string): Promise<boolean> => {
    const current = row.offsetAccountId === null ? "" : accountById.get(row.offsetAccountId)?.code ?? "";
    if (typed.trim() === current) return true;
    const lookup = lookUpCode(typed, accounts, bankAccount.accountId);
    switch (lookup.kind) {
      case "empty":
        await run(() => window.staging.setCode(clientId, bankAccount.id, [row.id], null));
        return true;
      case "own":
        setError(`${lookup.account.code} ${lookup.account.name} is this tab's own account. Code the other side of the transaction.`);
        return false;
      case "unknown":
        setCreating({ row, code: lookup.code });
        return false;
      case "known":
        await run(() => window.staging.setCode(clientId, bankAccount.id, [row.id], lookup.account.code));
        return true;
    }
  };

  /** Focuses a row's code cell once the grid has re-rendered. */
  const focusRow = (rowId: number | undefined) => {
    if (rowId === undefined) return;
    requestAnimationFrame(() =>
      tableRef.current?.querySelector<HTMLInputElement>(`input.code-input[data-row-id="${rowId}"]`)?.focus(),
    );
  };

  const post = async () => {
    setBusy(true);
    await run(async () => {
      const result = await window.staging.post(clientId, bankAccount.id);
      onNotice(`Posted ${result.postedCount} row${result.postedCount === 1 ? "" : "s"} to the ledger.`);
    });
    setBusy(false);
  };

  const applyRules = async () => {
    await run(async () => {
      const result = await window.codingRules.apply(clientId, bankAccount.id);
      onNotice(result.codedCount === 0 ? "No uncoded rows matched a rule." : `Coded ${result.codedCount} row${result.codedCount === 1 ? "" : "s"} from your rules.`);
    });
  };

  return (
    <div className="coding-grid">
      <div className="grid-toolbar">
        <div className="filter-pills" role="tablist">
          {ROW_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={filter === option}
              className={`pill${filter === option ? " active" : ""}`}
              onClick={() => setFilter(option)}
            >
              {ROW_FILTER_LABELS[option]} <span className="count">{counts[option]}</span>
            </button>
          ))}
        </div>
        <div className="panel-actions">
          <button type="button" className="button" disabled={counts.toCode === 0} onClick={() => void applyRules()}>
            Apply rules
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || counts.ready === 0}
            onClick={() => void post()}
          >
            Post {counts.ready} coded row{counts.ready === 1 ? "" : "s"}
          </button>
        </div>
      </div>
      {counts.toCode > 0 && counts.ready > 0 && (
        <p className="hint">{counts.toCode} row{counts.toCode === 1 ? " still needs" : "s still need"} a code and won't be posted.</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <table className="data-table compact" ref={tableRef}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th className="money">Money in</th>
            <th className="money">Money out</th>
            <th className="code-col">Code</th>
            <th>Account</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => {
            const account = row.offsetAccountId === null ? undefined : accountById.get(row.offsetAccountId);
            const posted = row.status === "posted";
            return (
              <tr key={row.id} className={posted ? "posted-row" : ""}>
                <td className="nowrap">{row.date}</td>
                <td>{row.description}</td>
                <td className="money">{row.amountCents > 0 ? formatCents(row.amountCents) : ""}</td>
                <td className="money">{row.amountCents < 0 ? formatCents(-row.amountCents) : ""}</td>
                <td className="code-col">
                  {posted ? (
                    account?.code
                  ) : (
                    <CodeInput
                      key={`${row.id}-${account?.code ?? ""}`}
                      rowId={row.id}
                      initial={account?.code ?? ""}
                      label={`Code for ${row.description}`}
                      onCommit={(typed) => commitCode(row, typed)}
                      onNext={() => focusRow(shown.slice(index + 1).find((next) => next.status === "staged")?.id)}
                    />
                  )}
                </td>
                <td>
                  {account?.name ?? <span className="muted">—</span>}
                  {posted && <span className="badge posted">Posted</span>}
                </td>
                <td className="row-actions">
                  {posted ? (
                    <button
                      type="button"
                      className="button small"
                      title="Take this row out of the ledger so it can be corrected"
                      onClick={() => void run(() => window.staging.unpost(clientId, row.id))}
                    >
                      Unpost
                    </button>
                  ) : (
                    account && (
                      <button
                        type="button"
                        className="button small"
                        title="Code rows like this automatically in future"
                        onClick={() => setRemembering(row)}
                      >
                        Remember
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                {rows.length === 0 ? "Nothing imported yet." : `No rows under “${ROW_FILTER_LABELS[filter]}”.`}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <datalist id="grid-account-codes">
        {accounts
          .filter((account) => account.id !== bankAccount.accountId)
          .map((account) => (
            <option key={account.id} value={account.code}>
              {account.name}
            </option>
          ))}
      </datalist>

      {creating && (
        <AccountDialog
          initial={{ code: creating.code, type: suggestedType(creating.row.amountCents) }}
          hint={`There's no account with code ${creating.code} yet. Add it and the row will be coded to it.`}
          onSave={async (input: AccountInput) => {
            const created = await window.chartOfAccounts.create(clientId, input);
            await window.staging.setCode(clientId, bankAccount.id, [creating.row.id], created.code);
            await onChanged();
          }}
          onClose={() => setCreating(null)}
        />
      )}
      {remembering && (
        <RuleDialog
          clientId={clientId}
          accounts={accounts}
          bankAccounts={bankAccounts}
          initial={{
            matchText: remembering.description,
            code: accountById.get(remembering.offsetAccountId ?? -1)?.code ?? "",
            bankAccountId: null,
          }}
          onSaved={(result) => {
            onNotice(
              result.codedCount > 0
                ? `Rule saved. Coded ${result.codedCount} more row${result.codedCount === 1 ? "" : "s"}.`
                : "Rule saved. Future imports will be coded with it.",
            );
            void onChanged();
          }}
          onClose={() => setRemembering(null)}
        />
      )}
    </div>
  );
}

interface CodeInputProps {
  rowId: number;
  initial: string;
  label: string;
  /** Saves the typed code; resolves false if it needs attention. */
  onCommit: (typed: string) => Promise<boolean>;
  /** Moves to the next row. */
  onNext: () => void;
}

/**
 * A code cell: saves on Enter (then moves down) or when focus leaves.
 */
function CodeInput({ rowId, initial, label, onCommit, onNext }: CodeInputProps) {
  const [value, setValue] = useState(initial);
  const committing = useRef(false);

  useEffect(() => setValue(initial), [initial]);

  const commit = async (moveNext: boolean) => {
    if (committing.current) return;
    committing.current = true;
    const ok = await onCommit(value);
    committing.current = false;
    if (ok && moveNext) onNext();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit(true);
    } else if (event.key === "Escape") {
      setValue(initial);
    }
  };

  return (
    <input
      className="code-input"
      data-row-id={rowId}
      aria-label={label}
      list="grid-account-codes"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => void commit(false)}
    />
  );
}
