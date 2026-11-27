import { Fragment } from "react";

import { FS_MAP_LABELS, FS_SECTION_INFO, type FsMap } from "../../../common/fsMaps/fsMapSchemas";
import { formatCents, formatStatement } from "../../../common/money";
import {
  balanceSheetBlocks,
  incomeStatementBlocks,
  type StatementBlock,
} from "../../../common/reports/mappedStatementLayout";
import type { FsTrialBalance, MappedBalanceSheet, MappedIncomeStatement } from "../../../common/reports/mappedStatementSchemas";

interface MappedViewProps {
  /** List the accounts under each FS line. */
  showAccounts: boolean;
  onOpenAccount: (accountId: number) => void;
}

function UnmappedNotice({ count, map }: { count: number; map: FsMap }) {
  if (count === 0) return null;
  return (
    <p className="warning" role="status">
      {count} account{count === 1 ? " has" : "s have"} no line on the {FS_MAP_LABELS[map].toLowerCase()} FS map and{" "}
      {count === 1 ? "is" : "are"} shown under “Accounts not mapped”. Map {count === 1 ? "it" : "them"} on the FS maps tab.
    </p>
  );
}

function BlockRows({ block, showAccounts, onOpenAccount }: MappedViewProps & { block: StatementBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <tr className="section-row">
          <td colSpan={3}>{block.label}</td>
        </tr>
      );
    case "empty":
      return (
        <tr>
          <td />
          <td className="muted">None</td>
          <td />
        </tr>
      );
    case "note":
      return (
        <tr>
          <td />
          <td>{block.label}</td>
          <td className="money">{formatStatement(block.cents)}</td>
        </tr>
      );
    case "total":
      return (
        <tr className={block.grand ? "grand-total-row" : "subtotal-row"}>
          <td />
          <td>{block.label}</td>
          <td className="money">{formatStatement(block.cents)}</td>
        </tr>
      );
    case "line":
      return (
        <>
          <tr>
            <td className="code-col">{block.line.code}</td>
            <td>{block.line.lineId === null ? <span className="warning">{block.line.name}</span> : block.line.name}</td>
            <td className="money">{formatStatement(block.line.amountCents)}</td>
          </tr>
          {showAccounts &&
            block.line.accounts.map((account) => (
              <tr
                key={account.accountId}
                className="line-account clickable"
                title="Open this account's general ledger"
                onClick={() => onOpenAccount(account.accountId)}
              >
                <td />
                <td>
                  <span className="link-like">
                    {account.code} {account.name}
                  </span>
                </td>
                <td className="money">{formatStatement(account.amountCents)}</td>
              </tr>
            ))}
        </>
      );
  }
}

function BlockTable({ blocks, ...props }: MappedViewProps & { blocks: readonly StatementBlock[] }) {
  return (
    <table className="data-table statement-table">
      <tbody>
        {blocks.map((block, index) => (
          <BlockRows key={index} block={block} {...props} />
        ))}
      </tbody>
    </table>
  );
}

/** Balance sheet rolled up by an FS map (FR-36). */
export function MappedBalanceSheetView({ report, ...props }: MappedViewProps & { report: MappedBalanceSheet }) {
  const balanced = report.totalAssetsCents === report.totalLiabilitiesCents + report.totalEquityCents;
  return (
    <>
      <UnmappedNotice count={report.unmappedAccountCount} map={report.map} />
      <BlockTable blocks={balanceSheetBlocks(report)} {...props} />
      <p className={balanced ? "balanced" : "problem"}>
        {balanced ? "Assets equal liabilities plus equity." : "Assets don't equal liabilities plus equity."}
      </p>
    </>
  );
}

/** Income statement rolled up by an FS map (FR-36), with the usual subtotals. */
export function MappedIncomeStatementView({ report, ...props }: MappedViewProps & { report: MappedIncomeStatement }) {
  return (
    <>
      <UnmappedNotice count={report.unmappedAccountCount} map={report.map} />
      <BlockTable blocks={incomeStatementBlocks(report)} {...props} />
    </>
  );
}

/**
 * Trial balance grouped by an FS map (FR-37): each FS line with the amount
 * shown on the statement, and the accounts that make it up with their
 * balances. Clicking an account opens its general ledger.
 */
export function FsTrialBalanceView({ report, onOpenAccount }: { report: FsTrialBalance; onOpenAccount: (accountId: number) => void }) {
  const balanced = report.totals.debitCents === report.totals.creditCents;
  return (
    <>
      <UnmappedNotice count={report.unmappedAccountCount} map={report.map} />
      <table className="data-table report-table">
        <thead>
          <tr>
            <th className="code-col">Map no.</th>
            <th>FS line / account</th>
            <th className="money">Debit balance</th>
            <th className="money">Credit balance</th>
            <th className="money">FS amount</th>
          </tr>
        </thead>
        <tbody>
          {report.sections.map((section) => (
            <Fragment key={section.section}>
              <tr className="section-row">
                <td colSpan={5}>{FS_SECTION_INFO[section.section].label}</td>
              </tr>
              {section.lines.map((line) => (
                <Fragment key={line.lineId ?? `unmapped-${section.section}`}>
                  <tr className="fs-line-row">
                    <td className="code-col">{line.code}</td>
                    <td>{line.lineId === null ? <span className="warning">{line.name}</span> : line.name}</td>
                    <td />
                    <td />
                    <td className="money">{formatStatement(line.fsAmountCents)}</td>
                  </tr>
                  {line.accounts.map((account) => (
                    <tr
                      key={account.accountId}
                      className="line-account clickable"
                      title="Open this account's general ledger"
                      onClick={() => onOpenAccount(account.accountId)}
                    >
                      <td />
                      <td>
                        <span className="link-like">
                          {account.code} {account.name}
                        </span>
                      </td>
                      <td className="money">{account.closingCents > 0 ? formatCents(account.closingCents) : ""}</td>
                      <td className="money">{account.closingCents < 0 ? formatCents(-account.closingCents) : ""}</td>
                      <td />
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="subtotal-row">
                <td />
                <td>Total {FS_SECTION_INFO[section.section].label.toLowerCase()}</td>
                <td />
                <td />
                <td className="money">{formatStatement(section.fsAmountCents)}</td>
              </tr>
            </Fragment>
          ))}
          {report.sections.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Nothing posted up to this date.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="totals-row">
            <td colSpan={2}>
              Totals{" "}
              <span className={balanced ? "balanced" : "problem"}>{balanced ? "· Balanced" : "· Out of balance"}</span>
            </td>
            <td className="money">{formatCents(report.totals.debitCents)}</td>
            <td className="money">{formatCents(report.totals.creditCents)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </>
  );
}
