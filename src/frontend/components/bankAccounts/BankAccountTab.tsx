import { useCallback, useEffect, useState } from "react";

import type { Account } from "../../../common/accounts/accountSchemas";
import {
  BANK_ACCOUNT_KIND_LABELS,
  type BankAccount,
} from "../../../common/bankAccounts/bankAccountSchemas";
import type { ImportSource } from "../../../common/imports/importSchemas";
import { formatCents } from "../../../common/money";
import type { ImportBatch, StagedTransaction } from "../../../common/staging/stagingSchemas";
import { CodingGrid } from "../coding/CodingGrid";
import { ModalForm } from "../common/Modal";
import { useSubmit } from "../common/useSubmit";
import { ImportsList } from "../imports/ImportsList";
import { ImportWizard } from "../imports/ImportWizard";

interface BankAccountTabProps {
  clientId: string;
  bankAccount: BankAccount;
  /** Every tab of the client, for rule scopes. */
  bankAccounts: readonly BankAccount[];
  /** Called after anything that changes the tab (rename, import, posting). */
  onChanged: () => Promise<void>;
  /** Called after the tab is removed. */
  onRemoved: () => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * One bank account or credit card tab: import, code and post its rows, and
 * see the linked account's balance from posted entries.
 */
export function BankAccountTab({ clientId, bankAccount, bankAccounts, onChanged, onRemoved }: BankAccountTabProps) {
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [rows, setRows] = useState<StagedTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [wizard, setWizard] = useState<{ source: ImportSource | null } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextBatches, nextRows, nextAccounts] = await Promise.all([
        window.staging.list(clientId, bankAccount.id),
        window.staging.rows(clientId, bankAccount.id),
        window.chartOfAccounts.list(clientId),
      ]);
      setBatches(nextBatches);
      setRows(nextRows);
      setAccounts(nextAccounts);
      setLoaded(true);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [clientId, bankAccount.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refreshAll = async () => {
    await reload();
    await onChanged();
  };

  const openFile = async () => {
    setError(null);
    setNotice(null);
    try {
      const source = await window.imports.openFile();
      if (source) setWizard({ source });
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const removeBatch = async (batch: ImportBatch) => {
    if (!window.confirm(`Remove this import of ${batch.rows.length} rows? You can import the file again afterwards.`)) {
      return;
    }
    try {
      await window.staging.removeBatch(clientId, batch.id);
      await refreshAll();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const removeTab = async () => {
    if (!window.confirm(`Remove the "${bankAccount.name}" tab? Its ledger account ${bankAccount.accountCode} stays in the chart of accounts.`)) {
      return;
    }
    try {
      await window.bankAccounts.delete(clientId, bankAccount.id);
      onRemoved();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const isCard = bankAccount.kind === "credit_card";
  const balance = isCard ? -bankAccount.ledgerBalanceCents : bankAccount.ledgerBalanceCents;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>
            {bankAccount.name}
            <span className="badge">{BANK_ACCOUNT_KIND_LABELS[bankAccount.kind]}</span>
          </h3>
          <p className="muted">
            Posts to {bankAccount.accountCode} {bankAccount.accountName} ·{" "}
            <span title="Computed from posted entries">
              {isCard ? "Balance owing" : "Ledger balance"} <strong className="balance">{formatCents(balance)}</strong>
            </span>
          </p>
        </div>
        <div className="panel-actions">
          <button type="button" className="button primary" onClick={() => void openFile()}>
            Import file…
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setNotice(null);
              setWizard({ source: null });
            }}
          >
            Paste rows…
          </button>
          <button type="button" className="button" onClick={() => setRenaming(true)}>
            Rename
          </button>
          {!bankAccount.hasImports && (
            <button type="button" className="button danger" onClick={() => void removeTab()}>
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
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {loaded && rows.length === 0 ? (
        <div className="empty-panel">
          <p>Nothing imported yet.</p>
          <p className="muted">Import a statement file or paste rows to get started.</p>
        </div>
      ) : (
        loaded && (
          <CodingGrid
            clientId={clientId}
            bankAccount={bankAccount}
            bankAccounts={bankAccounts}
            rows={rows}
            accounts={accounts}
            onChanged={refreshAll}
            onNotice={setNotice}
          />
        )
      )}

      <ImportsList batches={batches} onRemove={(batch) => void removeBatch(batch)} />

      {wizard && (
        <ImportWizard
          clientId={clientId}
          bankAccount={bankAccount}
          initialSource={wizard.source}
          onImported={(count) => {
            setNotice(`Imported ${count} row${count === 1 ? "" : "s"}. Code them below, then post.`);
            void refreshAll();
          }}
          onClose={() => setWizard(null)}
        />
      )}

      {renaming && (
        <RenameBankAccountDialog
          clientId={clientId}
          bankAccount={bankAccount}
          onRenamed={() => void onChanged()}
          onClose={() => setRenaming(false)}
        />
      )}
    </section>
  );
}

interface RenameBankAccountDialogProps {
  clientId: string;
  bankAccount: BankAccount;
  onRenamed: () => void;
  onClose: () => void;
}

function RenameBankAccountDialog({ clientId, bankAccount, onRenamed, onClose }: RenameBankAccountDialogProps) {
  const [name, setName] = useState(bankAccount.name);
  const { busy, error, submit } = useSubmit(async () => {
    await window.bankAccounts.rename(clientId, bankAccount.id, name);
    onRenamed();
  }, onClose);

  return (
    <ModalForm title="Rename tab" submitLabel="Save" busy={busy} error={error} onSubmit={submit} onClose={onClose}>
      <label className="field">
        <span>Name</span>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <p className="hint">The ledger account keeps its own name.</p>
    </ModalForm>
  );
}
