declare module "*.css";

interface Window {
  clients: import("./src/common/clients/clientSchemas").ClientsApi;
  chartOfAccounts: import("./src/common/accounts/accountSchemas").ChartOfAccountsApi;
  bankAccounts: import("./src/common/bankAccounts/bankAccountSchemas").BankAccountsApi;
  accountTemplates: import("./src/common/templates/accountTemplateSchemas").AccountTemplatesApi;
}
