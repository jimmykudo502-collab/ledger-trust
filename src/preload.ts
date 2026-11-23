import { exposeAccountTemplatesClient } from "./frontend/ipc/AccountTemplatesClient";
import { exposeBankAccountsClient } from "./frontend/ipc/BankAccountsClient";
import { exposeChartOfAccountsClient } from "./frontend/ipc/ChartOfAccountsClient";
import { exposeClientsClient } from "./frontend/ipc/ClientsClient";
import { exposeCodingRulesClient } from "./frontend/ipc/CodingRulesClient";
import { exposeImportsClient } from "./frontend/ipc/ImportsClient";
import { exposeStagingClient } from "./frontend/ipc/StagingClient";
import { exposeTransfersClient } from "./frontend/ipc/TransfersClient";

exposeClientsClient();
exposeChartOfAccountsClient();
exposeAccountTemplatesClient();
exposeBankAccountsClient();
exposeImportsClient();
exposeStagingClient();
exposeCodingRulesClient();
exposeTransfersClient();
