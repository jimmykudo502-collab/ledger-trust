import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { centsFromNumber, formatCents, parseMoney } from "./money";

const cents = fc.integer({ min: -(10 ** 13), max: 10 ** 13 });

describe("money", () => {
  it("parses whatever it formats back to the same cents", () => {
    fc.assert(
      fc.property(cents, (value) => {
        expect(parseMoney(formatCents(value))).toBe(value);
      }),
    );
  });

  it("reads bank-style negatives the same as a minus sign", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 ** 12 }), (value) => {
        const plain = formatCents(value);
        for (const negative of [`-${plain}`, `(${plain})`, `${plain}-`, `$-${plain}`, `-$${plain}`]) {
          expect(parseMoney(negative), negative).toBe(-value);
        }
        expect(parseMoney(`$${plain}`)).toBe(value);
        expect(parseMoney(plain.replace(/,/g, ""))).toBe(value);
      }),
    );
  });

  it("converts spreadsheet numbers to the cents they display", () => {
    fc.assert(
      fc.property(cents, (value) => {
        // A number as a spreadsheet stores it, with binary rounding noise.
        expect(centsFromNumber(value / 100)).toBe(value);
      }),
    );
    expect(centsFromNumber(12.300000000000001)).toBe(1230);
    expect(centsFromNumber(0.1 + 0.2)).toBe(30);
  });

  it("rejects unreadable text and fractions of a cent", () => {
    for (const bad of ["", "abc", "12.345", "1,23.00", "--5", "1.2.3", "."]) {
      expect(parseMoney(bad), bad).toBeNull();
    }
    expect(centsFromNumber(1.005)).toBeNull();
    expect(centsFromNumber(Number.NaN)).toBeNull();
  });

  it("handles short decimals and whole dollars", () => {
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney(".75")).toBe(75);
    expect(parseMoney("1,000")).toBe(100000);
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(-100)).toBe("-1.00");
  });
});
