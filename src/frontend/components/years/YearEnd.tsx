import { useCallback, useEffect, useState } from "react";

import type { Account } from "../../../common/accounts/accountSchemas";
import { formatLongDate } from "../../../common/dates";
import type { FiscalYearView, YearEndOverview } from "../../../common/years/yearSchemas";
import { ModalForm } from "../common/Modal";
import { useSubmit } from "../common/useSubmit";

interface YearEndProps {
  clientId: string;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const STATUS_LABELS = { open: "Open", locked: "Locked", closed: "Closed and locked" } as const;

/**
 * Fiscal years (FR-26 to FR-28): lock a year so its entries can't change,
 * close it (revenue and expenses into retained earnings, then lock), or
 * unlock the most recent locked year.
 */
export function YearEnd({ clientId }: YearEndProps) {
  const [overview, setOverview] = useState<YearEndOverview | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [closing, setClosing] = useState<FiscalYearView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextOverview, nextAccounts] = await Promise.all([
        window.yearEnd.overview(clientId),
        window.chartOfAccounts.list(clientId),
      ]);
      setOverview(nextOverview);
      setAccounts(nextAccounts);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (work: () => Promise<void>, message: string) => {
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(message);
      await reload();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  if (!overview) return <section className="panel muted">{error ?? "Loading…"}</section>;
  const latestLocked = overview.years.find((year) => year.status !== "open");

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Year-end</h3>
          <p className="muted">
            Lock a year when its books are final. Closing a year moves revenue and expenses into retained earnings and
            locks it; balance sheet balances carry into the next year automatically. Changes to a locked year are made
            with reversing entries.
          </p>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>Fiscal year</th>
            <th>Dates</th>
            <th>Status</th>
            <th className="money">Entries</th>
            <th className="money">Unposted bank rows</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {overview.years.map((year) => (
            <tr key={year.to}>
              <td>
                <strong>{year.label}</strong>
              </td>
              <td className="nowrap">
                {formatLongDate(year.from)} – {formatLongDate(year.to)}
              </td>
              <td>
                <span className={`badge status-${year.status}`}>{STATUS_LABELS[year.status]}</span>
              </td>
              <td className="money">{year.postedEntries}</td>
              <td className={`money${year.unpostedRows > 0 ? " problem" : ""}`}>{year.unpostedRows}</td>
              <td className="row-actions">
                {year.status === "open" && (
                  <>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => void run(() => window.yearEnd.lock(clientId, year.to), `${year.label} is locked.`)}
                    >
                      Lock
                    </button>
                    <button type="button" className="button small primary" onClick={() => setClosing(year)}>
                      Close year…
                    </button>
                  </>
                )}
                {year.status !== "open" && year === latestLocked && (
                  <button
                    type="button"
                    className="button small"
                    onClick={() => {
                      const warning =
                        year.status === "closed"
                          ? `Unlock ${year.label}? Its closing entry will be removed and the year reopened; close it again when you're done.`
                          : `Unlock ${year.label}?`;
                      if (window.confirm(warning)) {
                        void run(() => window.yearEnd.unlock(clientId, year.to), `${year.label} is open again.`);
                      }
                    }}
                  >
                    Unlock
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {closing && (
        <CloseYearDialog
          clientId={clientId}
          year={closing}
          accounts={accounts}
          defaultAccountId={overview.retainedEarningsAccountId}
          onClosed={() => {
            setNotice(`${closing.label} is closed and locked.`);
            void reload();
          }}
          onClose={() => setClosing(null)}
        />
      )}
    </section>
  );
}

interface CloseYearDialogProps {
  clientId: string;
  year: FiscalYearView;
  accounts: readonly Account[];
  defaultAccountId: number | null;
  onClosed: () => void;
  onClose: () => void;
}

const NEW_ACCOUNT = -1;

function CloseYearDialog({ clientId, year, accounts, defaultAccountId, onClosed, onClose }: CloseYearDialogProps) {
  const equity = accounts.filter((account) => account.type === "equity");
  const guess =
    defaultAccountId ??
    equity.find((account) => /retained/i.test(account.name))?.id ??
    (equity[0]?.id ?? NEW_ACCOUNT);
  const [accountId, setAccountId] = useState<number>(guess);
  const [newCode, setNewCode] = useState("3900");

  const { busy, error, submit } = useSubmit(async () => {
    let target = accountId;
    if (target === NEW_ACCOUNT) {
      target = (await window.chartOfAccounts.create(clientId, { code: newCode, name: "Retained Earnings", type: "equity" })).id;
    }
    await window.yearEnd.close(clientId, year.to, target);
    onClosed();
  }, onClose);

  return (
    <ModalForm title={`Close ${year.label}`} submitLabel="Close and lock year" busy={busy} error={error} onSubmit={submit} onClose={onClose}>
      <p className="hint">
        This posts one entry dated {formatLongDate(year.to)} that brings every revenue and expense account to zero,
        with the difference (the year's net income) going to retained earnings. The year is then locked.
      </p>
      <label className="field">
        <span>Close into</span>
        <select value={accountId} onChange={(event) => setAccountId(Number(event.target.value))}>
          {equity.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} {account.name}
            </option>
          ))}
          <option value={NEW_ACCOUNT}>New account: Retained Earnings</option>
        </select>
      </label>
      {accountId === NEW_ACCOUNT && (
        <label className="field code-field">
          <span>Code for the new account</span>
          <input value={newCode} onChange={(event) => setNewCode(event.target.value)} />
        </label>
      )}
      {year.unpostedRows > 0 && (
        <p className="form-error">
          {year.unpostedRows} bank row{year.unpostedRows === 1 ? " is" : "s are"} dated in this year but not posted. Post or
          remove them first.
        </p>
      )}
    </ModalForm>
  );
}
