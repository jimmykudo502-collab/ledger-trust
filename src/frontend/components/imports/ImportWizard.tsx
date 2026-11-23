import { useEffect, useState } from "react";

import type { BankAccount } from "../../../common/bankAccounts/bankAccountSchemas";
import {
  DATE_ORDER_LABELS,
  DATE_ORDERS,
  type AmountMapping,
  type ColumnMapping,
  type DateOrder,
  type ImportSource,
  type PreviewRow,
  type SheetAnalysis,
  type SheetRef,
} from "../../../common/imports/importSchemas";
import { formatCents } from "../../../common/money";
import { ModalForm } from "../common/Modal";
import { columnLabel, defaultExclusions, summarizePreview } from "./importWizardLogic";

interface ImportWizardProps {
  clientId: string;
  bankAccount: BankAccount;
  /** The opened file, or null to start by pasting rows. */
  initialSource: ImportSource | null;
  /** Called after rows are staged. */
  onImported: (stagedCount: number) => void;
  onClose: () => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Imports a bank or credit card write-up into a tab (FR-11 to FR-14): paste
 * rows or use an opened file, confirm or adjust the detected columns, review
 * every row (problems and already-imported rows are flagged), then stage.
 */
export function ImportWizard({ clientId, bankAccount, initialSource, onImported, onClose }: ImportWizardProps) {
  const [source, setSource] = useState<ImportSource | null>(initialSource);
  const [pasted, setPasted] = useState("");
  const [sheetIndex, setSheetIndex] = useState(0);
  const [analysis, setAnalysis] = useState<SheetAnalysis | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ref: SheetRef | null = source
    ? { clientId, bankAccountId: bankAccount.id, token: source.token, sheetIndex }
    : null;

  // Analyse the sheet whenever the source or sheet changes.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    window.imports
      .analyze({ clientId, bankAccountId: bankAccount.id, token: source.token, sheetIndex })
      .then((result) => {
        if (cancelled) return;
        setAnalysis(result);
        setMapping(result.suggestedMapping);
      })
      .catch((caught: unknown) => !cancelled && setError(messageOf(caught)));
    return () => {
      cancelled = true;
    };
  }, [source, sheetIndex, clientId, bankAccount.id]);

  // Re-read the rows whenever the mapping changes.
  useEffect(() => {
    if (!source || !mapping) return;
    let cancelled = false;
    window.imports
      .preview({ clientId, bankAccountId: bankAccount.id, token: source.token, sheetIndex }, mapping)
      .then((result) => {
        if (cancelled) return;
        setRows(result);
        setExcluded(defaultExclusions(result));
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(messageOf(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [mapping, source, sheetIndex, clientId, bankAccount.id]);

  const close = () => {
    if (source) void window.imports.discard(source.token);
    onClose();
  };

  if (!source) {
    const readPaste = async () => {
      setBusy(true);
      setError(null);
      try {
        setSource(await window.imports.openPaste(pasted));
      } catch (caught) {
        setError(messageOf(caught));
      } finally {
        setBusy(false);
      }
    };
    return (
      <ModalForm
        title={`Paste rows into ${bankAccount.name}`}
        submitLabel="Continue"
        busy={busy}
        error={error}
        submitDisabled={pasted.trim() === ""}
        onSubmit={() => void readPaste()}
        onClose={close}
        wide
      >
        <p className="hint">
          Copy the rows from the bank's website or a spreadsheet (headings included if you have them) and
          paste them here.
        </p>
        <textarea
          autoFocus
          className="paste-box"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          placeholder={"Date\tDescription\tAmount\n2026-01-05\tCoffee shop\t-4.50"}
        />
      </ModalForm>
    );
  }

  const stage = async () => {
    if (!ref || !mapping) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.imports.stage(ref, mapping, [...excluded]);
      onImported(result.stagedCount);
      onClose();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const summary = summarizePreview(rows, excluded);
  const headerCells =
    mapping && mapping.headerRow !== null && analysis ? analysis.sampleRows[mapping.headerRow] ?? null : null;
  const columns = Array.from({ length: Math.max(analysis?.columnCount ?? 0, 1) }, (_, i) => i);
  const update = (changes: Partial<ColumnMapping>) => mapping && setMapping({ ...mapping, ...changes });
  const updateAmount = (amount: AmountMapping) => update({ amount });

  const columnSelect = (value: number, onChange: (column: number) => void, label: string) => (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {columns.map((column) => (
          <option key={column} value={column}>
            {columnLabel(column, headerCells)}
          </option>
        ))}
      </select>
    </label>
  );

  const toggle = (rowNumber: number) => {
    const next = new Set(excluded);
    if (next.has(rowNumber)) next.delete(rowNumber);
    else next.add(rowNumber);
    setExcluded(next);
  };

  return (
    <ModalForm
      title={`Import into ${bankAccount.name}`}
      submitLabel={`Import ${summary.importing} row${summary.importing === 1 ? "" : "s"}`}
      busy={busy}
      error={error}
      submitDisabled={summary.importing === 0}
      onSubmit={() => void stage()}
      onClose={close}
      wide
    >
      <p className="muted">
        {source.name}
        {source.sheets.length > 1 && (
          <>
            {" · "}
            <select value={sheetIndex} onChange={(event) => setSheetIndex(Number(event.target.value))}>
              {source.sheets.map((sheet, index) => (
                <option key={sheet.name} value={index}>
                  {sheet.name} ({sheet.rowCount} rows)
                </option>
              ))}
            </select>
          </>
        )}
      </p>

      {mapping && analysis && (
        <div className="mapping-grid">
          <label className="field">
            <span>Headings</span>
            <select
              value={mapping.headerRow ?? -1}
              onChange={(event) => {
                const value = Number(event.target.value);
                update({ headerRow: value < 0 ? null : value });
              }}
            >
              <option value={-1}>No heading row</option>
              {analysis.sampleRows.map((row, index) => (
                <option key={index} value={index}>
                  Row {index + 1}: {row.filter((cell) => cell !== null).slice(0, 4).join(", ").slice(0, 50)}
                </option>
              ))}
            </select>
          </label>
          {columnSelect(mapping.dateColumn, (dateColumn) => update({ dateColumn }), "Date column")}
          <label className="field">
            <span>Date format{analysis.dateOrderAmbiguous && " (please check)"}</span>
            <select
              value={mapping.dateOrder}
              onChange={(event) => update({ dateOrder: event.target.value as DateOrder })}
            >
              {DATE_ORDERS.map((order) => (
                <option key={order} value={order}>
                  {DATE_ORDER_LABELS[order]}
                </option>
              ))}
            </select>
          </label>
          {columnSelect(mapping.descriptionColumn, (descriptionColumn) => update({ descriptionColumn }), "Description column")}

          <label className="field">
            <span>Amounts are in</span>
            <select
              value={mapping.amount.kind}
              onChange={(event) =>
                updateAmount(
                  event.target.value === "signed"
                    ? { kind: "signed", column: mapping.amount.kind === "split" ? mapping.amount.moneyOutColumn : 0, positiveIsMoneyIn: bankAccount.kind === "bank" }
                    : { kind: "split", moneyInColumn: 0, moneyOutColumn: 1 },
                )
              }
            >
              <option value="signed">One column (+/−)</option>
              <option value="split">Separate money in / money out columns</option>
            </select>
          </label>
          {mapping.amount.kind === "signed" ? (
            <>
              {columnSelect(
                mapping.amount.column,
                (column) => mapping.amount.kind === "signed" && updateAmount({ ...mapping.amount, column }),
                "Amount column",
              )}
              <label className="field">
                <span>Positive amounts are</span>
                <select
                  value={mapping.amount.positiveIsMoneyIn ? "in" : "out"}
                  onChange={(event) =>
                    mapping.amount.kind === "signed" &&
                    updateAmount({ ...mapping.amount, positiveIsMoneyIn: event.target.value === "in" })
                  }
                >
                  <option value="in">Money in (deposits, payments to the card)</option>
                  <option value="out">Money out (withdrawals, card charges)</option>
                </select>
              </label>
            </>
          ) : (
            <>
              {columnSelect(
                mapping.amount.moneyInColumn,
                (moneyInColumn) => mapping.amount.kind === "split" && updateAmount({ ...mapping.amount, moneyInColumn }),
                "Money in column",
              )}
              {columnSelect(
                mapping.amount.moneyOutColumn,
                (moneyOutColumn) => mapping.amount.kind === "split" && updateAmount({ ...mapping.amount, moneyOutColumn }),
                "Money out column",
              )}
            </>
          )}
        </div>
      )}

      <div className="preview-summary">
        <strong>{summary.importing}</strong> to import
        {summary.leftOut > 0 && <> · {summary.leftOut} left out</>}
        {summary.unreadable > 0 && <> · {summary.unreadable} can't be read</>}
        {" · "}Money in {formatCents(summary.moneyInCents)} · Money out {formatCents(summary.moneyOutCents)}
      </div>

      <div className="preview-scroll">
        <table className="data-table compact">
          <thead>
            <tr>
              <th aria-label="Import" />
              <th>Row</th>
              <th>Date</th>
              <th>Description</th>
              <th className="money">Money in</th>
              <th className="money">Money out</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const included = row.problem === null && !excluded.has(row.rowNumber);
              return (
                <tr key={row.rowNumber} className={included ? "" : "excluded"}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Import row ${row.rowNumber}`}
                      checked={included}
                      disabled={row.problem !== null}
                      onChange={() => toggle(row.rowNumber)}
                    />
                  </td>
                  <td className="muted">{row.rowNumber}</td>
                  <td>{row.date ?? ""}</td>
                  <td>{row.description}</td>
                  <td className="money">{row.amountCents !== null && row.amountCents > 0 ? formatCents(row.amountCents) : ""}</td>
                  <td className="money">{row.amountCents !== null && row.amountCents < 0 ? formatCents(-row.amountCents) : ""}</td>
                  <td>
                    {row.problem && <span className="problem">{row.problem}</span>}
                    {row.duplicate && <span className="warning">Already imported</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No transactions found with these columns.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ModalForm>
  );
}
