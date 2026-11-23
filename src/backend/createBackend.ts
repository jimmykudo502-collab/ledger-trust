import path from "node:path";

import { ClientConnectionPool } from "./db/ClientConnectionPool";
import { ClientDatabaseFactory } from "./db/ClientDatabaseFactory";
import { ClientFileStore } from "./db/ClientFileStore";
import type { TransactionRunner } from "./db/TransactionRunner";
import { SpreadsheetReader } from "./import/SpreadsheetReader";
import { SqliteBankAccountRepository } from "./repositories/BankAccountRepository";
import { SqliteCodingRuleRepository } from "./repositories/CodingRuleRepository";
import { SqliteJournalRepository } from "./repositories/JournalRepository";
import { SqliteAccountRepository } from "./repositories/SqliteAccountRepository";
import { SqliteClientRepository } from "./repositories/SqliteClientRepository";
import { SqliteStagingRepository } from "./repositories/StagingRepository";
import { AccountTemplateService } from "./services/AccountTemplateService";
import { BankAccountService } from "./services/BankAccountService";
import { BankPostingService } from "./services/BankPostingService";
import { ChartOfAccountsService } from "./services/ChartOfAccountsService";
import { ClientService } from "./services/ClientService";
import { CodingRuleService } from "./services/CodingRuleService";
import { CodingService } from "./services/CodingService";
import { ImportService } from "./services/ImportService";
import { JournalService } from "./services/JournalService";
import { StagingService } from "./services/StagingService";
import { JsonFileTemplateStore } from "./templates/TemplateStore";

/** The wired-up backend services plus a way to shut them down. */
export interface Backend {
  readonly clients: ClientService;
  readonly chartOfAccounts: ChartOfAccountsService;
  readonly accountTemplates: AccountTemplateService;
  readonly bankAccounts: BankAccountService;
  readonly imports: ImportService;
  readonly staging: StagingService;
  readonly coding: CodingService;
  readonly posting: BankPostingService;
  readonly codingRules: CodingRuleService;
  /** Closes every open client database. */
  dispose(): void;
}

/**
 * Composition root: builds the backend services and their dependencies.
 * @param dataDirectory Folder for app data (Electron's `userData`); client
 *   databases go in its `clients` subfolder and the master chart of accounts
 *   template in `templates/master-chart-of-accounts.json`.
 */
export const createBackend = (dataDirectory: string): Backend => {
  const fileStore = new ClientFileStore(path.join(dataDirectory, "clients"));
  const pool = new ClientConnectionPool(fileStore, new ClientDatabaseFactory());
  const chartOfAccounts = new ChartOfAccountsService(
    (clientId) => new SqliteAccountRepository(pool.get(clientId)),
  );
  const clients = new ClientService(
    new SqliteClientRepository(fileStore, pool),
    [chartOfAccounts],
  );

  const accountTemplates = new AccountTemplateService(
    new JsonFileTemplateStore(
      path.join(dataDirectory, "templates", "master-chart-of-accounts.json"),
    ),
    chartOfAccounts,
  );

  const bankAccounts = new BankAccountService(
    (clientId) => new SqliteBankAccountRepository(pool.get(clientId)),
    chartOfAccounts,
  );

  const stagingFor = (clientId: string) => new SqliteStagingRepository(pool.get(clientId));
  const codingRules = new CodingRuleService(
    (clientId) => new SqliteCodingRuleRepository(pool.get(clientId)),
    stagingFor,
    bankAccounts,
    chartOfAccounts,
  );
  const imports = new ImportService(new SpreadsheetReader(), bankAccounts, stagingFor, codingRules);
  const staging = new StagingService(stagingFor, bankAccounts);
  const inTransaction: TransactionRunner = (clientId, work) => pool.get(clientId).transaction(work)();
  const journal = new JournalService((clientId) => new SqliteJournalRepository(pool.get(clientId)), chartOfAccounts);
  const coding = new CodingService(stagingFor, bankAccounts, chartOfAccounts);
  const posting = new BankPostingService(stagingFor, bankAccounts, journal, inTransaction);

  return {
    clients,
    chartOfAccounts,
    accountTemplates,
    bankAccounts,
    imports,
    staging,
    coding,
    posting,
    codingRules,
    dispose: () => pool.closeAll(),
  };
};
