import { clientIdSchema } from "../../common/clients/clientSchemas";
import type { StagedTransaction } from "../../common/staging/stagingSchemas";
import type {
  MatchResult,
  TransferPairView,
  TransferReview,
  TransferRow,
} from "../../common/transfers/transferSchemas";
import type { TransactionRunner } from "../db/TransactionRunner";
import { UserFacingError } from "../errors";
import { daysBetween, findTransferPairs, type TransferPair } from "../posting/transferMatching";
import type { TransferMatchRepository } from "../repositories/TransferMatchRepository";
import type { BankAccountService } from "./BankAccountService";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";
import type { StagingRepositoryProvider } from "./ImportService";
import type { JournalService } from "./JournalService";

/** Gives the transfer match repository for one client. */
export type TransferMatchRepositoryProvider = (clientId: string) => TransferMatchRepository;

/** Matches transfers automatically, e.g. right after an import. */
export interface TransferAutoMatcher {
  /**
   * Confirms the transfers that have exactly one possible partner.
   * @param clientId The client.
   * @returns How many transfers were matched.
   */
  autoMatch(clientId: string): number;
}

interface ClientRows {
  readonly rows: TransferRow[];
  readonly byId: Map<number, TransferRow & { offsetAccountId: number | null }>;
}

/**
 * Transfers between a client's own accounts (FR-19, FR-20). Both sides of a
 * transfer are coded to Bank Transfer Control, so once both are posted the
 * control account nets to zero. Rows posted to other accounts are never
 * touched.
 */
export class TransferService implements TransferAutoMatcher {
  /**
   * @param stagingFor Returns the staging repository for a client.
   * @param matchesFor Returns the transfer match repository for a client.
   * @param bankAccounts Lists the client's tabs.
   * @param chartOfAccounts Finds Bank Transfer Control.
   * @param journal Computes the control account's posted balance.
   * @param inTransaction Runs work in one client database transaction.
   */
  public constructor(
    private readonly stagingFor: StagingRepositoryProvider,
    private readonly matchesFor: TransferMatchRepositoryProvider,
    private readonly bankAccounts: BankAccountService,
    private readonly chartOfAccounts: ChartOfAccountsService,
    private readonly journal: JournalService,
    private readonly inTransaction: TransactionRunner,
  ) {}

  /**
   * Everything the review screen shows (FR-20): the control account's posted
   * balance, suggested pairs, confirmed pairs and unmatched control items.
   * @param clientId The client.
   */
  public review(clientId: string): TransferReview {
    const control = this.control(clientId);
    const { byId } = this.loadRows(clientId);
    const matches = this.matchesFor(clientIdSchema.parse(clientId)).list();
    const inMatch = new Set(matches.flatMap((m) => [m.firstRowId, m.secondRowId]));

    const matched = matches
      .filter((m) => byId.has(m.firstRowId) && byId.has(m.secondRowId))
      .map((m) => toView(m.id, byId.get(m.firstRowId), byId.get(m.secondRowId)));
    const unmatched = [...byId.values()]
      .filter((row) => row.offsetAccountId === control.id && !inMatch.has(row.rowId))
      .map(stripCode);
    const suggestions = this.pairs(clientId).suggested.map((pair) =>
      toView(null, byId.get(pair.first.id), byId.get(pair.second.id)),
    );

    return {
      controlAccount: { id: control.id, code: control.code, name: control.name },
      postedBalanceCents: this.journal.accountBalance(clientId, control.id),
      suggestions,
      unmatched,
      matched,
    };
  }

  /** @inheritdoc */
  public autoMatch(clientId: string): number {
    const { certain } = this.pairs(clientId);
    this.inTransaction(clientId, () => {
      for (const pair of certain) this.confirm(clientId, pair.first.id, pair.second.id);
    });
    return certain.length;
  }

  /**
   * Confirms every suggested pair.
   * @param clientId The client.
   */
  public matchAll(clientId: string): MatchResult {
    const { suggested } = this.pairs(clientId);
    this.inTransaction(clientId, () => {
      for (const pair of suggested) this.confirm(clientId, pair.first.id, pair.second.id);
    });
    return { matchedCount: suggested.length };
  }

  /**
   * Confirms two rows as one transfer, e.g. a suggestion or two unmatched
   * items picked by hand. Both must be from different tabs with the same
   * amount in opposite directions, and not posted to another account.
   * @param clientId The client.
   * @param firstRowId One side.
   * @param secondRowId The other side.
   */
  public match(clientId: string, firstRowId: number, secondRowId: number): void {
    this.inTransaction(clientId, () => this.confirm(clientId, firstRowId, secondRowId));
  }

  /**
   * Undoes a confirmed transfer. Unposted sides go back to needing a code;
   * posted sides stay posted to Bank Transfer Control and show as unmatched.
   * @param clientId The client.
   * @param matchId The confirmed transfer.
   */
  public unmatch(clientId: string, matchId: number): void {
    const matches = this.matchesFor(clientIdSchema.parse(clientId));
    const match = matches.find(matchId);
    if (!match) {
      throw new UserFacingError("That transfer match no longer exists.");
    }
    const control = this.control(clientId);
    const staging = this.stagingFor(clientId);
    this.inTransaction(clientId, () => {
      matches.delete(matchId);
      for (const row of staging.findRows([match.firstRowId, match.secondRowId])) {
        if (row.status === "staged" && row.offsetAccountId === control.id) {
          staging.setOffsetAccount([row.id], null);
        }
      }
    });
  }

