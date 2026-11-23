import path from "node:path";

import { ClientConnectionPool } from "./db/ClientConnectionPool";
import { ClientDatabaseFactory } from "./db/ClientDatabaseFactory";
import { ClientFileStore } from "./db/ClientFileStore";
import { SqliteBankAccountRepository } from "./repositories/BankAccountRepository";
import { SqliteAccountRepository } from "./repositories/SqliteAccountRepository";
import { SqliteClientRepository } from "./repositories/SqliteClientRepository";
import { AccountTemplateService } from "./services/AccountTemplateService";
import { BankAccountService } from "./services/BankAccountService";
import { ChartOfAccountsService } from "./services/ChartOfAccountsService";
import { ClientService } from "./services/ClientService";
import { JsonFileTemplateStore } from "./templates/TemplateStore";

/** The wired-up backend services plus a way to shut them down. */
export interface Backend {
  readonly clients: ClientService;
  readonly chartOfAccounts: ChartOfAccountsService;
  readonly accountTemplates: AccountTemplateService;
  readonly bankAccounts: BankAccountService;
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

  return {
    clients,
    chartOfAccounts,
    accountTemplates,
    bankAccounts,
    dispose: () => pool.closeAll(),
  };
};
