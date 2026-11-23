import { clientIdSchema } from "../../common/clients/clientSchemas";
import {
  balanceProblem,
  journalEntryInputSchema,
  type JournalEntryInput,
} from "../../common/journal/journalSchemas";
import { UserFacingError } from "../errors";
import type { JournalRepository } from "../repositories/JournalRepository";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";

/** Gives the journal repository for one client. */
export type JournalRepositoryProvider = (clientId: string) => JournalRepository;

/**
 * The only way entries reach the journal. Every entry is checked here, in
 * the backend, before it is stored (FR-21, FR-24): at least two one-sided
 * lines, total debits equal to total credits, and every account real.
 */
export class JournalService {
  /**
   * @param journalFor Returns the journal repository for a client.
   * @param chartOfAccounts Confirms the lines' accounts exist.
   */
  public constructor(
    private readonly journalFor: JournalRepositoryProvider,
    private readonly chartOfAccounts: ChartOfAccountsService,
  ) {}

  /**
   * Validates and stores a journal entry.
   * @param clientId The client.
   * @param entry The entry to post.
   * @returns The new entry's id.
   * @throws UserFacingError if the entry doesn't balance or uses an unknown account.
   */
  public post(clientId: string, entry: JournalEntryInput): number {
    const valid = journalEntryInputSchema.parse(entry);
    const problem = balanceProblem(valid.lines);
    if (problem) {
      throw new UserFacingError(`This entry doesn't balance. ${problem}`);
    }
    for (const line of valid.lines) {
      if (!this.chartOfAccounts.find(clientId, line.accountId)) {
        throw new UserFacingError("An entry line uses an account that no longer exists.");
      }
    }
    return this.repo(clientId).insert(valid);
  }

  /**
   * Removes an entry and its lines (allowed while its period is open, FR-26).
   * @param clientId The client.
   * @param entryId The entry.
   */
  public delete(clientId: string, entryId: number): void {
    this.repo(clientId).delete(entryId);
  }

  /**
   * The entry posted from a staged bank row, if any.
   * @param clientId The client.
   * @param stagedTransactionId The staged row.
   */
  public findByStagedTransaction(clientId: string, stagedTransactionId: number): number | undefined {
    return this.repo(clientId).findByStagedTransaction(stagedTransactionId);
  }

  /**
   * An account's balance computed from posted lines (FR-31): debits minus
   * credits, in cents.
   * @param clientId The client.
   * @param accountId The account.
   */
  public accountBalance(clientId: string, accountId: number): number {
    return this.repo(clientId).accountBalance(accountId);
  }

  private repo(clientId: string): JournalRepository {
    return this.journalFor(clientIdSchema.parse(clientId));
  }
}
