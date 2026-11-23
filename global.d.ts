declare module "*.css";

interface Window {
  helloWorld: {
    runHelloWorld: () => Promise<string>;
  };
  clients: import("./src/common/clients/clientSchemas").ClientsApi;
  chartOfAccounts: import("./src/common/accounts/accountSchemas").ChartOfAccountsApi;
}
