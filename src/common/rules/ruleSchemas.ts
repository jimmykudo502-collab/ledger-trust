import { z } from "zod";

import { accountCodeSchema } from "../accounts/accountSchemas";
import { bankAccountIdSchema } from "../bankAccounts/bankAccountSchemas";
import { clientIdSchema, type ClientId } from "../clients/clientSchemas";

/**
 * A remembered coding rule (FR-18): rows whose description contains the
 * text get the account. Applies to one tab, or to every tab when
 * `bankAccountId` is null.
 */
export interface CodingRule {
  readonly id: number;
  readonly matchText: string;
  readonly accountId: number;
  readonly bankAccountId: number | null;
}

export const matchTextSchema = z
  .string()
  .trim()
  .min(2, "Enter at least two characters to match.")
  .max(200, "Match text can be at most 200 characters.");

/** What the user enters to create a rule. */
export const ruleInputSchema = z.object({
  matchText: matchTextSchema,
  code: accountCodeSchema,
  /** The tab it applies to, or null for every tab. */
  bankAccountId: bankAccountIdSchema.nullable(),
});

export type RuleInput = z.infer<typeof ruleInputSchema>;

export const listRulesRequestSchema = z.object({ clientId: clientIdSchema });

export const createRuleRequestSchema = z.object({
  clientId: clientIdSchema,
  rule: ruleInputSchema,
  /** Also code the client's matching uncoded rows now. */
  applyNow: z.boolean(),
});

export const deleteRuleRequestSchema = z.object({
  clientId: clientIdSchema,
  ruleId: z.number().int().positive(),
});

export const applyRulesRequestSchema = z.object({
  clientId: clientIdSchema,
  bankAccountId: bankAccountIdSchema,
});

/** Result of creating a rule or applying rules to staged rows. */
export interface ApplyResult {
  /** Uncoded rows that were coded by rules. */
  readonly codedCount: number;
}

/**
 * The coding-rules API the preload script exposes to the renderer as
 * `window.codingRules`.
 */
export interface CodingRulesApi {
  list(clientId: ClientId): Promise<CodingRule[]>;
  create(clientId: ClientId, rule: RuleInput, applyNow: boolean): Promise<ApplyResult>;
  delete(clientId: ClientId, ruleId: number): Promise<void>;
  /** Codes a tab's uncoded rows with the matching rules. */
  apply(clientId: ClientId, bankAccountId: number): Promise<ApplyResult>;
}
