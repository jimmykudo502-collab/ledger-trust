import type { Account } from "../../../common/accounts/accountSchemas";
import { ACCOUNT_TYPE_LABELS } from "../../../common/accounts/accountSchemas";
import { formatCents, formatDrCr, formatStatement } from "../../../common/money";
import type {
  BalanceSheet,
  GeneralLedger,
  IncomeStatement,
  StatementLine,
  TrialBalance,
} from "../../../common/reports/reportSchemas";

const amount = (cents: number) => (cents === 0 ? "" : formatCents(cents));

/** Trial balance (FR-29). Clicking an account opens its general ledger. */
export function TrialBalanceView({ report, onOpenAccount }: { report: TrialBalance; onOpenAccount: (accountId: number) => void }) {
  const balanced = report.totals.closingDebitCents === report.totals.closingCreditCents;
  return (
    <table className="data-table report-table">
      <thead>
        <tr>
          <th className="code-col">Code</th>
          <th>Account</th>
          <th>Type</th>
          <th className="money">Opening</th>
          <th className="money">Debits</th>
          <th className="money">Credits</th>
          <th className="money">Debit balance</th>
          <th className="money">Credit balance</th>
        </tr>
      </thead>
      <tbody>
        {report.rows.map((row) => (
          <tr
            key={row.accountId}
            className="clickable"
            title="Open this account's general ledger"
            onClick={() => onOpenAccount(row.accountId)}
          >
            <td className="code-col">{row.code}</td>
            <td>
              <span className="link-like">{row.name}</span>
            </td>
            <td>{ACCOUNT_TYPE_LABELS[row.type]}</td>
            <td className="money">{row.openingCents === 0 ? "" : formatDrCr(row.openingCents)}</td>
            <td className="money">{amount(row.debitCents)}</td>
            <td className="money">{amount(row.creditCents)}</td>
            <td className="money">{row.closingCents > 0 ? formatCents(row.closingCents) : ""}</td>
            <td className="money">{row.closingCents < 0 ? formatCents(-row.closingCents) : ""}</td>
          </tr>
        ))}
        {report.rows.length === 0 && (
          <tr>
            <td colSpan={8} className="muted">
              Nothing posted up to this date.
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className="totals-row">
          <td colSpan={4}>
            Totals{" "}
            <span className={balanced ? "balanced" : "problem"}>{balanced ? "· Balanced" : "· Out of balance"}</span>
          </td>
          <td className="money">{formatCents(report.totals.debitCents)}</td>
          <td className="money">{formatCents(report.totals.creditCents)}</td>
          <td className="money">{formatCents(report.totals.closingDebitCents)}</td>
          <td className="money">{formatCents(report.totals.closingCreditCents)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

interface GeneralLedgerViewProps {
  report: GeneralLedger;
  accounts: readonly Account[];
  accountId: number | null;
  onAccountChange: (accountId: number | null) => void;
  /** Whether a date is in a locked fiscal year. */
  isLocked: (date: string) => boolean;
  /** Opens the reversal dialog for an entry. */
  onReverse: (entry: { id: number; date: string; description: string }) => void;
}

/** General ledger (FR-29): every posted line, per account, with running balances. */
export function GeneralLedgerView({ report, accounts, accountId, onAccountChange, isLocked, onReverse }: GeneralLedgerViewProps) {
  return (
    <>
      <label className="inline-field">
        <span>Account</span>
        <select value={accountId ?? ""} onChange={(event) => onAccountChange(event.target.value === "" ? null : Number(event.target.value))}>
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} {account.name}
            </option>
          ))}
        </select>
      </label>
      {report.accounts.length === 0 && <p className="muted">Nothing posted in this period.</p>}
      {report.accounts.map((account) => (
        <div key={account.accountId} className="ledger-account">
          <h4>
            {account.code} {account.name} <span className="badge">{ACCOUNT_TYPE_LABELS[account.type]}</span>
          </h4>
          <table className="data-table compact report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Source</th>
                <th className="money">Debit</th>
                <th className="money">Credit</th>
                <th className="money">Balance</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <tr className="subtle-row">
                <td className="nowrap">{report.range.from}</td>
                <td colSpan={4}>Opening balance</td>
                <td className="money">{formatDrCr(account.openingCents)}</td>
                <td />
              </tr>
              {account.lines.map((line, index) => (
                <tr key={`${line.entryId}-${index}`}>
                  <td className="nowrap">{line.date}</td>
                  <td>
                    {line.description}
                    {line.memo && <span className="muted"> · {line.memo}</span>}
                  </td>
                  <td className="muted">{line.sourceLabel}</td>
                  <td className="money">{amount(line.debitCents)}</td>
                  <td className="money">{amount(line.creditCents)}</td>
                  <td className="money">{formatDrCr(line.balanceCents)}</td>
                  <td className="row-actions">
                    {isLocked(line.date) && line.source !== "reversal" && line.source !== "year_end_close" && (
                      <button
                        type="button"
                        className="button small"
                        title="This entry is in a locked year; post a reversing entry to correct it"
                        onClick={() => onReverse({ id: line.entryId, date: line.date, description: line.description })}
                      >
                        Reverse…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {account.lines.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No activity in this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="nowrap">{report.range.to}</td>
                <td colSpan={2}>Closing balance</td>
                <td className="money">{formatCents(account.debitCents)}</td>
                <td className="money">{formatCents(account.creditCents)}</td>
                <td className="money">{formatDrCr(account.closingCents)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </>
  );
}

function StatementSection({ title, lines, totalLabel, totalCents, onOpenAccount }: {
  title: string;
  lines: readonly StatementLine[];
  totalLabel: string;
  totalCents: number;
  onOpenAccount: (accountId: number) => void;
}) {
  return (
    <>
      <tr className="section-row">
        <td colSpan={3}>{title}</td>
      </tr>
      {lines.map((line) => (
        <tr key={line.accountId} className="clickable" onClick={() => onOpenAccount(line.accountId)} title="Open this account's general ledger">
          <td className="code-col">{line.code}</td>
          <td>
            <span className="link-like">{line.name}</span>
          </td>
          <td className="money">{formatStatement(line.amountCents)}</td>
        </tr>
      ))}
      {lines.length === 0 && (
        <tr>
          <td />
          <td className="muted">None</td>
          <td />
        </tr>
      )}
      <tr className="subtotal-row">
        <td />
        <td>{totalLabel}</td>
        <td className="money">{formatStatement(totalCents)}</td>
      </tr>
    </>
  );
}

/** Balance sheet (FR-29) as at the end of the range. */
export function BalanceSheetView({ report, onOpenAccount }: { report: BalanceSheet; onOpenAccount: (accountId: number) => void }) {
  const liabilitiesAndEquity = report.totalLiabilitiesCents + report.totalEquityCents;
  const balanced = report.totalAssetsCents === liabilitiesAndEquity;
  return (
    <table className="data-table statement-table">
      <tbody>
        <StatementSection title="Assets" lines={report.assets} totalLabel="Total assets" totalCents={report.totalAssetsCents} onOpenAccount={onOpenAccount} />
        <StatementSection title="Liabilities" lines={report.liabilities} totalLabel="Total liabilities" totalCents={report.totalLiabilitiesCents} onOpenAccount={onOpenAccount} />
        <tr className="section-row">
          <td colSpan={3}>Equity</td>
        </tr>
        {report.equity.map((line) => (
          <tr key={line.accountId} className="clickable" onClick={() => onOpenAccount(line.accountId)}>
            <td className="code-col">{line.code}</td>
            <td>
              <span className="link-like">{line.name}</span>
            </td>
            <td className="money">{formatStatement(line.amountCents)}</td>
          </tr>
        ))}
        <tr>
          <td />
          <td>Current earnings (not yet closed)</td>
          <td className="money">{formatStatement(report.currentEarningsCents)}</td>
        </tr>
        <tr className="subtotal-row">
          <td />
          <td>Total equity</td>
          <td className="money">{formatStatement(report.totalEquityCents)}</td>
        </tr>
        <tr className="grand-total-row">
          <td />
          <td>
            Total liabilities and equity{" "}
            <span className={balanced ? "balanced" : "problem"}>{balanced ? "· Balances with assets" : "· Doesn't balance"}</span>
          </td>
          <td className="money">{formatStatement(liabilitiesAndEquity)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Income statement (FR-29) for the range. */
export function IncomeStatementView({ report, onOpenAccount }: { report: IncomeStatement; onOpenAccount: (accountId: number) => void }) {
  return (
    <table className="data-table statement-table">
      <tbody>
        <StatementSection title="Revenue" lines={report.revenue} totalLabel="Total revenue" totalCents={report.totalRevenueCents} onOpenAccount={onOpenAccount} />
        <StatementSection title="Expenses" lines={report.expenses} totalLabel="Total expenses" totalCents={report.totalExpensesCents} onOpenAccount={onOpenAccount} />
        <tr className="grand-total-row">
          <td />
          <td>{report.netIncomeCents >= 0 ? "Net income" : "Net loss"}</td>
          <td className="money">{formatStatement(report.netIncomeCents)}</td>
        </tr>
      </tbody>
    </table>
  );
}