  /**
   * Says an unmatched control item isn't a transfer: its code is cleared so
   * it can be coded properly.
   * @param clientId The client.
   * @param rowId The row.
   */
  public notTransfer(clientId: string, rowId: number): void {
    const control = this.control(clientId);
    const staging = this.stagingFor(clientIdSchema.parse(clientId));
    const [row] = staging.findRows([rowId]);
    if (!row || row.offsetAccountId !== control.id) {
      throw new UserFacingError("That row isn't coded to Bank Transfer Control.");
    }
    if (this.matchedRowIds(clientId).has(rowId)) {
      throw new UserFacingError("That row is part of a matched transfer. Unmatch it first.");
    }
    if (row.status === "posted") {
      throw new UserFacingError("That row is posted. Unpost it on its tab first, then recode it.");
    }
    staging.setOffsetAccount([rowId], null);
  }

  private confirm(clientId: string, firstRowId: number, secondRowId: number): void {
    const control = this.control(clientId);
    const staging = this.stagingFor(clientIdSchema.parse(clientId));
    const rows = staging.findRows([firstRowId, secondRowId]);
    if (rows.length !== 2 || firstRowId === secondRowId) {
      throw new UserFacingError("Choose two different rows that still exist.");
    }
    const [a, b] = rows;
    if (a.bankAccountId === b.bankAccountId) {
      throw new UserFacingError("Both sides of a transfer can't be in the same tab.");
    }
    if (a.amountCents !== -b.amountCents) {
      throw new UserFacingError("The two sides of a transfer must be the same amount, one in and one out.");
    }
    const matched = this.matchedRowIds(clientId);
    if (matched.has(a.id) || matched.has(b.id)) {
      throw new UserFacingError("One of those rows is already part of a matched transfer.");
    }
    for (const row of rows) {
      if (row.status === "posted" && row.offsetAccountId !== control.id) {
        throw new UserFacingError(
          `"${row.description}" is already posted to another account. Unpost it first if it's really a transfer.`,
        );
      }
    }
    const toCode = rows.filter((row) => row.status === "staged" && row.offsetAccountId !== control.id).map((row) => row.id);
    if (toCode.length > 0) staging.setOffsetAccount(toCode, control.id);
    const [first, second] = a.amountCents < 0 ? [a, b] : [b, a];
    this.matchesFor(clientId).insert(first.id, second.id);
  }

  /** Rows that could be one side of a not-yet-confirmed transfer. */
  private pairs(clientId: string): { certain: TransferPair[]; suggested: TransferPair[] } {
    const control = this.control(clientId);
    const { byId } = this.loadRows(clientId);
    const matched = this.matchedRowIds(clientId);
    const candidates = [...byId.values()]
      .filter(
        (row) =>
          !matched.has(row.rowId) &&
          ((row.status === "staged" && row.offsetAccountId === null) || row.offsetAccountId === control.id),
      )
      .map((row) => ({ id: row.rowId, bankAccountId: row.bankAccountId, date: row.date, amountCents: row.amountCents }));
    return findTransferPairs(candidates);
  }

  private matchedRowIds(clientId: string): Set<number> {
    return new Set(this.matchesFor(clientIdSchema.parse(clientId)).list().flatMap((m) => [m.firstRowId, m.secondRowId]));
  }

  private loadRows(clientId: string): ClientRows {
    const staging = this.stagingFor(clientIdSchema.parse(clientId));
    const byId = new Map<number, TransferRow & { offsetAccountId: number | null }>();
    for (const tab of this.bankAccounts.list(clientId)) {
      for (const row of staging.listRows(tab.id)) {
        byId.set(row.id, toTransferRow(row, tab.id, tab.name));
      }
    }
    return { rows: [...byId.values()].map(stripCode), byId };
  }

  private control(clientId: string) {
    return this.chartOfAccounts.systemAccount(clientId, "bank_transfer_control");
  }
}

const toTransferRow = (row: StagedTransaction, bankAccountId: number, bankAccountName: string) => ({
  rowId: row.id,
  bankAccountId,
  bankAccountName,
  date: row.date,
  description: row.description,
  amountCents: row.amountCents,
  status: row.status,
  offsetAccountId: row.offsetAccountId,
});

const stripCode = (row: TransferRow): TransferRow => ({
  rowId: row.rowId,
  bankAccountId: row.bankAccountId,
  bankAccountName: row.bankAccountName,
  date: row.date,
  description: row.description,
  amountCents: row.amountCents,
  status: row.status,
});

const toView = (matchId: number | null, a: TransferRow, b: TransferRow): TransferPairView => {
  const [from, to] = a.amountCents < 0 ? [a, b] : [b, a];
  return { matchId, from: stripCode(from), to: stripCode(to), daysApart: daysBetween(a.date, b.date) };
};
