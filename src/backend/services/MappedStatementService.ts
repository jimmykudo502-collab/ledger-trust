import { clientIdSchema } from "../../common/clients/clientSchemas";
import { fsMapSchema, type FsMap } from "../../common/fsMaps/fsMapSchemas";
import type { FsTrialBalance, MappedBalanceSheet, MappedIncomeStatement } from "../../common/reports/mappedStatementSchemas";
import { reportOptionsSchema, type ReportOptions } from "../../common/reports/reportSchemas";
import { buildFsTrialBalance, buildMappedBalanceSheet, buildMappedIncomeStatement, type FsMapping } from "../reports/mappedStatements";
import type { FsMapRepositoryProvider } from "./FsMapService";
import type { ReportRepositoryProvider } from "./ReportService";

/**
 * The balance sheet and income statement rolled up by a client's internal or
 * external FS map (FR-36). Computed from posted journal lines when asked for,
 * exactly like the account-by-account statements (FR-31).
 */
export class MappedStatementService {
  /**
   * @param reportsFor Returns the report repository for a client.
   * @param fsMapsFor Returns the FS map repository for a client.
   */
  public constructor(
    private readonly reportsFor: ReportRepositoryProvider,
    private readonly fsMapsFor: FsMapRepositoryProvider,
  ) {}

  /**
   * Balance sheet as at the end of the range, by FS line.
   * @param clientId The client.
   * @param options Dates and options.
   * @param map Internal or external.
   */
  public balanceSheet(clientId: string, options: ReportOptions, map: FsMap): MappedBalanceSheet {
    const valid = reportOptionsSchema.parse(options);
    const id = clientIdSchema.parse(clientId);
    const balances = this.reportsFor(id).balances({
      from: valid.from,
      to: valid.to,
      includeClosingEntries: valid.includeClosingEntries,
    });
    return buildMappedBalanceSheet({ from: valid.from, to: valid.to }, balances, this.mapping(id, map));
  }

  /**
   * Income statement for the range, by FS line. Closing entries never count.
   * @param clientId The client.
   * @param options Dates and options.
   * @param map Internal or external.
   */
  public incomeStatement(clientId: string, options: ReportOptions, map: FsMap): MappedIncomeStatement {
    const valid = reportOptionsSchema.parse(options);
    const id = clientIdSchema.parse(clientId);
    const balances = this.reportsFor(id).balances({ from: valid.from, to: valid.to, includeClosingEntries: false });
    return buildMappedIncomeStatement({ from: valid.from, to: valid.to }, balances, this.mapping(id, map));
  }

  /**
   * Trial balance grouped by FS line (FR-37), with the same closing balances
   * as the account-by-account trial balance.
   * @param clientId The client.
   * @param options Dates and options.
   * @param map Internal or external.
   */
  public trialBalance(clientId: string, options: ReportOptions, map: FsMap): FsTrialBalance {
    const valid = reportOptionsSchema.parse(options);
    const id = clientIdSchema.parse(clientId);
    const balances = this.reportsFor(id).balances({
      from: valid.from,
      to: valid.to,
      includeClosingEntries: valid.includeClosingEntries,
    });
    return buildFsTrialBalance({ from: valid.from, to: valid.to }, balances, this.mapping(id, map));
  }

  private mapping(clientId: string, map: FsMap): FsMapping {
    const validMap = fsMapSchema.parse(map);
    const repo = this.fsMapsFor(clientId);
    const lineOfAccount = new Map<number, number>();
    for (const assignment of repo.assignments()) {
      const lineId = assignment[validMap];
      if (lineId !== null) lineOfAccount.set(assignment.accountId, lineId);
    }
    return { map: validMap, lines: repo.listLines().filter((line) => line.map === validMap), lineOfAccount };
  }
}
