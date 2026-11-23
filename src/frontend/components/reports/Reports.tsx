import { useEffect, useState } from "react";

import type { Account } from "../../../common/accounts/accountSchemas";
import type { ClientSummary } from "../../../common/clients/clientSchemas";
import { formatLongDate } from "../../../common/dates";
import { localToday, type DateRange } from "../../../common/fiscalYears";
import {
  REPORT_KINDS,
  REPORT_TITLES,
  type BalanceSheet,
  type GeneralLedger,
  type IncomeStatement,
  type ReportKind,
  type TrialBalance,
} from "../../../common/reports/reportSchemas";
import type { FiscalYearView } from "../../../common/years/yearSchemas";
import { lockedYearFor } from "../years/yearLogic";
import { ReverseDialog } from "../years/ReverseDialog";
import { presetRange, RANGE_PRESET_LABELS, type RangePreset } from "./reportRangeLogic";
import { BalanceSheetView, GeneralLedgerView, IncomeStatementView, TrialBalanceView } from "./ReportViews";

interface ReportsProps {
  client: ClientSummary;
}

type LoadedReport =
  | { kind: "trialBalance"; data: TrialBalance }
  | { kind: "generalLedger"; data: GeneralLedger }
  | { kind: "balanceSheet"; data: BalanceSheet }
  | { kind: "incomeStatement"; data: IncomeStatement };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The report period as printed under the title. */
export const periodLabel = (kind: ReportKind, range: DateRange): string =>
  kind === "balanceSheet"
    ? `As at ${formatLongDate(range.to)}`
    : `${formatLongDate(range.from)} to ${formatLongDate(range.to)}`;

/**
 * Reports (FR-29, FR-30): trial balance, general ledger, balance sheet and
 * income statement for any date range, always computed fresh from posted
 * entries. Clicking an account in the trial balance or a statement opens its
 * general ledger; the general ledger can also be viewed on its own.
 */
