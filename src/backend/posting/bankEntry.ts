import type { JournalLineInput } from "../../common/journal/journalSchemas";

/**
 * The two journal lines for a coded bank or credit card row (FR-16).
 *
 * Money in debits the tab's account and credits the coded account; money
 * out credits the tab's account and debits the coded account. Credit card
 * tabs use the same rule: a charge (money out) credits the card's liability
 * account, and a payment to the card (money in) debits it.
 * @param amountCents The row's amount; positive = money in. Never zero.
 * @param tabAccountId The ledger account the tab posts to.
 * @param codedAccountId The account the row was coded to.
 */
export const bankEntryLines = (
  amountCents: number,
  tabAccountId: number,
  codedAccountId: number,
): JournalLineInput[] => {
  const amount = Math.abs(amountCents);
  const moneyIn = amountCents > 0;
  return [
    { accountId: tabAccountId, debitCents: moneyIn ? amount : 0, creditCents: moneyIn ? 0 : amount },
    { accountId: codedAccountId, debitCents: moneyIn ? 0 : amount, creditCents: moneyIn ? amount : 0 },
  ];
};
