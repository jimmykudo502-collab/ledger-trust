import { clientIdSchema } from "../../common/clients/clientSchemas";
import {
  ruleInputSchema,
  type ApplyResult,
  type CodingRule,
  type RuleInput,
} from "../../common/rules/ruleSchemas";
import { UserFacingError } from "../errors";
import { pickRule } from "../posting/ruleMatching";
import type { CodingRuleRepository } from "../repositories/CodingRuleRepository";
import type { BankAccountService } from "./BankAccountService";
import type { ChartOfAccountsService } from "./ChartOfAccountsService";
import type { StagingRepositoryProvider } from "./ImportService";

/** Suggests codes for new rows from remembered rules. */
export interface RuleSuggester {
  /**
   * @param clientId The client.
   * @param bankAccountId The tab being imported into.
   * @returns A function from a row's description to an account id, or null.
   */
  suggester(clientId: string, bankAccountId: number): (description: string) => number | null;
}

/** Gives the coding rule repository for one client. */
export type CodingRuleRepositoryProvider = (clientId: string) => CodingRuleRepository;

/**
 * Remembered coding rules (FR-18): "description contains X, use code Y",
 * applied automatically to new imports and on request to uncoded rows.
 * Rules never change a row that already has a code.
 */
export class CodingRuleService implements RuleSuggester {
  /**
   * @param rulesFor Returns the rule repository for a client.
   * @param stagingFor Returns the staging repository for a client.
   * @param bankAccounts Resolves tabs.
   * @param chartOfAccounts Resolves codes to accounts.
   */
  public constructor(
    private readonly rulesFor: CodingRuleRepositoryProvider,
    private readonly stagingFor: StagingRepositoryProvider,
    private readonly bankAccounts: BankAccountService,
    private readonly chartOfAccounts: ChartOfAccountsService,
  ) {}

  /**
   * A client's rules, oldest first.
   * @param clientId The client.
   */
  public list(clientId: string): CodingRule[] {
    return this.repo(clientId).list();
  }

  /**
   * Creates (or replaces) a rule, optionally coding matching uncoded rows now.
   * @param clientId The client.
   * @param input Match text, account code and scope.
   * @param applyNow Also code matching uncoded rows in the affected tabs.
   */
  public create(clientId: string, input: RuleInput, applyNow: boolean): ApplyResult {
    const { matchText, code, bankAccountId } = ruleInputSchema.parse(input);
    const account = this.chartOfAccounts.findByCode(clientId, code);
    if (!account) {
      throw new UserFacingError(`No account has code ${code}.`);
    }
    const tabs = bankAccountId === null
      ? this.bankAccounts.list(clientId)
      : [this.bankAccounts.require(clientId, bankAccountId)];
    if (bankAccountId !== null && tabs[0].accountId === account.id) {
      throw new UserFacingError(`${account.code} ${account.name} is the tab's own account, so a rule can't code rows to it.`);
    }
    this.repo(clientId).upsert({ matchText, accountId: account.id, bankAccountId });
    if (!applyNow) {
      return { codedCount: 0 };
    }
    return {
      codedCount: tabs.reduce((sum, tab) => sum + this.apply(clientId, tab.id).codedCount, 0),
    };
  }

  /**
   * Deletes a rule. Rows it already coded keep their codes.
   * @param clientId The client.
   * @param ruleId The rule.
   */
  public delete(clientId: string, ruleId: number): void {
    const rules = this.repo(clientId);
    if (!rules.find(ruleId)) {
      throw new UserFacingError("That rule no longer exists.");
    }
    rules.delete(ruleId);
  }

  /**
   * Codes a tab's uncoded, unposted rows using the client's rules.
   * @param clientId The client.
   * @param bankAccountId The tab.
   */
  public apply(clientId: string, bankAccountId: number): ApplyResult {
    const tab = this.bankAccounts.require(clientId, bankAccountId);
    const rules = this.repo(clientId).list();
    const staging = this.stagingFor(clientIdSchema.parse(clientId));
    let codedCount = 0;
    for (const row of staging.listRows(bankAccountId)) {
      if (row.status !== "staged" || row.offsetAccountId !== null) continue;
      const accountId = this.suggest(row.description, tab.id, tab.accountId, rules);
      if (accountId !== null) {
        staging.setOffsetAccount([row.id], accountId);
        codedCount += 1;
      }
    }
    return { codedCount };
  }

  /**
   * The account a rule suggests for a new row, used when staging imports.
   * @param clientId The client.
   * @param bankAccountId The tab being imported into.
   * @returns A function from description to account id (or null).
   */
  public suggester(clientId: string, bankAccountId: number): (description: string) => number | null {
    const tab = this.bankAccounts.require(clientId, bankAccountId);
    const rules = this.repo(clientId).list();
    return (description) => this.suggest(description, tab.id, tab.accountId, rules);
  }

  private suggest(description: string, tabId: number, tabAccountId: number, rules: CodingRule[]): number | null {
    const rule = pickRule(description, tabId, rules);
    // A rule pointing at this tab's own account would make a meaningless entry.
    return rule && rule.accountId !== tabAccountId ? rule.accountId : null;
  }

  private repo(clientId: string): CodingRuleRepository {
    return this.rulesFor(clientIdSchema.parse(clientId));
  }
}
