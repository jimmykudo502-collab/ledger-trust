declare module "*.css";

interface Window {
  clients: import("./src/common/clients/clientSchemas").ClientsApi;
  chartOfAccounts: import("./src/common/accounts/accountSchemas").ChartOfAccountsApi;
  fsMaps: import("./src/common/fsMaps/fsMapSchemas").FsMapsApi;
  bankAccounts: import("./src/common/bankAccounts/bankAccountSchemas").BankAccountsApi;
  imports: import("./src/common/imports/importSchemas").ImportsApi;
  staging: import("./src/common/staging/stagingSchemas").StagingApi;
  codingRules: import("./src/common/rules/ruleSchemas").CodingRulesApi;
  transfers: import("./src/common/transfers/transferSchemas").TransfersApi;
  journalEntries: import("./src/common/journal/journalSchemas").JournalEntriesApi;
  reports: import("./src/common/reports/reportSchemas").ReportsApi;
  yearEnd: import("./src/common/years/yearSchemas").YearEndApi;
  exports: import("./src/common/reports/exportSchemas").ExportsApi;
  accountTemplates: import("./src/common/templates/accountTemplateSchemas").AccountTemplatesApi;
}
