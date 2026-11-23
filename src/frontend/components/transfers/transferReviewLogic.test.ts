import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { TransferRow } from "../../../common/transfers/transferSchemas";
import { pairProblem, unmatchedTotal } from "./transferReviewLogic";

const rowArb: fc.Arbitrary<TransferRow> = fc.record({
  rowId: fc.nat(),
  bankAccountId: fc.integer({ min: 1, max: 3 }),
  bankAccountName: fc.constant("Tab"),
  date: fc.constant("2026-01-15"),
  description: fc.constant("Made-up"),
  amountCents: fc.constantFrom(-500, 500, 250),
  status: fc.constantFrom("staged" as const, "posted" as const),
});

describe("transfer review logic", () => {
  it("allows a pair exactly when tabs differ and amounts cancel out", () => {
    fc.assert(
      fc.property(rowArb, rowArb, (a, b) => {
        const ok = a.bankAccountId !== b.bankAccountId && a.amountCents === -b.amountCents;
        expect(pairProblem([a, b]) === null).toBe(ok);
      }),
    );
    expect(pairProblem([])).toMatch(/exactly two/);
  });

  it("is zero for any set of matched-up pairs", () => {
    fc.assert(
      fc.property(fc.array(rowArb), (rows) => {
        const mirrored = rows.flatMap((row) => [row, { ...row, amountCents: -row.amountCents }]);
        expect(unmatchedTotal(mirrored)).toBe(0);
      }),
    );
  });
});
