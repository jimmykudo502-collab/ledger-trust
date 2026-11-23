import type { Database } from "better-sqlite3";

import type { CodingRule } from "../../common/rules/ruleSchemas";

/**
 * Stores one client's remembered coding rules (FR-18).
 */
export interface CodingRuleRepository {
  /** Every rule, oldest first. */
  list(): CodingRule[];
  /** One rule by id. */
  find(ruleId: number): CodingRule | undefined;
  /** Stores a rule, replacing any rule with the same text and scope. */
  upsert(rule: Omit<CodingRule, "id">): CodingRule;
  /** Removes a rule. */
  delete(ruleId: number): void;
}

interface RuleRow {
  id: number;
  match_text: string;
  account_id: number;
  bank_account_id: number | null;
}

const toRule = (row: RuleRow): CodingRule => ({
  id: row.id,
  matchText: row.match_text,
  accountId: row.account_id,
  bankAccountId: row.bank_account_id,
});

/**
 * Coding rule repository over a client's SQLite database.
 */
export class SqliteCodingRuleRepository implements CodingRuleRepository {
  /**
   * @param db The client's open database.
   */
  public constructor(private readonly db: Database) {}

  /** @inheritdoc */
  public list(): CodingRule[] {
    return (
      this.db
        .prepare("SELECT id, match_text, account_id, bank_account_id FROM coding_rules ORDER BY id")
        .all() as RuleRow[]
    ).map(toRule);
  }

  /** @inheritdoc */
  public find(ruleId: number): CodingRule | undefined {
    const row = this.db
      .prepare("SELECT id, match_text, account_id, bank_account_id FROM coding_rules WHERE id = ?")
      .get(ruleId) as RuleRow | undefined;
    return row ? toRule(row) : undefined;
  }

  /** @inheritdoc */
  public upsert(rule: Omit<CodingRule, "id">): CodingRule {
    return this.db.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM coding_rules WHERE lower(match_text) = lower(?) AND bank_account_id IS ?",
        )
        .run(rule.matchText, rule.bankAccountId);
      const { lastInsertRowid } = this.db
        .prepare("INSERT INTO coding_rules (match_text, account_id, bank_account_id) VALUES (?, ?, ?)")
        .run(rule.matchText, rule.accountId, rule.bankAccountId);
      return this.find(Number(lastInsertRowid));
    })();
  }

  /** @inheritdoc */
  public delete(ruleId: number): void {
    this.db.prepare("DELETE FROM coding_rules WHERE id = ?").run(ruleId);
  }
}
