import { clientIdSchema } from "../../common/clients/clientSchemas";
import { formatLongDate } from "../../common/dates";
import {
  fiscalYearContaining,
  fiscalYearEndingIn,
  localToday,
  type FiscalYear,
} from "../../common/fiscalYears";
import type { JournalLineInput } from "../../common/journal/journalSchemas";
import type { FiscalYearView, YearEndOverview, YearStatus } from "../../common/years/yearSchemas";
import type { TransactionRunner } from "../db/TransactionRunner";
import { UserFacingError } from "../errors";
import type { ClientRepository } from "../repositories/ClientRepository";
import type { FiscalYearRepository, StoredFiscalYear } from "../repositories/FiscalYearRepository";
import type { ReportRepository } from "../repositories/ReportRepository";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";
import type { JournalService, PeriodGuard } from "./JournalService";

/** Gives a per-client repository. */
type Provider<T> = (clientId: string) => T;

const RETAINED_EARNINGS_SETTING = "retained_earnings_account_id";

/**
 * Fiscal years, period locks, year-end close and roll-forward (FR-26 to
 * FR-28). Also the journal's period guard: nothing dated in a locked year
 * can be posted, changed or removed; corrections go through reversing
 * entries in an open period, so the original stays visible (FR-27).
 *
 * Roll-forward needs no copying: balance sheet balances carry into the new
 * year automatically because every report is computed from the one
 * continuous journal (FR-31).
 */
export class FiscalYearService implements PeriodGuard {
  /**
   * @param yearsFor Returns the fiscal year repository for a client.
   * @param reportsFor Returns the report repository (for closing balances).
   * @param clients Looks up each client's fiscal year-end.
   * @param journal Posts and removes closing and reversing entries.
   * @param chartOfAccounts Checks the retained earnings account.
   * @param inTransaction Runs work in one client database transaction.
   * @param today Today's date (injectable for tests).
   */
  public constructor(
    private readonly yearsFor: Provider<FiscalYearRepository>,
    private readonly reportsFor: Provider<ReportRepository>,
    private readonly clients: ClientRepository,
    private readonly journal: JournalService,
    private readonly chartOfAccounts: ChartOfAccountsService,
    private readonly inTransaction: TransactionRunner,
    private readonly today: () => string = localToday,
  ) {}

  /**
   * Every fiscal year from the first activity to the current year, with its
   * status (FR-26 to FR-28).
   * @param clientId The client.
   */
  public overview(clientId: string): YearEndOverview {
    const repo = this.repo(clientId);
    const setting = repo.getSetting(RETAINED_EARNINGS_SETTING);
    return {
      years: this.years(clientId).map((year) => this.view(repo, year)),
      retainedEarningsAccountId: setting === null ? null : Number(setting),
    };
  }

  /** @inheritdoc */
  public assertOpen(clientId: string, date: string): void {
    const locked = this.repo(clientId)
      .list()
      .find((year) => year.lockedAt !== null && year.from <= date && date <= year.to);
    if (locked) {
      throw new UserFacingError(
        `${formatLongDate(date)} is in FY ${locked.to.slice(0, 4)}, which is locked. Unlock that year, or post a reversing entry dated in an open period.`,
      );
    }
  }

  /**
   * Locks a fiscal year (FR-27).
   * @param clientId The client.
   * @param yearEnd The year's last day.
   */
  public lock(clientId: string, yearEnd: string): void {
    const year = this.requireYear(clientId, yearEnd);
    const repo = this.repo(clientId);
    const stored = repo.ensure(year.from, year.to);
    repo.setLocked(stored.id, true);
  }

  /**
   * Unlocks the most recently locked year. If it was closed, its closing entry
   * is removed, so it reopens and later years' opening balances update by
   * themselves (PRD open question 3).
   * @param clientId The client.
   * @param yearEnd The year's last day.
   */
  public unlock(clientId: string, yearEnd: string): void {
    const repo = this.repo(clientId);
    const stored = repo.findByEnd(yearEnd);
    if (!stored || stored.lockedAt === null) {
      throw new UserFacingError("That year isn't locked.");
    }
    const later = repo.list().find((year) => year.lockedAt !== null && year.to > yearEnd);
    if (later) {
      throw new UserFacingError(`Unlock FY ${later.to.slice(0, 4)} first; only the most recent locked year can be unlocked.`);
    }
    this.inTransaction(clientId, () => {
      // Clear the year's link to its closing entry before removing the entry.
      repo.setClosed(stored.id, null, false);
      repo.setLocked(stored.id, false);
      if (stored.closingEntryId !== null) {
        this.journal.deleteClosingEntry(clientId, stored.closingEntryId);
      }
    });
  }

