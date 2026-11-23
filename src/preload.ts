import { exposeAccountTemplatesClient } from "./frontend/ipc/AccountTemplatesClient";
import { exposeChartOfAccountsClient } from "./frontend/ipc/ChartOfAccountsClient";
import { exposeClientsClient } from "./frontend/ipc/ClientsClient";
import { exposeHelloWorldClient } from "./frontend/ipc/HelloWorldClient";

exposeHelloWorldClient();
exposeClientsClient();
exposeChartOfAccountsClient();
exposeAccountTemplatesClient();
