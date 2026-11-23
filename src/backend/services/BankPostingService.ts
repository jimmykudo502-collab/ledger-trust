import { clientIdSchema } from "../../common/clients/clientSchemas";
import type { PostResult } from "../../common/staging/stagingSchemas";
import type { TransactionRunner } from "../db/TransactionRunner";
import { UserFacingError } from "../errors";
import { bankEntryLines } from "../posting/bankEntry";
import type { BankAccountService } from "./BankAccountService";
import type { StagingRepositoryProvider } from "./ImportService";
import type { JournalService } from "./JournalService";

/**
 * Posts coded bank rows to the journal (FR-21 to FR-23) and takes them back
 * out again while their period is open (FR-26).
 */
export class BankPostingService {
  /**
   * @param stagingFor Returns the staging repository for a client.
   * @param bankAccounts Resolves the tab and its ledger account.
   * @param journal Validates and stores the entries.
   * @param inTransaction Runs work in one client database transaction.
   */
  public constructor(
    private readonly stagingFor: StagingRepositoryProvider,
    private readonly bankAccounts: BankAccountService,
    private readonly journal: JournalService,
    private readonly inTransaction: TransactionRunner,
  ) {}

  /**
   * Posts every coded, unposted row in a tab: one balanced two-line entry per
   * row, linked to its source row (FR-22). Uncoded rows stay in staging
   * (FR-17). All-or-nothing: if any entry fails, nothing is posted.
   * @param clientId The client.
   * @param bankAccountId The tab.
   * @throws UserFacingError if no row is coded.
   */
  public post(clientId: string, bankAccountId: number): PostResult {
    const bankAccount = this.bankAccounts.require(clientId, bankAccountId);
    const staging = this.stagingFor(clientIdSchema.parse(clientId));
    const ready = staging
      .listRows(bankAccountId)
      .filter((row) => row.status === "staged" && row.offsetAccountId !== null);
    if (ready.length === 0) {
      throw new UserFacingError("There are no coded rows to post. Enter an account code on each row first.");
    }

    this.inTransaction(clientId, () => {
      for (const row of ready) {
        this.journal.post(clientId, {
          date: row.date,
          description: row.description,
          source: "bank_import",
          stagedTransactionId: row.id,
          lines: bankEntryLines(row.amountCents, bankAccount.accountId, row.offsetAccountId),
        });
        staging.setStatus(row.id, "posted");
      }
    });
    return { postedCount: ready.length };
  }

  /**
   * Takes a posted row back out of the journal and returns it to staging,
   * keeping its code, so it can be corrected and posted again.
   * @param clientId The client.
   * @param rowId The posted row.
   */
  public unpost(clientId: string, rowId: number): void {
    const staging = this.stagingFor(clientIdSchema.parse(clientId));
    const [row] = staging.findRows([rowId]);
    if (!row) {
      throw new UserFacingError("That row no longer exists.");
    }
    if (row.status !== "posted") {
      throw new UserFacingError("That row isn't posted.");
    }
    this.inTransaction(clientId, () => {
      const entryId = this.journal.findByStagedTransaction(clientId, rowId);
      if (entryId !== undefined) {
        this.journal.delete(clientId, entryId);
      }
      staging.setStatus(rowId, "staged");
    });
  }
}
