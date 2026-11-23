import { clientIdSchema } from "../../common/clients/clientSchemas";
import {
  reportOptionsSchema,
  type BalanceSheet,
  type GeneralLedger,
  type IncomeStatement,
  type ReportOptions,
  type TrialBalance,
} from "../../common/reports/reportSchemas";
import {
  buildBalanceSheet,
  buildGeneralLedger,
  buildIncomeStatement,
  buildTrialBalance,
} from "../reports/reportBuilders";
import type { ReportRepository } from "../repositories/ReportRepository";

/** Gives the report repository for one client. */
export type ReportRepositoryProvider = (clientId: string) => ReportRepository;

/**
 * The core reports (FR-29) for any date range (FR-30), all computed from
 * posted journal lines at the moment they are asked for (FR-23, FR-31).
 */
export class ReportService {
  /**
   * @param reportsFor Returns the report repository for a client.
   */
  public constructor(private readonly reportsFor: ReportRepositoryProvider) {}

  /**
   * Trial balance for the range.
   * @param clientId The client.
   * @param options Dates and options.
   */
  public trialBalance(clientId: string, options: ReportOptions): TrialBalance {
    const { query, range } = this.prepare(options);
    return buildTrialBalance(range, this.repo(clientId).balances(query));
  }

  /**
   * General ledger for the range, for every account or just one.
   * @param clientId The client.
   * @param options Dates, options and optional account.
   */
  public generalLedger(clientId: string, options: ReportOptions): GeneralLedger {
    const { query, range, accountId } = this.prepare(options);
    const repo = this.repo(clientId);
    return buildGeneralLedger(range, repo.balances(query), repo.ledgerLines(query, accountId), accountId);
  }

  /**
   * Income statement for the range.
   * @param clientId The client.
   * @param options Dates and options.
   */
  public incomeStatement(clientId: string, options: ReportOptions): IncomeStatement {
    // Closing entries would zero revenue and expenses, so they never count here.
    const { query, range } = this.prepare({ ...options, includeClosingEntries: false });
    return buildIncomeStatement(range, this.repo(clientId).balances(query));
  }

  /**
   * Balance sheet as at the end of the range.
   * @param clientId The client.
   * @param options Dates and options.
   */
  public balanceSheet(clientId: string, options: ReportOptions): BalanceSheet {
    const { query, range } = this.prepare(options);
    return buildBalanceSheet(range, this.repo(clientId).balances(query));
  }

  private prepare(options: ReportOptions) {
    const valid = reportOptionsSchema.parse(options);
    return {
      query: { from: valid.from, to: valid.to, includeClosingEntries: valid.includeClosingEntries },
      range: { from: valid.from, to: valid.to },
      accountId: valid.accountId,
    };
  }

  private repo(clientId: string): ReportRepository {
    return this.reportsFor(clientIdSchema.parse(clientId));
  }
}
