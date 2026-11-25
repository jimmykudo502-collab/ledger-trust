import { canMap, FS_MAPS, type FsLineInput, type FsMap } from "../../common/fsMaps/fsMapSchemas";
import type {
  AccountTemplate,
  AccountTemplateInfo,
  TemplateImportResult,
} from "../../common/templates/accountTemplateSchemas";
import { UserFacingError } from "../errors";
import type { TemplateStore } from "../templates/TemplateStore";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";
import type { FsMapService } from "./FsMapService";

const CODE_KEY: Record<FsMap, "internalFsCode" | "externalFsCode"> = {
  internal: "internalFsCode",
  external: "externalFsCode",
};

/**
 * Saves a client's chart of accounts (with its FS maps) as the master
 * template and imports the master template into other clients (FR-4,
 * FR-35).
 */
export class AccountTemplateService {
  /**
   * @param store Where the master template is kept.
   * @param chartOfAccounts Reads and adds client accounts.
   * @param now Clock for the template's saved time (injectable for tests).
   * @param fsMaps Reads and adds FS map lines; without it, templates carry
   *   accounts only.
   */
  public constructor(
    private readonly store: TemplateStore,
    private readonly chartOfAccounts: ChartOfAccountsService,
    private readonly now: () => Date = () => new Date(),
    private readonly fsMaps: FsMapService | null = null,
  ) {}

  /**
   * Summarises the saved master template.
   * @returns Its account count and save time, or `null` if none is saved.
   */
  public info(): AccountTemplateInfo | null {
    const template = this.store.read();
    return template ? toInfo(template) : null;
  }

  /**
   * Replaces the master template with a client's accounts, leaving out
   * system accounts.
   * @param clientId The client to copy from.
   * @throws UserFacingError if the client has no accounts of its own.
   */
  public saveFromClient(clientId: string): AccountTemplateInfo {
    const overview = this.fsMaps?.overview(clientId) ?? { lines: [], assignments: [] };
    const lineCode = new Map(overview.lines.map((line) => [line.id, line.code]));
    const assignmentOf = new Map(overview.assignments.map((a) => [a.accountId, a]));
    const accounts = this.chartOfAccounts
      .list(clientId)
      .filter((account) => account.systemKey === null)
      .map(({ id, code, name, type }) => {
        const internalFsCode = lineCode.get(assignmentOf.get(id)?.internal ?? -1);
        const externalFsCode = lineCode.get(assignmentOf.get(id)?.external ?? -1);
        return {
          code,
          name,
          type,
          ...(internalFsCode === undefined ? {} : { internalFsCode }),
          ...(externalFsCode === undefined ? {} : { externalFsCode }),
        };
      });
    if (accounts.length === 0) {
      throw new UserFacingError(
        "This client has no accounts of its own to save as the master template.",
      );
    }
    const linesOn = (map: FsMap): FsLineInput[] =>
      overview.lines.filter((line) => line.map === map).map(({ code, name, section }) => ({ code, name, section }));
    const template: AccountTemplate = {
      version: 2,
      savedAt: this.now().toISOString(),
      accounts,
      fsLines: { internal: linesOn("internal"), external: linesOn("external") },
    };
    this.store.write(template);
    return toInfo(template);
  }

  /**
   * Copies the master template into a client. Accounts and FS lines whose
   * code the client already uses are skipped, and accounts that already have
   * an FS line keep it, so nothing existing is changed and importing twice
   * adds nothing the second time.
   * @param clientId The client to import into.
   * @throws UserFacingError if no master template has been saved.
   */
  public importIntoClient(clientId: string): TemplateImportResult {
    const template = this.store.read();
    if (!template) {
      throw new UserFacingError(
        'No master template has been saved yet. Open a client with a full chart of accounts and choose "Save as master template".',
      );
    }
    let added = 0;
    let skipped = 0;
    for (const account of template.accounts) {
      if (this.chartOfAccounts.findByCode(clientId, account.code)) {
        skipped += 1;
      } else {
        this.chartOfAccounts.create(clientId, { code: account.code, name: account.name, type: account.type });
        added += 1;
      }
    }
    return { added, skipped, ...this.importFsMaps(clientId, template) };
  }

  private importFsMaps(clientId: string, template: AccountTemplate): Pick<TemplateImportResult, "fsLinesAdded" | "fsMappingsAdded"> {
    const fsMaps = this.fsMaps;
    if (!fsMaps || !template.fsLines) return { fsLinesAdded: 0, fsMappingsAdded: 0 };
    let fsLinesAdded = 0;
    let fsMappingsAdded = 0;
    for (const map of FS_MAPS) {
      for (const line of template.fsLines[map]) {
        if (fsMaps.findLineByCode(clientId, map, line.code)) continue;
        fsMaps.createLine(clientId, map, line);
        fsLinesAdded += 1;
      }
    }
    const assignmentOf = new Map(fsMaps.overview(clientId).assignments.map((a) => [a.accountId, a]));
    for (const map of FS_MAPS) {
      for (const templateAccount of template.accounts) {
        const fsCode = templateAccount[CODE_KEY[map]];
        const account = fsCode === undefined ? undefined : this.chartOfAccounts.findByCode(clientId, templateAccount.code);
        const line = account === undefined ? undefined : fsMaps.findLineByCode(clientId, map, fsCode);
        if (!account || !line || assignmentOf.get(account.id)?.[map] != null || !canMap(account.type, line.section)) continue;
        fsMaps.assign(clientId, map, [account.id], line.id);
        fsMappingsAdded += 1;
      }
    }
    return { fsLinesAdded, fsMappingsAdded };
  }
}

const toInfo = (template: AccountTemplate): AccountTemplateInfo => ({
  accountCount: template.accounts.length,
  fsLineCount: (template.fsLines?.internal.length ?? 0) + (template.fsLines?.external.length ?? 0),
  savedAt: template.savedAt,
});
