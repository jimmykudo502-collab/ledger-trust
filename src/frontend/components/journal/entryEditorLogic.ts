import type { Account } from "../../../common/accounts/accountSchemas";
import { balanceProblem, entryTotals, type JournalLineInput } from "../../../common/journal/journalSchemas";
import { formatCents, parseMoney } from "../../../common/money";

/** One line as typed on the journal entry screen. */
export interface LineDraft {
  code: string;
  debit: string;
  credit: string;
  memo: string;
}

/** The result of reading the typed lines. */
export interface DraftCheck {
  /** Lines ready to post, or null if anything needs fixing. */
  readonly lines: JournalLineInput[] | null;
  /** What needs fixing, one message per problem. */
  readonly problems: string[];
  readonly debitCents: number;
  readonly creditCents: number;
}

/** A blank line. */
export const emptyLine = (): LineDraft => ({ code: "", debit: "", credit: "", memo: "" });

/**
 * Reads typed lines into postable journal lines (FR-24). Blank lines are
 * ignored. Each line needs a known account code and exactly one of debit or
 * credit; the totals must balance.
 * @param drafts The typed lines.
 * @param accounts The client's accounts.
 */
export const checkDraft = (drafts: readonly LineDraft[], accounts: readonly Account[]): DraftCheck => {
  const problems: string[] = [];
  const lines: JournalLineInput[] = [];
  drafts.forEach((draft, index) => {
    const label = `Line ${index + 1}`;
    if (draft.code.trim() === "" && draft.debit.trim() === "" && draft.credit.trim() === "") return;
    const account = accounts.find((candidate) => candidate.code === draft.code.trim());
    if (!account) {
      problems.push(draft.code.trim() === "" ? `${label}: enter an account code.` : `${label}: no account has code ${draft.code.trim()}.`);
    }
    const debit = draft.debit.trim() === "" ? 0 : parseMoney(draft.debit);
    const credit = draft.credit.trim() === "" ? 0 : parseMoney(draft.credit);
    if (debit === null || credit === null) {
      problems.push(`${label}: amounts must be numbers like 1,250.00.`);
      return;
    }
    if (debit < 0 || credit < 0) {
      problems.push(`${label}: enter positive amounts; use the other column for the opposite side.`);
      return;
    }
    if ((debit > 0) === (credit > 0)) {
      problems.push(`${label}: enter a debit or a credit, not both.`);
      return;
    }
    if (account) {
      lines.push({ accountId: account.id, debitCents: debit, creditCents: credit, memo: draft.memo.trim() || null });
    }
  });
  const { debitCents, creditCents } = entryTotals(lines);
  if (problems.length === 0) {
    if (lines.length < 2) problems.push("An entry needs at least two lines.");
    const unbalanced = balanceProblem(lines);
    if (unbalanced) problems.push(unbalanced);
  }
  return { lines: problems.length === 0 ? lines : null, problems, debitCents, creditCents };
};

/**
 * Turns posted lines back into editable drafts.
 * @param lines The entry's lines.
 * @param accounts The client's accounts.
 */
export const toDrafts = (
  lines: readonly (JournalLineInput & { memo?: string | null })[],
  accounts: readonly Account[],
): LineDraft[] =>
  lines.map((line) => ({
    code: accounts.find((account) => account.id === line.accountId)?.code ?? "",
    debit: line.debitCents > 0 ? formatCents(line.debitCents) : "",
    credit: line.creditCents > 0 ? formatCents(line.creditCents) : "",
    memo: line.memo ?? "",
  }));