export function Reports({ client }: ReportsProps) {
  const [kind, setKind] = useState<ReportKind>("trialBalance");
  const [range, setRange] = useState<DateRange>(() => presetRange("thisFiscalYear", client.fiscalYearEnd, localToday()));
  const [includeClosing, setIncludeClosing] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [backTo, setBackTo] = useState<ReportKind | null>(null);
  const [report, setReport] = useState<LoadedReport | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [years, setYears] = useState<FiscalYearView[]>([]);
  const [reversing, setReversing] = useState<{ id: number; date: string; description: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [exported, setExported] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const exportAs = async (format: "pdf" | "xlsx") => {
    setExporting(true);
    setError(null);
    setExported(null);
    try {
      const result = await window.exports.exportReport(
        client.id,
        kind,
        { from: range.from, to: range.to, includeClosingEntries: includeClosing, accountId },
        format,
      );
      if (result) setExported(result.path);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    window.chartOfAccounts.list(client.id).then(setAccounts, () => setAccounts([]));
    window.yearEnd.overview(client.id).then((overview) => setYears([...overview.years]), () => setYears([]));
  }, [client.id, refresh]);

  useEffect(() => {
    if (range.from > range.to) {
      setError("The start date must be on or before the end date.");
      return;
    }
    let cancelled = false;
    const options = { from: range.from, to: range.to, includeClosingEntries: includeClosing, accountId };
    const load = async (): Promise<LoadedReport> => {
      switch (kind) {
        case "trialBalance":
          return { kind, data: await window.reports.trialBalance(client.id, options) };
        case "generalLedger":
          return { kind, data: await window.reports.generalLedger(client.id, options) };
        case "balanceSheet":
          return { kind, data: await window.reports.balanceSheet(client.id, options) };
        case "incomeStatement":
          return { kind, data: await window.reports.incomeStatement(client.id, options) };
      }
    };
    load()
      .then((loaded) => {
        if (cancelled) return;
        setReport(loaded);
        setError(null);
      })
      .catch((caught: unknown) => !cancelled && setError(messageOf(caught)));
    return () => {
      cancelled = true;
    };
  }, [client.id, kind, range, includeClosing, accountId, refresh]);

  const openAccount = (id: number) => {
    setBackTo(kind);
    setAccountId(id);
    setKind("generalLedger");
  };

  const choose = (next: ReportKind) => {
    setBackTo(null);
    if (next !== "generalLedger") setAccountId(null);
    setKind(next);
  };

  return (
    <section className="panel">
      <div className="report-toolbar">
        <div className="filter-pills" role="tablist">
          {REPORT_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={kind === option}
              className={`pill${kind === option ? " active" : ""}`}
              onClick={() => choose(option)}
            >
              {REPORT_TITLES[option]}
            </button>
          ))}
        </div>
        <div className="range-controls">
          <select
            aria-label="Date range preset"
            value=""
            onChange={(event) => event.target.value && setRange(presetRange(event.target.value as RangePreset, client.fiscalYearEnd, localToday()))}
          >
            <option value="">Quick dates…</option>
            {(Object.keys(RANGE_PRESET_LABELS) as RangePreset[]).map((preset) => (
              <option key={preset} value={preset}>
                {RANGE_PRESET_LABELS[preset]}
              </option>
            ))}
          </select>
          <label className="inline-field">
            <span>From</span>
            <input type="date" value={range.from} onChange={(event) => event.target.value && setRange({ ...range, from: event.target.value })} />
          </label>
          <label className="inline-field">
            <span>To</span>
            <input type="date" value={range.to} onChange={(event) => event.target.value && setRange({ ...range, to: event.target.value })} />
          </label>
        </div>
      </div>

      <div className="report-heading">
        <div>
          {backTo && (
            <button type="button" className="button small" onClick={() => choose(backTo)}>
              ← Back to {REPORT_TITLES[backTo]}
            </button>
          )}
          <h2>{client.name}</h2>
          <h3>{REPORT_TITLES[kind]}</h3>
          <p className="muted">{periodLabel(kind, range)}</p>
        </div>
        <div className="report-actions">
          {(kind === "trialBalance" || kind === "generalLedger" || kind === "balanceSheet") && (
            <label className="radio-line" title="Year-end closing entries move revenue and expenses into retained earnings">
              <input type="checkbox" checked={includeClosing} onChange={(event) => setIncludeClosing(event.target.checked)} />
              Include year-end closing entries
            </label>
          )}
          <div className="panel-actions">
            <button type="button" className="button" disabled={exporting} onClick={() => void exportAs("pdf")}>
              Export PDF
            </button>
            <button type="button" className="button" disabled={exporting} onClick={() => void exportAs("xlsx")}>
              Export Excel
            </button>
          </div>
        </div>
      </div>
      {exported && (
        <p className="notice" role="status">
          Saved {exported}{" "}
          <button type="button" className="button small" onClick={() => void window.exports.showInFolder(exported)}>
            Show in folder
          </button>
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {report?.kind === "trialBalance" && kind === "trialBalance" && <TrialBalanceView report={report.data} onOpenAccount={openAccount} />}
      {report?.kind === "generalLedger" && kind === "generalLedger" && (
        <GeneralLedgerView
          report={report.data}
          accounts={accounts}
          accountId={accountId}
          onAccountChange={setAccountId}
          isLocked={(date) => lockedYearFor(years, date) !== undefined}
          onReverse={setReversing}
        />
      )}
      {report?.kind === "balanceSheet" && kind === "balanceSheet" && <BalanceSheetView report={report.data} onOpenAccount={openAccount} />}
      {report?.kind === "incomeStatement" && kind === "incomeStatement" && <IncomeStatementView report={report.data} onOpenAccount={openAccount} />}

      {reversing && (
        <ReverseDialog
          clientId={client.id}
          entry={reversing}
          years={years}
          onReversed={() => setRefresh((n) => n + 1)}
          onClose={() => setReversing(null)}
        />
      )}
    </section>
  );
}