  /**
   * Year-end close (FR-28): posts one entry dated on the year's last day that
   * brings every revenue and expense account to zero against retained
   * earnings, then locks the year.
   * @param clientId The client.
   * @param yearEnd The year's last day.
   * @param retainedEarningsAccountId An equity account to close into.
   */
  public close(clientId: string, yearEnd: string, retainedEarningsAccountId: number): void {
    const year = this.requireYear(clientId, yearEnd);
    const repo = this.repo(clientId);
    const existing = repo.findByEnd(year.to);
    if (existing?.closedAt) {
      throw new UserFacingError(`${year.label} is already closed.`);
    }
    const retained = this.chartOfAccounts.find(clientId, retainedEarningsAccountId);
    if (!retained || retained.type !== "equity") {
      throw new UserFacingError("Choose an equity account (such as Retained Earnings) to close the year into.");
    }
    const unposted = repo.countUnposted(year.from, year.to);
    if (unposted > 0) {
      throw new UserFacingError(
        `${unposted} bank row${unposted === 1 ? " is" : "s are"} dated in ${year.label} but not posted. Post or remove them before closing the year.`,
      );
    }
    const earlierOpen = this.years(clientId).find(
      (other) => other.to < year.from && repo.countEntries(other.from, other.to) > 0 && !repo.findByEnd(other.to)?.closedAt,
    );
    if (earlierOpen) {
      throw new UserFacingError(`Close ${earlierOpen.label} first.`);
    }

    const lines = this.closingLines(clientId, year, retained.id);
    this.inTransaction(clientId, () => {
      const stored = repo.ensure(year.from, year.to);
      const closingEntryId =
        lines.length === 0
          ? null
          : this.journal.postClosingEntry(clientId, {
              date: year.to,
              description: `Year-end close ${year.label}`,
              source: "year_end_close",
              lines,
            });
      repo.setClosed(stored.id, closingEntryId, true);
      repo.setLocked(stored.id, true);
      repo.setSetting(RETAINED_EARNINGS_SETTING, String(retained.id));
    });
  }

  /**
   * Posts a reversing entry (FR-27): the same lines with debits and credits
   * swapped, dated in an open period and linked to the original, which
   * stays visible in the ledger.
   * @param clientId The client.
   * @param entryId The entry to reverse.
   * @param date The reversal's date (must be in an open period).
   * @returns The reversing entry's id.
   */
  public reverse(clientId: string, entryId: number, date: string): number {
    const original = this.journal.require(clientId, entryId);
    if (original.source === "reversal" || original.source === "year_end_close") {
      throw new UserFacingError("Reversals and year-end closing entries can't be reversed.");
    }
    if (original.reversedByEntryId !== null) {
      throw new UserFacingError("This entry has already been reversed.");
    }
    return this.journal.post(clientId, {
      date,
      description: `Reversal of: ${original.description}`.slice(0, 500),
      source: "reversal",
      reversesEntryId: original.id,
      lines: original.lines.map((line) => ({
        accountId: line.accountId,
        debitCents: line.creditCents,
        creditCents: line.debitCents,
        memo: line.memo,
      })),
    });
  }

  /** Lines that zero revenue and expenses as at the year end, netted to retained earnings. */
  private closingLines(clientId: string, year: FiscalYear, retainedId: number): JournalLineInput[] {
    const balances = this.reportsFor(clientIdSchema.parse(clientId)).balances({
      from: year.from,
      to: year.to,
      includeClosingEntries: true,
    });
    const lines: JournalLineInput[] = [];
    let net = 0;
    for (const row of balances) {
      if ((row.type !== "revenue" && row.type !== "expense") || row.closingCents === 0) continue;
      net += row.closingCents;
      lines.push({
        accountId: row.accountId,
        debitCents: row.closingCents < 0 ? -row.closingCents : 0,
        creditCents: row.closingCents > 0 ? row.closingCents : 0,
      });
    }
    if (lines.length > 0 && net !== 0) {
      lines.push({ accountId: retainedId, debitCents: net > 0 ? net : 0, creditCents: net < 0 ? -net : 0 });
    }
    // Revenue and expense lines always come with their retained earnings
    // line (or net to zero between themselves), so the entry balances.
    return lines;
  }

  /** Fiscal years from the first activity (or today) to the latest. */
  private years(clientId: string): FiscalYear[] {
    const client = this.clients.find(clientIdSchema.parse(clientId));
    if (!client) throw new UserFacingError("That client no longer exists.");
    const repo = this.repo(clientId);
    const today = this.today();
    const activity = repo.activity();
    const first = fiscalYearContaining(client.fiscalYearEnd, activity.earliestDate && activity.earliestDate < today ? activity.earliestDate : today);
    const lastDate = activity.latestDate && activity.latestDate > today ? activity.latestDate : today;
    const last = fiscalYearContaining(client.fiscalYearEnd, lastDate);
    const stored = repo.list();
    const years: FiscalYear[] = [];
    for (let endYear = first.endYear; endYear <= last.endYear; endYear += 1) {
      const derived = fiscalYearEndingIn(client.fiscalYearEnd, endYear);
      const saved = stored.find((year) => year.to.slice(0, 4) === String(endYear));
      years.push(saved ? { ...derived, from: saved.from, to: saved.to } : derived);
    }
    return years.reverse();
  }

  private requireYear(clientId: string, yearEnd: string): FiscalYear {
    const year = this.years(clientId).find((candidate) => candidate.to === yearEnd);
    if (!year) {
      throw new UserFacingError("That fiscal year doesn't exist for this client.");
    }
    return year;
  }

  private view(repo: FiscalYearRepository, year: FiscalYear): FiscalYearView {
    const stored: StoredFiscalYear | undefined = repo.findByEnd(year.to);
    const status: YearStatus = stored?.closedAt ? "closed" : stored?.lockedAt ? "locked" : "open";
    return {
      label: year.label,
      from: year.from,
      to: year.to,
      status,
      closingEntryId: stored?.closingEntryId ?? null,
      unpostedRows: repo.countUnposted(year.from, year.to),
      postedEntries: repo.countEntries(year.from, year.to),
    };
  }

  private repo(clientId: string): FiscalYearRepository {
    return this.yearsFor(clientIdSchema.parse(clientId));
  }
}
