import { useState } from "react";

import {
  BANK_ACCOUNT_KIND_LABELS,
  type BankAccount,
} from "../../../common/bankAccounts/bankAccountSchemas";
import { ModalForm } from "../common/Modal";
import { useSubmit } from "../common/useSubmit";

interface BankAccountTabProps {
  clientId: string;
  bankAccount: BankAccount;
  /** Called after the tab is renamed, with the updated tab. */
  onChanged: (bankAccount: BankAccount) => void;
  /** Called after the tab is removed. */
  onRemoved: () => void;
}

/**
 * One bank account or credit card tab: what it posts to, plus rename and
 * remove. Imports and staged transactions live here too.
 */
export function BankAccountTab({
  clientId,
  bankAccount,
  onChanged,
  onRemoved,
}: BankAccountTabProps) {
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (
      !window.confirm(
        `Remove the "${bankAccount.name}" tab? Its ledger account ${bankAccount.accountCode} stays in the chart of accounts.`,
      )
    ) {
      return;
    }
    try {
      await window.bankAccounts.delete(clientId, bankAccount.id);
      onRemoved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>
            {bankAccount.name}
            <span className="badge">{BANK_ACCOUNT_KIND_LABELS[bankAccount.kind]}</span>
          </h3>
          <p className="muted">
            Posts to {bankAccount.accountCode} {bankAccount.accountName}
          </p>
        </div>
        <div className="panel-actions">
          <button type="button" className="button" onClick={() => setRenaming(true)}>
            Rename
          </button>
          {!bankAccount.hasImports && (
            <button type="button" className="button danger" onClick={() => void remove()}>
              Remove tab
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {renaming && (
        <RenameBankAccountDialog
          clientId={clientId}
          bankAccount={bankAccount}
          onRenamed={onChanged}
          onClose={() => setRenaming(false)}
        />
      )}
    </section>
  );
}

interface RenameBankAccountDialogProps {
  clientId: string;
  bankAccount: BankAccount;
  onRenamed: (bankAccount: BankAccount) => void;
  onClose: () => void;
}

function RenameBankAccountDialog({
  clientId,
  bankAccount,
  onRenamed,
  onClose,
}: RenameBankAccountDialogProps) {
  const [name, setName] = useState(bankAccount.name);
  const { busy, error, submit } = useSubmit(
    async () => onRenamed(await window.bankAccounts.rename(clientId, bankAccount.id, name)),
    onClose,
  );

  return (
    <ModalForm
      title="Rename tab"
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <label className="field">
        <span>Name</span>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <p className="hint">The ledger account keeps its own name.</p>
    </ModalForm>
  );
}
