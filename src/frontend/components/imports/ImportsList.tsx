import { formatLocalDate } from "../../../common/dates";
import type { ImportBatch } from "../../../common/staging/stagingSchemas";

interface ImportsListProps {
  batches: readonly ImportBatch[];
  onRemove: (batch: ImportBatch) => void;
}

/**
 * The imports made into a tab, newest first, with a way to undo an import
 * whose rows haven't been posted.
 */
export function ImportsList({ batches, onRemove }: ImportsListProps) {
  if (batches.length === 0) return null;
  return (
    <details className="imports-list">
      <summary>
        Imports ({batches.length})
      </summary>
      <table className="data-table compact">
        <thead>
          <tr>
            <th>Source</th>
            <th>Imported</th>
            <th className="money">Rows</th>
            <th className="money">Posted</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => {
            const posted = batch.rows.filter((row) => row.status === "posted").length;
            return (
              <tr key={batch.id}>
                <td>{batch.sourceName ?? "Pasted rows"}</td>
                <td>{formatLocalDate(batch.createdAt)}</td>
                <td className="money">{batch.rows.length}</td>
                <td className="money">{posted}</td>
                <td className="row-actions">
                  {posted === 0 ? (
                    <button type="button" className="button small danger" onClick={() => onRemove(batch)}>
                      Remove import
                    </button>
                  ) : (
                    <span className="muted" title="Unpost its rows first to remove this import">
                      Has posted rows
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
