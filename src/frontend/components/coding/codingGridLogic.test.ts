import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ACCOUNT_TYPES, type Account } from "../../../common/accounts/accountSchemas";
import type { StagedTransaction } from "../../../common/staging/stagingSchemas";
import { filterCounts, lookUpCode, matchesFilter, ROW_FILTERS, suggestedType } from "./codingGridLogic";

const rowArb: fc.Arbitrary<StagedTransaction> = fc.record({
  id: fc.nat(),
  batchId: fc.constant(1),
  rowNumber: fc.nat(),
  date: fc.constant("2026-01-05"),
  description: fc.constant("Made-up"),
  amountCents: fc.integer({ min: -1000, max: 1000 }).filter((n) => n !== 0),
  offsetAccountId: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }),
  status: fc.constantFrom("staged" as const, "posted" as const),
});

const accountsArb = fc.uniqueArray(
  fc.record({
    id: fc.integer({ min: 1, max: 50 }),
    code: fc.stringMatching(/^[1-9][0-9]{3}$/),
    name: fc.constant("Account"),
    type: fc.constantFrom(...ACCOUNT_TYPES),
    systemKey: fc.constant(null),
    hasActivity: fc.boolean(),
  }) as fc.Arbitrary<Account>,
  { selector: (a) => a.code, maxLength: 10 },
);

describe("coding grid logic", () => {
  it("puts every row in exactly one of To code, Ready and Posted", () => {
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 30 }), (rows) => {
        for (const row of rows) {
          const buckets = ROW_FILTERS.filter((f) => f !== "all" && matchesFilter(row, f));
          expect(buckets).toHaveLength(1);
        }
        const counts = filterCounts(rows);
        expect(counts.toCode + counts.ready + counts.posted).toBe(counts.all);
      }),
    );
  });

  it("finds a typed code's account, flags the tab's own account and unknown codes", () => {
    fc.assert(
      fc.property(accountsArb, fc.stringMatching(/^ ?[1-9][0-9]{3} ?$/), fc.integer({ min: 1, max: 50 }), (accounts, typed, tabAccountId) => {
        const result = lookUpCode(typed, accounts, tabAccountId);
        const match = accounts.find((a) => a.code === typed.trim());
        if (!match) expect(result).toEqual({ kind: "unknown", code: typed.trim() });
        else expect(result).toEqual({ kind: match.id === tabAccountId ? "own" : "known", account: match });
      }),
    );
    expect(lookUpCode("  ", [], 1)).toEqual({ kind: "empty" });
  });

  it("suggests revenue for money in and expense for money out", () => {
    expect(suggestedType(100)).toBe("revenue");
    expect(suggestedType(-100)).toBe("expense");
  });
});
