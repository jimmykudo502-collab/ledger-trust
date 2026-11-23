import { useCallback, useEffect, useState } from "react";

import type { Account } from "../../../common/accounts/accountSchemas";
import type { BankAccount } from "../../../common/bankAccounts/bankAccountSchemas";
import type { CodingRule } from "../../../common/rules/ruleSchemas";
import { RuleDialog } from "./RuleDialog";

interface CodingRulesProps {
  clientId: string;
  bankAccounts: readonly BankAccount[];
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * A client's remembered coding rules (FR-18): list, add and delete.
 */
export function CodingRules({ clientId, bankAccounts }: CodingRulesProps) {
  const [rules, setRules] = useState<CodingRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextRules, nextAccounts] = await Promise.all([
        window.codingRules.list(clientId),
        window.chartOfAccounts.list(clientId),
      ]);
      setRules(nextRules);
      setAccounts(nextAccounts);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = async (rule: CodingRule) => {
    if (!window.confirm(`Delete the rule for "${rule.matchText}"? Rows it already coded keep their codes.`)) return;
    try {
      await window.codingRules.delete(clientId, rule.id);
      await reload();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const tabById = new Map(bankAccounts.map((tab) => [tab.id, tab]));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Coding rules</h3>
          <p className="muted">Rows whose description contains the text are coded automatically when imported.</p>
        </div>
        <div className="panel-actions">
          <button type="button" className="button primary" onClick={() => setAdding(true)}>
            + Add rule
          </button>
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
            <th>Description contains</th>
            <th>Code</th>
            <th>Account</th>
            <th>Applies to</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => {
            const account = accountById.get(rule.accountId);
            return (
              <tr key={rule.id}>
                <td>{rule.matchText}</td>
                <td>{account?.code}</td>
                <td>{account?.name}</td>
                <td>{rule.bankAccountId === null ? "Every tab" : tabById.get(rule.bankAccountId)?.name ?? "—"}</td>
                <td className="row-actions">
                  <button type="button" className="button small danger" onClick={() => void remove(rule)}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
          {rules.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No rules yet. Add one here, or click “Remember” on a coded row.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {adding && (
        <RuleDialog
          clientId={clientId}
          accounts={accounts}
          bankAccounts={bankAccounts}
          onSaved={(result) => {
            setNotice(result.codedCount > 0 ? `Rule saved and coded ${result.codedCount} row${result.codedCount === 1 ? "" : "s"}.` : "Rule saved.");
            void reload();
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}
