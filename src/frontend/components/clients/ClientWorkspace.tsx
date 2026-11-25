import { useCallback, useEffect, useState } from "react";

import type { BankAccount } from "../../../common/bankAccounts/bankAccountSchemas";
import type { ClientSummary } from "../../../common/clients/clientSchemas";
import { ChartOfAccounts } from "../accounts/ChartOfAccounts";
import { AddBankAccountDialog } from "../bankAccounts/AddBankAccountDialog";
import { BankAccountTab } from "../bankAccounts/BankAccountTab";
import { FsMaps } from "../fsMaps/FsMaps";
import { CodingRules } from "../coding/CodingRules";
import { JournalEntries } from "../journal/JournalEntries";
import { Reports } from "../reports/Reports";
import { TransferReview } from "../transfers/TransferReview";
import { YearEnd } from "../years/YearEnd";
import { ClientHeader } from "./ClientHeader";

interface ClientWorkspaceProps {
  client: ClientSummary;
}

/** Which tab is showing: chart of accounts, coding rules, or a bank account's id. */
type TabKey = "accounts" | "fsMaps" | "rules" | "transfers" | "entries" | "reports" | "years" | number;

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
        <button
          type="button"
          role="tab"
          aria-selected={tab === "fsMaps"}
          className={`tab${tab === "fsMaps" ? " active" : ""}`}
          onClick={() => setTab("fsMaps")}
        >
          FS maps
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "rules"}
          className={`tab${tab === "rules" ? " active" : ""}`}
          onClick={() => setTab("rules")}
        >
          Coding rules
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "transfers"}
          className={`tab${tab === "transfers" ? " active" : ""}`}
          onClick={() => setTab("transfers")}
        >
          Transfers
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "entries"}
          className={`tab${tab === "entries" ? " active" : ""}`}
          onClick={() => setTab("entries")}
        >
          Journal entries
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "reports"}
          className={`tab${tab === "reports" ? " active" : ""}`}
          onClick={() => setTab("reports")}
        >
          Reports
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "years"}
          className={`tab${tab === "years" ? " active" : ""}`}
          onClick={() => setTab("years")}
        >
          Year-end
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
          bankAccounts={bankAccounts}
          onChanged={reload}
          onRemoved={() => {
            setTab("accounts");
            void reload();
          }}
        />
      ) : tab === "years" ? (
        <YearEnd clientId={client.id} />
      ) : tab === "reports" ? (
        <Reports client={client} />
      ) : tab === "entries" ? (
        <JournalEntries clientId={client.id} />
      ) : tab === "transfers" ? (
        <TransferReview clientId={client.id} />
      ) : tab === "fsMaps" ? (
        <FsMaps clientId={client.id} />
      ) : tab === "rules" ? (
        <CodingRules clientId={client.id} bankAccounts={bankAccounts} />
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
