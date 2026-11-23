import { exposeAccountTemplatesClient } from "./frontend/ipc/AccountTemplatesClient";
import { exposeChartOfAccountsClient } from "./frontend/ipc/ChartOfAccountsClient";
import { exposeClientsClient } from "./frontend/ipc/ClientsClient";

exposeClientsClient();
exposeChartOfAccountsClient();
exposeAccountTemplatesClient();
