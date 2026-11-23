import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findTransferPairs, isTransferPair, type TransferCandidate } from "./transferMatching";

const candidatesArb: fc.Arbitrary<TransferCandidate[]> = fc.uniqueArray(
  fc.record({
    id: fc.integer({ min: 1, max: 500 }),
    bankAccountId: fc.integer({ min: 1, max: 3 }),
    date: fc.integer({ min: 1, max: 20 }).map((d) => `2026-01-${String(d).padStart(2, "0")}`),
    amountCents: fc.constantFrom(50000, -50000, 38015, -38015, 100000, -100000),
  }),
  { selector: (row) => row.id, maxLength: 25 },
);

describe("findTransferPairs (FR-19)", () => {
  it("only pairs valid transfers, uses each row at most once, and leaves no obvious pair behind", () => {
    fc.assert(
      fc.property(candidatesArb, (rows) => {
        const { certain, suggested } = findTransferPairs(rows);
        const ids = suggested.flatMap((pair) => [pair.first.id, pair.second.id]);

        expect(new Set(ids).size).toBe(ids.length);
        for (const pair of suggested) {
          expect(isTransferPair(pair.first, pair.second)).toBe(true);
          expect(pair.first.amountCents).toBeLessThan(0);
        }
        // Every certain pair is also suggested.
        for (const pair of certain) expect(suggested).toContainEqual(pair);
        // Maximal: no two unused rows could still form a pair.
        const used = new Set(ids);
        const unused = rows.filter((row) => !used.has(row.id));
        for (const a of unused) for (const b of unused) expect(isTransferPair(a, b)).toBe(false);
      }),
    );
  });

  it("marks a pair certain only when neither row has another possible partner", () => {
    const out = { id: 1, bankAccountId: 1, date: "2026-01-15", amountCents: -50000 };
    const inSavings = { id: 2, bankAccountId: 2, date: "2026-01-16", amountCents: 50000 };
    expect(findTransferPairs([out, inSavings]).certain).toHaveLength(1);

    const alsoIn = { id: 3, bankAccountId: 3, date: "2026-01-15", amountCents: 50000 };
    const result = findTransferPairs([out, inSavings, alsoIn]);
    expect(result.certain).toEqual([]);
    // The closer date wins the suggestion.
    expect(result.suggested.map((p) => p.second.id)).toEqual([3]);
  });

  it("ignores same-tab refunds, mismatched amounts and dates too far apart", () => {
    const base = { id: 1, bankAccountId: 1, date: "2026-01-10", amountCents: -2500 };
    expect(isTransferPair(base, { ...base, id: 2, amountCents: 2500 })).toBe(false);
    expect(isTransferPair(base, { id: 2, bankAccountId: 2, date: "2026-01-10", amountCents: 2400 })).toBe(false);
    expect(isTransferPair(base, { id: 2, bankAccountId: 2, date: "2026-01-15", amountCents: 2500 })).toBe(false);
    expect(isTransferPair(base, { id: 2, bankAccountId: 2, date: "2026-01-14", amountCents: 2500 })).toBe(true);
  });
});
