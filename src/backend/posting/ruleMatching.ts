import type { CodingRule } from "../../common/rules/ruleSchemas";

const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Picks the rule for a row (FR-18): its description must contain the rule's
 * text (ignoring case and spacing), and the rule must apply to the row's tab
 * or to every tab. When several match, the longest (most specific) text
 * wins; ties go to the tab-specific rule, then the newest.
 * @param description The row's description.
 * @param bankAccountId The row's tab.
 * @param rules The client's rules.
 * @returns The rule to apply, or undefined if none match.
 */
export const pickRule = (
  description: string,
  bankAccountId: number,
  rules: readonly CodingRule[],
): CodingRule | undefined => {
  const text = normalize(description);
  let best: CodingRule | undefined;
  for (const rule of rules) {
    if (rule.bankAccountId !== null && rule.bankAccountId !== bankAccountId) continue;
    if (!text.includes(normalize(rule.matchText))) continue;
    if (!best || isBetter(rule, best)) best = rule;
  }
  return best;
};

const isBetter = (candidate: CodingRule, current: CodingRule): boolean => {
  const lengthDiff = normalize(candidate.matchText).length - normalize(current.matchText).length;
  if (lengthDiff !== 0) return lengthDiff > 0;
  const specificDiff = Number(candidate.bankAccountId !== null) - Number(current.bankAccountId !== null);
  if (specificDiff !== 0) return specificDiff > 0;
  return candidate.id > current.id;
};
