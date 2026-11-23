declare module "*.css";

interface Window {
  clients: import("./src/common/clients/clientSchemas").ClientsApi;
  chartOfAccounts: import("./src/common/accounts/accountSchemas").ChartOfAccountsApi;
  accountTemplates: import("./src/common/templates/accountTemplateSchemas").AccountTemplatesApi;
}
