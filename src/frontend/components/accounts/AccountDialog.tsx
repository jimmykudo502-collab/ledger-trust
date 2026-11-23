import { useState } from "react";

import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  type Account,
  type AccountInput,
  type AccountType,
} from "../../../common/accounts/accountSchemas";
import { ModalForm } from "../common/Modal";
import { useSubmit } from "../common/useSubmit";

interface AccountDialogProps {
  /** The account being edited, or `undefined` to add a new one. */
  account?: Account;
  /** Starting values for a new account, e.g. a code typed in the grid. */
  initial?: Partial<AccountInput>;
  /** Extra explanation shown above the fields. */
  hint?: string;
  /** Saves the form; rejects with a user-facing message. */
  onSave: (input: AccountInput) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Dialog for adding or editing an account's code, name and type (FR-5).
 * The type is read-only for system accounts and accounts with posted entries.
 */
export function AccountDialog({ account, initial, hint, onSave, onClose }: AccountDialogProps) {
  const [code, setCode] = useState(account?.code ?? initial?.code ?? "");
  const [name, setName] = useState(account?.name ?? initial?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? initial?.type ?? "expense");
  const { busy, error, submit } = useSubmit(
    () => onSave({ code, name, type }),
    onClose,
  );

  const typeLockedReason = account?.systemKey
    ? "This account is required by the app, so its type is fixed."
    : account?.hasActivity
      ? "This account has posted entries, so its type is fixed."
      : null;

  return (
    <ModalForm
      title={account ? "Edit account" : "Add account"}
      submitLabel={account ? "Save" : "Add account"}
      busy={busy}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      {hint && <p className="hint">{hint}</p>}
      <div className="field-row">
        <label className="field code-field">
          <span>Code</span>
          <input
            autoFocus={!initial?.code}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="e.g. 5100"
          />
        </label>
        <label className="field">
          <span>Name</span>
          <input
            autoFocus={Boolean(initial?.code)}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Repairs and maintenance"
          />
        </label>
      </div>
      <label className="field">
        <span>Type</span>
        <select
          value={type}
          disabled={typeLockedReason !== null}
          onChange={(event) => setType(event.target.value as AccountType)}
        >
          {ACCOUNT_TYPES.map((option) => (
            <option key={option} value={option}>
              {ACCOUNT_TYPE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      {typeLockedReason && <p className="hint">{typeLockedReason}</p>}
    </ModalForm>
  );
}
