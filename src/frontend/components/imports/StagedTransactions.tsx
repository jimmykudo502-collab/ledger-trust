import type { ImportBatch } from "../../../common/staging/stagingSchemas";
import { formatLongDate } from "../../../common/dates";
import { formatCents } from "../../../common/money";

interface StagedTransactionsProps {
  batches: readonly ImportBatch[];
  /** Removes an import; rejects with a user-facing message. */
  onRemove: (batch: ImportBatch) => void;
}

/**
 * What has been imported into a tab and is waiting in staging (FR-13),
 * grouped by import. Nothing here is in the ledger until it is posted.
 */
export function StagedTransactions({ batches, onRemove }: StagedTransactionsProps) {
  if (batches.length === 0) {
    return (
      <div className="empty-panel">
        <p>Nothing imported yet.</p>
        <p className="muted">Import a statement file or paste rows to get started.</p>
      </div>
    );
  }

  return (
    <>
      {batches.map((batch) => {
        const posted = batch.rows.filter((row) => row.status === "posted").length;
        return (
          <div key={batch.id} className="batch">
            <div className="batch-header">
              <div>
                <strong>{batch.sourceName ?? "Pasted rows"}</strong>
                <span className="muted">
                  {" · "}imported {formatLongDate(batch.createdAt.slice(0, 10))} · {batch.rows.length} row
                  {batch.rows.length === 1 ? "" : "s"}
                  {posted > 0 && ` · ${posted} posted`}
                </span>
              </div>
              {posted === 0 && (
                <button type="button" className="button small danger" onClick={() => onRemove(batch)}>
                  Remove import
                </button>
              )}
            </div>
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="money">Money in</th>
                  <th className="money">Money out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.description}</td>
                    <td className="money">{row.amountCents > 0 ? formatCents(row.amountCents) : ""}</td>
                    <td className="money">{row.amountCents < 0 ? formatCents(-row.amountCents) : ""}</td>
                    <td>
                      <span className={`badge${row.status === "posted" ? " posted" : ""}`}>
                        {row.status === "posted" ? "Posted" : "Staged"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
