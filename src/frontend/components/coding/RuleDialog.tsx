import { useState } from "react";

import type { Account } from "../../../common/accounts/accountSchemas";
import type { BankAccount } from "../../../common/bankAccounts/bankAccountSchemas";
import type { ApplyResult } from "../../../common/rules/ruleSchemas";
import { ModalForm } from "../common/Modal";
import { useSubmit } from "../common/useSubmit";

interface RuleDialogProps {
  clientId: string;
  accounts: readonly Account[];
  bankAccounts: readonly BankAccount[];
  /** Starting values, e.g. from a coded row. */
  initial?: { matchText?: string; code?: string; bankAccountId?: number | null };
  onSaved: (result: ApplyResult) => void;
  onClose: () => void;
}

/**
 * Dialog for a remembered coding rule (FR-18): "when the description
 * contains this text, use this code", for one tab or every tab.
 */
export function RuleDialog({ clientId, accounts, bankAccounts, initial, onSaved, onClose }: RuleDialogProps) {
  const [matchText, setMatchText] = useState(initial?.matchText ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [scope, setScope] = useState<number | null>(initial?.bankAccountId ?? null);
  const [applyNow, setApplyNow] = useState(true);
  const { busy, error, submit } = useSubmit(
    async () => onSaved(await window.codingRules.create(clientId, { matchText, code, bankAccountId: scope }, applyNow)),
    onClose,
  );
  const account = accounts.find((candidate) => candidate.code === code.trim());

  return (
    <ModalForm
      title="Remember this coding"
      submitLabel="Save rule"
      busy={busy}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <label className="field">
        <span>When the description contains</span>
        <input autoFocus value={matchText} onChange={(event) => setMatchText(event.target.value)} />
      </label>
      <p className="hint">Shorten it to the part that stays the same each time, e.g. "HYDRO ONE" instead of the full line.</p>
      <div className="field-row">
        <label className="field code-field">
          <span>Use code</span>
          <input list="rule-account-codes" value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <div className="field">
          <span>Account</span>
          <p className="account-preview">{account ? account.name : code.trim() ? "No account with this code" : ""}</p>
        </div>
      </div>
      <datalist id="rule-account-codes">
        {accounts.map((option) => (
          <option key={option.id} value={option.code}>
            {option.name}
          </option>
        ))}
      </datalist>
      <label className="field">
        <span>Applies to</span>
        <select
          value={scope ?? ""}
          onChange={(event) => setScope(event.target.value === "" ? null : Number(event.target.value))}
        >
          <option value="">Every tab</option>
          {bankAccounts.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.name} only
            </option>
          ))}
        </select>
      </label>
      <label className="radio-line">
        <input type="checkbox" checked={applyNow} onChange={(event) => setApplyNow(event.target.checked)} />
        Also code matching rows that don't have a code yet
      </label>
    </ModalForm>
  );
}
