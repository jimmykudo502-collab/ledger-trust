import { useCallback, useEffect, useState } from "react";

import type { BankAccount } from "../../../common/bankAccounts/bankAccountSchemas";
import type { ClientSummary } from "../../../common/clients/clientSchemas";
import { ChartOfAccounts } from "../accounts/ChartOfAccounts";
import { AddBankAccountDialog } from "../bankAccounts/AddBankAccountDialog";
import { BankAccountTab } from "../bankAccounts/BankAccountTab";
import { ClientHeader } from "./ClientHeader";

interface ClientWorkspaceProps {
  client: ClientSummary;
}

/** Which tab is showing: the chart of accounts or a bank account's id. */
type TabKey = "accounts" | number;

/**
 * The open client: header, then a tab for the chart of accounts and one tab
 * per bank account or credit card (FR-9).
 */
export function ClientWorkspace({ client }: ClientWorkspaceProps) {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [tab, setTab] = useState<TabKey>("accounts");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setBankAccounts(await window.bankAccounts.list(client.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [client.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = typeof tab === "number" ? bankAccounts.find((b) => b.id === tab) : undefined;

  return (
    <>
      <ClientHeader client={client} />
      <nav className="tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "accounts"}
          className={`tab${tab === "accounts" ? " active" : ""}`}
          onClick={() => setTab("accounts")}
        >
          Chart of accounts
        </button>
        {bankAccounts.map((bankAccount) => (
          <button
            key={bankAccount.id}
            type="button"
            role="tab"
            aria-selected={tab === bankAccount.id}
            className={`tab${tab === bankAccount.id ? " active" : ""}`}
            onClick={() => setTab(bankAccount.id)}
          >
            {bankAccount.name}
          </button>
        ))}
        <button type="button" className="tab add" onClick={() => setAdding(true)}>
          + Bank account or card
        </button>
      </nav>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {current ? (
        <BankAccountTab
          key={current.id}
          clientId={client.id}
          bankAccount={current}
          onChanged={() => void reload()}
          onRemoved={() => {
            setTab("accounts");
            void reload();
          }}
        />
      ) : (
        <ChartOfAccounts clientId={client.id} />
      )}

      {adding && (
        <AddBankAccountDialog
          clientId={client.id}
          existing={bankAccounts}
          onCreated={(created) => {
            void reload();
            setTab(created.id);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
