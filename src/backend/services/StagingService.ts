import { clientIdSchema } from "../../common/clients/clientSchemas";
import type { ImportBatch } from "../../common/staging/stagingSchemas";
import { UserFacingError } from "../errors";
import type { BankAccountService } from "./BankAccountService";
import type { StagingRepositoryProvider } from "./ImportService";

/**
 * Shows and manages what is waiting in staging for each tab (FR-13).
 */
export class StagingService {
  /**
   * @param stagingFor Returns the staging repository for a client.
   * @param bankAccounts Checks that the tab exists.
   */
  public constructor(
    private readonly stagingFor: StagingRepositoryProvider,
    private readonly bankAccounts: BankAccountService,
  ) {}

  /**
   * A tab's imports with their rows, newest first.
   * @param clientId The client.
   * @param bankAccountId The tab.
   */
  public list(clientId: string, bankAccountId: number): ImportBatch[] {
    this.bankAccounts.require(clientId, bankAccountId);
    return this.stagingFor(clientIdSchema.parse(clientId)).listBatches(bankAccountId);
  }

  /**
   * Removes an import, e.g. one brought in with the wrong columns. Not
   * allowed once any of its rows have been posted.
   * @param clientId The client.
   * @param batchId The import batch.
   */
  public removeBatch(clientId: string, batchId: number): void {
    const staging = this.stagingFor(clientIdSchema.parse(clientId));
    const batch = staging.findBatch(batchId);
    if (!batch) {
      throw new UserFacingError("That import no longer exists.");
    }
    if (batch.postedCount > 0) {
      throw new UserFacingError(
        `${batch.postedCount} row${batch.postedCount === 1 ? " has" : "s have"} already been posted from this import, so it can't be removed.`,
      );
    }
    staging.deleteBatch(batchId);
  }
}
