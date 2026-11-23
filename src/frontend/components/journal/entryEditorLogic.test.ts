import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Account } from "../../../common/accounts/accountSchemas";
import type { JournalLineInput } from "../../../common/journal/journalSchemas";
import { checkDraft, emptyLine, toDrafts } from "./entryEditorLogic";

const accounts: Account[] = [
  { id: 1, code: "1000", name: "Chequing", type: "asset", systemKey: null, hasActivity: false },
  { id: 2, code: "1500", name: "Building", type: "asset", systemKey: null, hasActivity: false },
  { id: 3, code: "2500", name: "Mortgage", type: "liability", systemKey: null, hasActivity: false },
];

const balancedArb: fc.Arbitrary<JournalLineInput[]> = fc
  .tuple(fc.array(fc.tuple(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 10_000_000 })), { minLength: 1, maxLength: 5 }), fc.integer({ min: 1, max: 3 }))
  .map(([debits, creditId]) => [
    ...debits.map(([accountId, cents]) => ({ accountId, debitCents: cents, creditCents: 0, memo: null as string | null })),
    { accountId: creditId, debitCents: 0, creditCents: debits.reduce((sum, [, c]) => sum + c, 0), memo: null as string | null },
  ]);

describe("entry editor logic", () => {
  it("round-trips any balanced entry through the editable form", () => {
    fc.assert(
      fc.property(balancedArb, (lines) => {
        const check = checkDraft([...toDrafts(lines, accounts), emptyLine()], accounts);
        expect(check.problems).toEqual([]);
        expect(check.lines).toEqual(lines);
        expect(check.debitCents).toBe(check.creditCents);
      }),
    );
  });

  it("blocks posting until debits equal credits", () => {
    fc.assert(
      fc.property(balancedArb, fc.integer({ min: 1, max: 1000 }), (lines, extra) => {
        const drafts = toDrafts(lines, accounts);
        drafts[0] = { ...drafts[0], debit: (Number(drafts[0].debit.replace(/,/g, "")) + extra / 100).toFixed(2) };
        const check = checkDraft(drafts, accounts);
        expect(check.lines).toBeNull();
        expect(check.problems.join(" ")).toMatch(/must equal credits/);
      }),
    );
  });

  it("explains unknown codes, two-sided lines and bad amounts", () => {
    const check = checkDraft(
      [
        { code: "9999", debit: "10", credit: "", memo: "" },
        { code: "1000", debit: "5", credit: "5", memo: "" },
        { code: "1500", debit: "abc", credit: "", memo: "" },
        { code: "", debit: "", credit: "", memo: "ignored blank" },
      ],
      accounts,
    );
    expect(check.problems).toEqual([
      "Line 1: no account has code 9999.",
      "Line 2: enter a debit or a credit, not both.",
      "Line 3: amounts must be numbers like 1,250.00.",
    ]);
  });
});
