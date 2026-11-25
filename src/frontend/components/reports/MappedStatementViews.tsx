import { FS_MAP_LABELS, type FsMap } from "../../../common/fsMaps/fsMapSchemas";
import { formatStatement } from "../../../common/money";
import {
  balanceSheetBlocks,
  incomeStatementBlocks,
  type StatementBlock,
} from "../../../common/reports/mappedStatementLayout";
import type { MappedBalanceSheet, MappedIncomeStatement } from "../../../common/reports/mappedStatementSchemas";

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
