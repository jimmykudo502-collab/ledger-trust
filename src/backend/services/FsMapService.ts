import { accountIdSchema, type Account } from "../../common/accounts/accountSchemas";
import { clientIdSchema } from "../../common/clients/clientSchemas";
import {
  canMap,
  compareFsLines,
  FS_MAP_LABELS,
  FS_SECTION_INFO,
  fsLineIdSchema,
  fsLineInputSchema,
  fsMapSchema,
  type FsLine,
  type FsLineInput,
  type FsMap,
  type FsMapOverview,
  type StarterLinesResult,
} from "../../common/fsMaps/fsMapSchemas";
import type { TransactionRunner } from "../db/TransactionRunner";
import { UserFacingError } from "../errors";
import { STARTER_LINES } from "../fsMaps/starterLines";
import type { FsMapRepository } from "../repositories/FsMapRepository";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";

/** Gives the FS map repository for one client. */
export type FsMapRepositoryProvider = (clientId: string) => FsMapRepository;

/**
 * Manages each client's internal and external FS maps (FR-33 to FR-35):
 * numbered FS lines, and which line each account rolls up into on each map.
 * Only balance sheet accounts go on balance sheet lines and only revenue and
 * expense accounts on income statement lines, so mapped statements balance.
 */
export class FsMapService {
  /**
   * @param fsMapsFor Returns the FS map repository for a client.
   * @param chartOfAccounts Looks up accounts.
   * @param inTransaction Runs several writes as one.
   */
  public constructor(
    private readonly fsMapsFor: FsMapRepositoryProvider,
    private readonly chartOfAccounts: ChartOfAccountsService,
    private readonly inTransaction: TransactionRunner,
  ) {}

  /**
   * Every line of both maps (sorted by section and number) and every
   * account's assignment.
   * @param clientId The client.
   */
  public overview(clientId: string): FsMapOverview {
    const repo = this.repo(clientId);
    return { lines: repo.listLines().sort(compareFsLines), assignments: repo.assignments() };
  }

  /**
   * Adds a line to a map.
   * @param clientId The client.
   * @param map Internal or external.
   * @param input Map number, name and section.
   * @throws UserFacingError if the number is already used on that map.
   */
  public createLine(clientId: string, map: FsMap, input: FsLineInput): FsLine {
    const repo = this.repo(clientId);
    const validMap = fsMapSchema.parse(map);
    const line = fsLineInputSchema.parse(input);
    this.assertCodeFree(repo, validMap, line.code);
    return repo.insertLine(validMap, line);
  }

  /**
   * Changes a line's number, name or section. A line can only move to the
   * other statement if none of its accounts would be on the wrong one.
   * @param clientId The client.
   * @param lineId The line.
   * @param input The new number, name and section.
   */
  public updateLine(clientId: string, lineId: number, input: FsLineInput): FsLine {
    const repo = this.repo(clientId);
    const existing = this.requireLine(repo, lineId);
    const line = fsLineInputSchema.parse(input);
    if (line.code !== existing.code) this.assertCodeFree(repo, existing.map, line.code);
    if (line.section !== existing.section) {
      const misfit = repo
        .accountsOnLine(existing.id)
        .map((accountId) => this.chartOfAccounts.find(clientId, accountId))
        .find((account) => account !== undefined && !canMap(account.type, line.section));
      if (misfit) {
        throw new UserFacingError(
          `${misfit.code} ${misfit.name} is mapped to this line and can't go under ${FS_SECTION_INFO[line.section].label}. Move it to another line first.`,
        );
      }
    }
    return repo.updateLine(existing.id, line);
  }

  /**
   * Deletes a line. Accounts mapped to it become unmapped on that map.
   * @param clientId The client.
   * @param lineId The line.
   */
  public deleteLine(clientId: string, lineId: number): void {
    const repo = this.repo(clientId);
    repo.deleteLine(this.requireLine(repo, lineId).id);
  }

  /**
   * Maps accounts to a line on a map, or unmaps them. All or nothing: if any
   * account can't go on the line, nothing changes.
   * @param clientId The client.
   * @param map Internal or external.
   * @param accountIds The accounts.
   * @param lineId The line, or null to unmap.
   */
  public assign(clientId: string, map: FsMap, accountIds: readonly number[], lineId: number | null): void {
    const repo = this.repo(clientId);
    const validMap = fsMapSchema.parse(map);
    const line = lineId === null ? null : this.requireLine(repo, lineId);
    if (line && line.map !== validMap) {
      throw new UserFacingError(`${line.code} ${line.name} is not on the ${FS_MAP_LABELS[validMap].toLowerCase()} map.`);
    }
    const accounts = accountIds.map((id) => this.requireAccount(clientId, id));
    if (line) {
      const misfit = accounts.find((account) => !canMap(account.type, line.section));
      if (misfit) {
        throw new UserFacingError(
          `${misfit.code} ${misfit.name} can't be mapped to ${line.code} ${line.name}: it belongs on the ${
            FS_SECTION_INFO[line.section].statement === "balanceSheet" ? "income statement" : "balance sheet"
          }.`,
        );
      }
    }
    this.inTransaction(clientId, () => {
      for (const account of accounts) repo.assign(account.id, validMap, line?.id ?? null);
    });
  }

  /**
   * Adds the standard starter lines to a map (FR-35), skipping any number
   * the map already uses, so running it twice adds nothing the second time.
   * @param clientId The client.
   * @param map Internal or external.
   */
  public addStarterLines(clientId: string, map: FsMap): StarterLinesResult {
    const repo = this.repo(clientId);
    const validMap = fsMapSchema.parse(map);
    return this.inTransaction(clientId, () => {
      let added = 0;
      for (const line of STARTER_LINES[validMap]) {
        if (repo.findLineByCode(validMap, line.code)) continue;
        repo.insertLine(validMap, line);
        added += 1;
      }
      return { added, skipped: STARTER_LINES[validMap].length - added };
    });
  }

  /**
   * Finds a line by its map number.
   * @param clientId The client.
   * @param map Internal or external.
   * @param code The map number.
   */
  public findLineByCode(clientId: string, map: FsMap, code: string): FsLine | undefined {
    return this.repo(clientId).findLineByCode(fsMapSchema.parse(map), code.trim());
  }

  private repo(clientId: string): FsMapRepository {
    return this.fsMapsFor(clientIdSchema.parse(clientId));
  }

  private requireLine(repo: FsMapRepository, lineId: number): FsLine {
    const line = repo.findLine(fsLineIdSchema.parse(lineId));
    if (!line) throw new UserFacingError("That FS line no longer exists.");
    return line;
  }

  private requireAccount(clientId: string, accountId: number): Account {
    const account = this.chartOfAccounts.find(clientId, accountIdSchema.parse(accountId));
    if (!account) throw new UserFacingError("That account no longer exists.");
    return account;
  }

  private assertCodeFree(repo: FsMapRepository, map: FsMap, code: string): void {
    const clash = repo.findLineByCode(map, code);
    if (clash) {
      throw new UserFacingError(`Map number ${code} is already used on the ${FS_MAP_LABELS[map].toLowerCase()} map by "${clash.name}".`);
    }
  }
}
