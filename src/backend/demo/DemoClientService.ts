import type { ClientSummary } from "../../common/clients/clientSchemas";
import { UserFacingError } from "../errors";
import type { BankAccountService } from "../services/BankAccountService";
import type { BankPostingService } from "../services/BankPostingService";
import type { ChartOfAccountsService } from "../services/ChartOfAccountsService";
import type { ClientService } from "../services/ClientService";
import type { CodingRuleService } from "../services/CodingRuleService";
import type { StagingRepositoryProvider } from "../services/ImportService";
import type { ManualEntryService } from "../services/ManualEntryService";
import type { TransferService } from "../services/TransferService";
import {
  DEMO_ACCOUNTS,
  DEMO_CLIENT_NAME,
  DEMO_ENTRIES,
  DEMO_POSTED_THROUGH,
  DEMO_RULES,
  DEMO_TABS,
  type DemoRow,
} from "./demoData";

/** The services the demo client is built with. */
export interface DemoDependencies {
  readonly clients: ClientService;
  readonly chartOfAccounts: ChartOfAccountsService;
  readonly bankAccounts: BankAccountService;
  readonly codingRules: CodingRuleService;
  readonly stagingFor: StagingRepositoryProvider;
  readonly transfers: TransferService;
  readonly posting: BankPostingService;
  readonly manualEntries: ManualEntryService;
}

/**
 * Builds a fully made-up demo client (step 10: test with made-up data before
 * real files). It goes through the app's own services, so it exercises the
 * same import, rule, transfer, posting and journal code as real use:
 * January to early March is posted, and the rest of March waits in staging,
 * coded and matched, ready to post.
 */
export class DemoClientService {
  /**
   * @param deps The services to build the demo with.
   */
  public constructor(private readonly deps: DemoDependencies) {}

  /**
   * Creates the demo client.
   * @returns The new client.
   */
  public create(): ClientSummary {
    const { clients, chartOfAccounts, bankAccounts, codingRules, transfers, posting, manualEntries } = this.deps;
    const client = clients.create({ name: DEMO_CLIENT_NAME, fiscalYearEnd: "2026-12-31" });
    const tabCodes = new Set(DEMO_TABS.map((tab) => tab.code));
    for (const account of DEMO_ACCOUNTS.filter((a) => !tabCodes.has(a.code))) {
      chartOfAccounts.create(client.id, account);
    }
    const tabs = DEMO_TABS.map((tab) => ({
      ...tab,
      id: bankAccounts.create(client.id, { name: tab.name, kind: tab.kind, ledger: { mode: "new", code: tab.code } }).id,
    }));
    for (const [matchText, code] of DEMO_RULES) {
      codingRules.create(client.id, { matchText, code, bankAccountId: null }, false);
    }

    // First import: everything up to the cut-off, then post it.
    for (const tab of tabs) this.stage(client.id, tab.id, tab.rows().filter((row) => row.date <= DEMO_POSTED_THROUGH), "Demo January to early March");
    transfers.autoMatch(client.id);
    for (const tab of tabs) posting.post(client.id, tab.id);

    // Second import: the rest of March stays in staging for you to post.
    for (const tab of tabs) this.stage(client.id, tab.id, tab.rows().filter((row) => row.date > DEMO_POSTED_THROUGH), "Demo rest of March");
    transfers.autoMatch(client.id);

    const accountId = (code: string) => {
      const account = chartOfAccounts.findByCode(client.id, code);
      if (!account) throw new UserFacingError(`Demo account ${code} is missing.`);
      return account.id;
    };
    for (const entry of DEMO_ENTRIES) {
      manualEntries.create(client.id, {
        date: entry.date,
        description: entry.description,
        lines: entry.lines.map(([code, debitCents, creditCents]) => ({ accountId: accountId(code), debitCents, creditCents })),
      });
    }
    return clients.list().find((candidate) => candidate.id === client.id) ?? client;
  }

  private stage(clientId: string, bankAccountId: number, rows: DemoRow[], sourceName: string): void {
    if (rows.length === 0) return;
    const suggest = this.deps.codingRules.suggester(clientId, bankAccountId);
    this.deps.stagingFor(clientId).insertBatch(
      bankAccountId,
      { kind: "paste", name: sourceName },
      rows.map((row, index) => ({ ...row, rowNumber: index + 2, offsetAccountId: suggest(row.description) })),
    );
  }
}
