import { useCallback, useEffect, useState } from "react";

import { formatCents } from "../../../common/money";
import type {
  TransferPairView,
  TransferReview as Review,
  TransferRow,
} from "../../../common/transfers/transferSchemas";
import { pairProblem, unmatchedTotal } from "./transferReviewLogic";

interface TransferReviewProps {
  clientId: string;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Signed amount as the tab sees it: "+500.00" or "−500.00". */
const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : `−${formatCents(-cents)}`);

/**
 * Transfers between the client's own accounts (FR-19, FR-20): the Bank
 * Transfer Control balance, suggested pairs to confirm, unmatched items to
 * pair or clear, and confirmed transfers.
 */
export function TransferReview({ clientId }: TransferReviewProps) {
  const [review, setReview] = useState<Review | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setReview(await window.transfers.review(clientId));
      setSelected(new Set());
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (work: () => Promise<string | void>) => {
    setError(null);
    setNotice(null);
    try {
      const message = await work();
      if (message) setNotice(message);
      await reload();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  if (!review) {
    return <section className="panel muted">{error ?? "Loading…"}</section>;
  }

  const balanced = review.postedBalanceCents === 0;
  const picked = review.unmatched.filter((row) => selected.has(row.rowId));
  const problem = pairProblem(picked);
  const toggle = (rowId: number) => {
    const next = new Set(selected);
    if (next.has(rowId)) next.delete(rowId);
    else next.add(rowId);
    setSelected(next);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Transfers</h3>
          <p className="muted">
            Money moved between this client's own accounts is coded to {review.controlAccount.code}{" "}
            {review.controlAccount.name} on both sides, so the control account should net to zero.
          </p>
        </div>
      </div>

      <div className="stat-row">
        <div className={`stat ${balanced ? "good" : "warn"}`}>
          <span className="stat-label">{review.controlAccount.name} (posted)</span>
          <strong className="stat-value">{formatCents(review.postedBalanceCents)}</strong>
          <span className="stat-note">{balanced ? "Nets to zero" : "Should be 0.00"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Suggested matches</span>
          <strong className="stat-value">{review.suggestions.length}</strong>
        </div>
        <div className={`stat ${review.unmatched.length > 0 ? "warn" : ""}`}>
          <span className="stat-label">Unmatched items</span>
          <strong className="stat-value">{review.unmatched.length}</strong>
          {review.unmatched.length > 0 && (
            <span className="stat-note">Off by {formatCents(unmatchedTotal(review.unmatched))}</span>
          )}
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

      <div className="section-header">
        <h4>Suggested matches</h4>
        <button
          type="button"
          className="button primary"
          disabled={review.suggestions.length === 0}
          onClick={() =>
            void run(async () => {
              const result = await window.transfers.matchAll(clientId);
              return `Matched ${result.matchedCount} transfer${result.matchedCount === 1 ? "" : "s"}.`;
            })
          }
        >
          Match all {review.suggestions.length > 0 && `(${review.suggestions.length})`}
        </button>
      </div>
      <PairTable
        pairs={review.suggestions}
        empty="No likely transfers waiting. Same amount, opposite direction, different tabs, at most 4 days apart."
        actionLabel="Match"
        onAction={(pair) => void run(() => window.transfers.match(clientId, pair.from.rowId, pair.to.rowId))}
      />

      <div className="section-header">
        <h4>Unmatched items coded to {review.controlAccount.name}</h4>
        <button
          type="button"
          className="button"
          disabled={problem !== null}
          title={problem ?? undefined}
          onClick={() => void run(() => window.transfers.match(clientId, picked[0].rowId, picked[1].rowId))}
        >
          Pair ticked items
        </button>
      </div>
      <table className="data-table compact">
        <thead>
          <tr>
            <th aria-label="Select" />
            <th>Tab</th>
            <th>Date</th>
            <th>Description</th>
            <th className="money">Amount</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {review.unmatched.map((row) => (
            <tr key={row.rowId}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${row.description}`}
                  checked={selected.has(row.rowId)}
                  onChange={() => toggle(row.rowId)}
                />
              </td>
              <td>{row.bankAccountName}</td>
              <td>{row.date}</td>
              <td>{row.description}</td>
              <td className="money">{signed(row.amountCents)}</td>
              <td>
                <StatusBadge row={row} />
              </td>
              <td className="row-actions">
                {row.status === "staged" && (
                  <button
                    type="button"
                    className="button small"
                    title="Clear its code so it can be coded to the right account"
                    onClick={() => void run(() => window.transfers.notTransfer(clientId, row.rowId))}
                  >
                    Not a transfer
                  </button>
                )}
              </td>
            </tr>
          ))}
          {review.unmatched.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                Nothing unmatched. Every item coded to {review.controlAccount.name} has its other side.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <details className="imports-list" open={review.matched.length > 0 && review.matched.length <= 10}>
        <summary>Matched transfers ({review.matched.length})</summary>
        <PairTable
          pairs={review.matched}
          empty="No transfers matched yet."
          actionLabel="Unmatch"
          onAction={(pair) =>
            pair.matchId !== null &&
            void run(() => window.transfers.unmatch(clientId, pair.matchId))
          }
        />
      </details>
    </section>
  );
}

function StatusBadge({ row }: { row: TransferRow }) {
  return <span className={`badge${row.status === "posted" ? " posted" : ""}`}>{row.status === "posted" ? "Posted" : "Staged"}</span>;
}

interface PairTableProps {
  pairs: readonly TransferPairView[];
  empty: string;
  actionLabel: string;
  onAction: (pair: TransferPairView) => void;
}

function PairTable({ pairs, empty, actionLabel, onAction }: PairTableProps) {
  return (
    <table className="data-table compact">
      <thead>
        <tr>
          <th>From</th>
          <th>Date</th>
          <th>Description</th>
          <th>To</th>
          <th>Date</th>
          <th>Description</th>
          <th className="money">Amount</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {pairs.map((pair) => (
          <tr key={`${pair.from.rowId}-${pair.to.rowId}`}>
            <td>{pair.from.bankAccountName}</td>
            <td>{pair.from.date}</td>
            <td>{pair.from.description}</td>
            <td>{pair.to.bankAccountName}</td>
            <td>
              {pair.to.date}
              {pair.daysApart > 0 && <span className="muted"> (+{pair.daysApart}d)</span>}
            </td>
            <td>{pair.to.description}</td>
            <td className="money">{formatCents(pair.to.amountCents)}</td>
            <td className="row-actions">
              <button type="button" className="button small" onClick={() => onAction(pair)}>
                {actionLabel}
              </button>
            </td>
          </tr>
        ))}
        {pairs.length === 0 && (
          <tr>
            <td colSpan={8} className="muted">
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
