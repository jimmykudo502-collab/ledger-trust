import { clientIdSchema } from "../../common/clients/clientSchemas";
import {
  balanceProblem,
  journalEntryInputSchema,
  type JournalEntryInput,
  type JournalEntryView,
  type JournalSource,
} from "../../common/journal/journalSchemas";
import { UserFacingError } from "../errors";
import type { JournalRepository } from "../repositories/JournalRepository";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";

/** Gives the journal repository for one client. */
export type JournalRepositoryProvider = (clientId: string) => JournalRepository;

/**
 * Stops changes to entries dated in a locked fiscal year (FR-27).
 */
export interface PeriodGuard {
  /**
   * @param clientId The client.
   * @param date The entry date being written or removed.
   * @throws UserFacingError if the date falls in a locked fiscal year.
   */
  assertOpen(clientId: string, date: string): void;
}

/** A guard for when no periods are locked. */
const ALL_OPEN: PeriodGuard = { assertOpen: () => undefined };

/**
 * The only way entries reach the journal. Every entry is checked here, in
 * the backend, before it is stored (FR-21, FR-24): at least two one-sided
 * lines, total debits equal to total credits, every account real, and its
 * date in an open period (FR-27).
 */
export class JournalService {
  private periodGuard: PeriodGuard;

  /**
   * @param journalFor Returns the journal repository for a client.
   * @param chartOfAccounts Confirms the lines' accounts exist.
   * @param periodGuard Refuses writes to locked fiscal years.
   */
  public constructor(
    private readonly journalFor: JournalRepositoryProvider,
    private readonly chartOfAccounts: ChartOfAccountsService,
    periodGuard: PeriodGuard = ALL_OPEN,
  ) {
    this.periodGuard = periodGuard;
  }

  /**
   * Installs the period guard (used when the guard itself needs this service).
   * @param guard The guard to use from now on.
   */
  public usePeriodGuard(guard: PeriodGuard): void {
    this.periodGuard = guard;
  }

  /**
   * Validates and stores a journal entry.
   * @param clientId The client.
   * @param entry The entry to post.
   * @returns The new entry's id.
   * @throws UserFacingError if the entry doesn't balance, uses an unknown
   *   account, or is dated in a locked year.
   */
  public post(clientId: string, entry: JournalEntryInput): number {
    const valid = this.validate(clientId, entry);
    this.periodGuard.assertOpen(clientId, valid.date);
    return this.repo(clientId).insert(valid);
  }

  /**
   * Validates and stores an entry without the period check. Only for the
   * year-end close, which posts into the year it is about to lock.
   * @param clientId The client.
   * @param entry The closing entry.
   */
  public postClosingEntry(clientId: string, entry: JournalEntryInput): number {
    return this.repo(clientId).insert(this.validate(clientId, entry));
  }

  /**
   * Replaces an entry's date, description and lines (FR-26). Both the old
   * and new dates must be in open periods.
   * @param clientId The client.
   * @param entryId The entry.
   * @param entry The new content; its source must match the original.
   */
  public replace(clientId: string, entryId: number, entry: JournalEntryInput): void {
    const existing = this.require(clientId, entryId);
    const valid = this.validate(clientId, entry);
    this.periodGuard.assertOpen(clientId, existing.date);
    this.periodGuard.assertOpen(clientId, valid.date);
    this.repo(clientId).replace(entryId, valid);
  }

  /**
   * Removes an entry and its lines (allowed while its period is open, FR-26).
   * @param clientId The client.
   * @param entryId The entry.
   */
  public delete(clientId: string, entryId: number): void {
    const existing = this.require(clientId, entryId);
    this.periodGuard.assertOpen(clientId, existing.date);
    this.repo(clientId).delete(entryId);
  }

  /**
   * Removes the year-end closing entry when a year is reopened. Skips the
   * period check because the year is being unlocked.
   * @param clientId The client.
   * @param entryId The closing entry.
   */
  public deleteClosingEntry(clientId: string, entryId: number): void {
    this.repo(clientId).delete(entryId);
  }

  /**
   * Entries from the given sources with their lines, newest first.
   * @param clientId The client.
   * @param sources Which kinds of entry to include.
   */
  public list(clientId: string, sources: readonly JournalSource[]): JournalEntryView[] {
    return this.repo(clientId).listEntries(sources);
  }

  /**
   * One entry with its lines.
   * @param clientId The client.
   * @param entryId The entry.
   * @throws UserFacingError if it doesn't exist.
   */
  public require(clientId: string, entryId: number): JournalEntryView {
    const entry = this.repo(clientId).findEntry(entryId);
    if (!entry) {
      throw new UserFacingError("That journal entry no longer exists.");
    }
    return entry;
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

  private validate(clientId: string, entry: JournalEntryInput): JournalEntryInput {
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
    return valid;
  }

  private repo(clientId: string): JournalRepository {
    return this.journalFor(clientIdSchema.parse(clientId));
  }
}
