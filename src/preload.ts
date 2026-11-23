import { exposeClientsClient } from "./frontend/ipc/ClientsClient";
import { exposeHelloWorldClient } from "./frontend/ipc/HelloWorldClient";

exposeHelloWorldClient();
exposeClientsClient();
