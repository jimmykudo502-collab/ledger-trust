import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ACCOUNT_TYPES, type Account } from "../../../common/accounts/accountSchemas";
import { filterAccounts } from "./accountFilter";

const accountArb: fc.Arbitrary<Account> = fc.record({
  id: fc.nat(),
  code: fc.stringMatching(/^[0-9]{1,5}$/),
  name: fc.string({ minLength: 1, maxLength: 15 }),
  type: fc.constantFrom(...ACCOUNT_TYPES),
  systemKey: fc.constant(null),
  hasActivity: fc.boolean(),
});

describe("filterAccounts", () => {
  it("returns an ordered subset that always includes exact code matches", () => {
    fc.assert(
      fc.property(fc.array(accountArb, { maxLength: 15 }), fc.string(), (accounts, query) => {
        const result = filterAccounts(accounts, query);

        // Order preserved: result is a subsequence of the input.
        let cursor = 0;
        for (const account of result) {
          cursor = accounts.indexOf(account, cursor) + 1;
          expect(cursor).toBeGreaterThan(0);
        }
        for (const account of accounts) {
          if (account.code === query.trim()) expect(result).toContain(account);
        }
      }),
    );
  });

  it("keeps everything for a blank query and ignores case", () => {
    fc.assert(
      fc.property(fc.array(accountArb, { maxLength: 15 }), (accounts) => {
        expect(filterAccounts(accounts, "   ")).toEqual(accounts);
        for (const account of accounts) {
          expect(filterAccounts(accounts, account.name.toUpperCase())).toEqual(
            filterAccounts(accounts, account.name.toLowerCase()),
          );
        }
      }),
    );
  });
});
