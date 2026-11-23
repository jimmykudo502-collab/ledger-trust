import { clientIdSchema } from "../../common/clients/clientSchemas";
import type { StagedTransaction } from "../../common/staging/stagingSchemas";
import { UserFacingError } from "../errors";
import type { StagedRowRecord } from "../repositories/StagingRepository";
import type { BankAccountService } from "./BankAccountService";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";
import type { StagingRepositoryProvider } from "./ImportService";

/**
 * Codes staged rows (FR-15): the code is the offsetting account, and the
 * tab's own account is always the other side.
 */
export class CodingService {
  /**
   * @param stagingFor Returns the staging repository for a client.
   * @param bankAccounts Resolves the tab.
   * @param chartOfAccounts Resolves codes to accounts.
   */
  public constructor(
    private readonly stagingFor: StagingRepositoryProvider,
    private readonly bankAccounts: BankAccountService,
    private readonly chartOfAccounts: ChartOfAccountsService,
  ) {}

  /**
   * A tab's rows across all imports, by date.
   * @param clientId The client.
   * @param bankAccountId The tab.
   */
  public rows(clientId: string, bankAccountId: number): StagedTransaction[] {
    this.bankAccounts.require(clientId, bankAccountId);
    return this.stagingFor(clientIdSchema.parse(clientId)).listRows(bankAccountId);
  }

  /**
   * Codes rows to the account with the given code, or clears their code.
   * Only unposted rows of this tab can be coded.
   * @param clientId The client.
   * @param bankAccountId The tab the rows belong to.
   * @param rowIds The rows to code.
   * @param code An existing account code, or null to clear.
   * @throws UserFacingError for unknown codes, the tab's own account, or posted rows.
   */
  public setCode(clientId: string, bankAccountId: number, rowIds: readonly number[], code: string | null): void {
    const bankAccount = this.bankAccounts.require(clientId, bankAccountId);
    const staging = this.stagingFor(clientIdSchema.parse(clientId));
    const rows = this.requireRows(staging.findRows(rowIds), rowIds, bankAccountId);
    if (rows.some((row) => row.status === "posted")) {
      throw new UserFacingError("Posted rows can't be recoded. Unpost the row first.");
    }

    if (code === null) {
      staging.setOffsetAccount(rowIds, null);
      return;
    }
    const account = this.chartOfAccounts.findByCode(clientId, code);
    if (!account) {
      throw new UserFacingError(`No account has code ${code.trim()}.`);
    }
    if (account.id === bankAccount.accountId) {
      throw new UserFacingError(
        `${account.code} ${account.name} is this tab's own account. Code the row to the other side of the transaction.`,
      );
    }
    staging.setOffsetAccount(rowIds, account.id);
  }

  private requireRows(rows: StagedRowRecord[], rowIds: readonly number[], bankAccountId: number): StagedRowRecord[] {
    if (rows.length !== new Set(rowIds).size || rows.some((row) => row.bankAccountId !== bankAccountId)) {
      throw new UserFacingError("Some of those rows no longer exist in this tab. Reload and try again.");
    }
    return rows;
  }
}
