import type {
  AccountTemplate,
  AccountTemplateInfo,
  TemplateImportResult,
} from "../../common/templates/accountTemplateSchemas";
import { UserFacingError } from "../errors";
import type { TemplateStore } from "../templates/TemplateStore";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";

/**
 * Saves a client's chart of accounts as the master template and imports the
 * master template into other clients (FR-4).
 */
export class AccountTemplateService {
  /**
   * @param store Where the master template is kept.
   * @param chartOfAccounts Reads and adds client accounts.
   * @param now Clock for the template's saved time (injectable for tests).
   */
  public constructor(
    private readonly store: TemplateStore,
    private readonly chartOfAccounts: ChartOfAccountsService,
    private readonly now: () => Date = () => new Date(),
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
    const accounts = this.chartOfAccounts
      .list(clientId)
      .filter((account) => account.systemKey === null)
      .map(({ code, name, type }) => ({ code, name, type }));
    if (accounts.length === 0) {
      throw new UserFacingError(
        "This client has no accounts of its own to save as the master template.",
      );
    }
    const template: AccountTemplate = {
      version: 1,
      savedAt: this.now().toISOString(),
      accounts,
    };
    this.store.write(template);
    return toInfo(template);
  }

  /**
   * Copies the master template into a client. Accounts whose code the client
   * already uses are skipped, so existing accounts are never changed and
   * importing twice adds nothing the second time.
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
        this.chartOfAccounts.create(clientId, account);
        added += 1;
      }
    }
    return { added, skipped };
  }
}

const toInfo = (template: AccountTemplate): AccountTemplateInfo => ({
  accountCount: template.accounts.length,
  savedAt: template.savedAt,
});
