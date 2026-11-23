import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { detectDateOrder, parseImportDate } from "./importDates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const dateArb = fc
  .date({ min: new Date("1960-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z"), noInvalidDate: true })
  .map((date) => ({
    iso: date.toISOString().slice(0, 10),
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  }));

const pad = (n: number) => String(n).padStart(2, "0");

describe("parseImportDate", () => {
  it("reads the same date written in every supported style", () => {
    fc.assert(
      fc.property(dateArb, fc.constantFrom("/", "-", "."), ({ iso, y, m, d }, sep) => {
        expect(parseImportDate(iso, "MDY")).toBe(iso);
        expect(parseImportDate(`${iso}T00:00:00`, "DMY")).toBe(iso);
        expect(parseImportDate(`${pad(m)}${sep}${pad(d)}${sep}${y}`, "MDY")).toBe(iso);
        expect(parseImportDate(`${m}${sep}${d}${sep}${y}`, "MDY")).toBe(iso);
        expect(parseImportDate(`${pad(d)}${sep}${pad(m)}${sep}${y}`, "DMY")).toBe(iso);
        expect(parseImportDate(`${y}${sep}${pad(m)}${sep}${pad(d)}`, "DMY")).toBe(iso);
        expect(parseImportDate(`${MONTHS[m - 1]} ${d}, ${y}`, "DMY")).toBe(iso);
        expect(parseImportDate(`${d} ${LONG[m - 1]} ${y}`, "MDY")).toBe(iso);
        expect(parseImportDate(`${pad(d)}-${MONTHS[m - 1].toUpperCase()}-${y}`, "MDY")).toBe(iso);
        if (y >= 2000) {
          expect(parseImportDate(`${pad(m)}/${pad(d)}/${String(y).slice(2)}`, "MDY")).toBe(iso);
        }
      }),
    );
  });

  it("reads Excel serial numbers", () => {
    fc.assert(
      fc.property(dateArb, ({ iso }) => {
        const serial = (Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86_400_000;
        expect(parseImportDate(serial, "MDY")).toBe(iso);
      }),
    );
    expect(parseImportDate(45.5, "MDY")).toBeNull();
    expect(parseImportDate(123, "MDY")).toBeNull();
  });

  it("only ever returns real dates or null", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.stringMatching(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)), fc.constantFrom("MDY" as const, "DMY" as const), (text, order) => {
        const result = parseImportDate(text, order);
        if (result !== null) {
          expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10)).toBe(result);
        }
      }),
    );
    for (const bad of ["", "Total", "13/13/2026", "02/30/2026", "1234.56", "Jan 2026", "1,001.00", "12,345.67", "1/05-2026"]) {
      expect(parseImportDate(bad, "MDY"), bad).toBeNull();
    }
  });
});

describe("detectDateOrder", () => {
  it("spots day-first and month-first data", () => {
    expect(detectDateOrder(["01/02/2026", "25/02/2026"])).toEqual({ order: "DMY", ambiguous: false });
    expect(detectDateOrder(["02/01/2026", "02/25/2026"])).toEqual({ order: "MDY", ambiguous: false });
    expect(detectDateOrder(["2026/02/01"])).toEqual({ order: "YMD", ambiguous: false });
    expect(detectDateOrder(["01/02/2026", "03/04/2026"])).toEqual({ order: "MDY", ambiguous: true });
    expect(detectDateOrder(["Jan 5, 2026", 45000, null])).toEqual({ order: "MDY", ambiguous: false });
  });
});
