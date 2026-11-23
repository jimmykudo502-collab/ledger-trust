import { useEffect, useState } from "react";

import type { Account } from "../../../common/accounts/accountSchemas";
import {
  BANK_ACCOUNT_KIND_LABELS,
  BANK_ACCOUNT_KINDS,
  LEDGER_TYPE_FOR_KIND,
  type BankAccount,
  type BankAccountKind,
} from "../../../common/bankAccounts/bankAccountSchemas";
import { ModalForm } from "../common/Modal";
import { useSubmit } from "../common/useSubmit";

interface AddBankAccountDialogProps {
  clientId: string;
  /** Existing tabs, so already-linked accounts aren't offered again. */
  existing: readonly BankAccount[];
  onCreated: (bankAccount: BankAccount) => void;
  onClose: () => void;
}

/**
 * Dialog for adding a bank account or credit card tab (FR-9) and choosing
 * the ledger account it posts to (FR-10).
 */
export function AddBankAccountDialog({
  clientId,
  existing,
  onCreated,
  onClose,
}: AddBankAccountDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BankAccountKind>("bank");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [code, setCode] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    window.chartOfAccounts.list(clientId).then(setAccounts, () => setAccounts([]));
  }, [clientId]);

  const linked = new Set(existing.map((tab) => tab.accountId));
  const candidates = accounts.filter(
    (account) =>
      account.type === LEDGER_TYPE_FOR_KIND[kind] &&
      account.systemKey === null &&
      !linked.has(account.id),
  );
  const selectedId = candidates.some((a) => a.id === accountId) ? accountId : null;

  const { busy, error, submit } = useSubmit(async () => {
    if (mode === "existing" && selectedId === null) {
      throw new Error("Choose the ledger account this tab posts to.");
    }
    const created = await window.bankAccounts.create(clientId, {
      name,
      kind,
      ledger: mode === "new" ? { mode, code } : { mode, accountId: selectedId },
    });
    onCreated(created);
  }, onClose);

  const typeLabel = LEDGER_TYPE_FOR_KIND[kind] === "asset" ? "asset" : "liability";

  return (
    <ModalForm
      title="Add bank account or credit card"
      submitLabel="Add tab"
      busy={busy}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="segmented" role="radiogroup" aria-label="Kind">
        {BANK_ACCOUNT_KINDS.map((option) => (
          <label key={option} className={kind === option ? "selected" : ""}>
            <input
              type="radio"
              name="kind"
              checked={kind === option}
              onChange={() => setKind(option)}
            />
            {BANK_ACCOUNT_KIND_LABELS[option]}
          </label>
        ))}
      </div>
      <label className="field">
        <span>Name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={kind === "bank" ? "e.g. Chequing" : "e.g. Visa"}
        />
      </label>

      <p className="field-label">Ledger account it posts to</p>
      <label className="radio-line">
        <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} />
        Create a new {typeLabel} account with this name
      </label>
      {mode === "new" && (
        <label className="field indent">
          <span>Account code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={kind === "bank" ? "e.g. 1000" : "e.g. 2100"}
          />
        </label>
      )}
      <label className="radio-line">
        <input
          type="radio"
          checked={mode === "existing"}
          disabled={candidates.length === 0}
          onChange={() => setMode("existing")}
        />
        Use an existing {typeLabel} account
        {candidates.length === 0 && <span className="muted"> (none available)</span>}
      </label>
      {mode === "existing" && (
        <label className="field indent">
          <span>Account</span>
          <select
            value={selectedId ?? ""}
            onChange={(event) => setAccountId(Number(event.target.value))}
          >
            <option value="" disabled>
              Choose an account…
            </option>
            {candidates.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} {account.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </ModalForm>
  );
}
