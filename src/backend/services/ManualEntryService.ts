import {
  manualEntryInputSchema,
  type JournalEntryView,
  type ManualEntryInput,
} from "../../common/journal/journalSchemas";
import { UserFacingError } from "../errors";
import type { JournalService } from "./JournalService";

/**
 * Manual journal entries (FR-24, FR-25): corrections, non-cash
 * transactions, opening balances and adjustments. Debits must equal credits
 * before an entry can be posted; entries stay editable while their period
 * is open (FR-26).
 */
export class ManualEntryService {
  /**
   * @param journal Validates and stores entries.
   */
  public constructor(private readonly journal: JournalService) {}

  /**
   * Manual entries plus reversals and year-end closing entries (which are
   * read-only here), newest first.
   * @param clientId The client.
   */
  public list(clientId: string): JournalEntryView[] {
    return this.journal.list(clientId, ["manual", "opening_balance", "reversal", "year_end_close"]);
  }

  /**
   * Posts a new manual entry.
   * @param clientId The client.
   * @param input Date, description and two or more lines.
   */
  public create(clientId: string, input: ManualEntryInput): JournalEntryView {
    const entry = manualEntryInputSchema.parse(input);
    const id = this.journal.post(clientId, { ...entry, source: "manual" });
    return this.journal.require(clientId, id);
  }

  /**
   * Changes a manual entry.
   * @param clientId The client.
   * @param entryId The entry.
   * @param input The new date, description and lines.
   */
  public update(clientId: string, entryId: number, input: ManualEntryInput): JournalEntryView {
    this.requireManual(clientId, entryId);
    const entry = manualEntryInputSchema.parse(input);
    this.journal.replace(clientId, entryId, { ...entry, source: "manual" });
    return this.journal.require(clientId, entryId);
  }

  /**
   * Deletes a manual entry.
   * @param clientId The client.
   * @param entryId The entry.
   */
  public delete(clientId: string, entryId: number): void {
    this.requireManual(clientId, entryId);
    this.journal.delete(clientId, entryId);
  }

  private requireManual(clientId: string, entryId: number): JournalEntryView {
    const entry = this.journal.require(clientId, entryId);
    if (entry.source !== "manual") {
      throw new UserFacingError(
        entry.source === "bank_import"
          ? "This entry came from a bank import. Unpost it on its tab instead."
          : "Only manual entries can be changed here.",
      );
    }
    if (entry.reversedByEntryId !== null) {
      throw new UserFacingError("This entry has been reversed, so it can't be changed.");
    }
    return entry;
  }
}
