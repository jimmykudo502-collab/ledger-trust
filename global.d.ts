declare module "*.css";

interface Window {
  clients: import("./src/common/clients/clientSchemas").ClientsApi;
  chartOfAccounts: import("./src/common/accounts/accountSchemas").ChartOfAccountsApi;
  bankAccounts: import("./src/common/bankAccounts/bankAccountSchemas").BankAccountsApi;
  imports: import("./src/common/imports/importSchemas").ImportsApi;
  staging: import("./src/common/staging/stagingSchemas").StagingApi;
  codingRules: import("./src/common/rules/ruleSchemas").CodingRulesApi;
  accountTemplates: import("./src/common/templates/accountTemplateSchemas").AccountTemplatesApi;
}
