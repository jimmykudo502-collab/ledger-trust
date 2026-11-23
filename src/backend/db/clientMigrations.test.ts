import Database from "better-sqlite3";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isIsoDate } from "../../common/dates";
import { CLIENT_MIGRATIONS } from "./clientMigrations";
import { MigrationRunner } from "./MigrationRunner";

const MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Reference: the next year-end on or after today (UTC), clamping Feb 29. */
const expectedYearEnd = (month: number, day: number, today: Date): string => {
  const inYear = (year: number) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1, Math.min(day, last)))
      .toISOString()
      .slice(0, 10);
  };
  const todayIso = today.toISOString().slice(0, 10);
  const year = today.getUTCFullYear();
  return inYear(year) >= todayIso ? inYear(year) : inYear(year + 1);
};

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  db.close();
});

describe("migration 2: fiscal year-end as a full date", () => {
  it("gives existing clients their next year-end on or after today", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }).chain((month) =>
          fc.tuple(fc.constant(month), fc.integer({ min: 1, max: MAX_DAY[month - 1] })),
        ),
        ([month, day]) => {
          const scratch = new Database(":memory:");
          try {
            new MigrationRunner(CLIENT_MIGRATIONS.slice(0, 1)).migrate(scratch);
            scratch
              .prepare(
                "INSERT INTO client_profile (id, name, fiscal_year_end_month, fiscal_year_end_day, archived_at) VALUES (1, 'Made-up Rentals', ?, ?, '2026-01-01T00:00:00.000Z')",
              )
              .run(month, day);

            new MigrationRunner(CLIENT_MIGRATIONS).migrate(scratch);

            expect(scratch.prepare("SELECT * FROM client_profile").get()).toEqual({
              id: 1,
              name: "Made-up Rentals",
              fiscal_year_end: expectedYearEnd(month, day, new Date()),
              archived_at: "2026-01-01T00:00:00.000Z",
              created_at: expect.any(String),
            });
          } finally {
            scratch.close();
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("isIsoDate", () => {
  it("agrees with SQLite's date check for any YYYY-MM-DD shaped string", () => {
    const check = db.prepare("SELECT date(?) IS ? AS ok");
    const pad = (n: number, width: number) => String(n).padStart(width, "0");

    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999 }),
        fc.integer({ min: 0, max: 13 }),
        fc.integer({ min: 0, max: 32 }),
        (year, month, day) => {
          const value = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
          const { ok } = check.get(value, value) as { ok: number };
          expect(isIsoDate(value)).toBe(ok === 1);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("rejects other formats", () => {
    for (const bad of ["2026-1-31", "31/12/2026", "2026-12-31T00:00", "", "abcd-ef-gh"]) {
      expect(isIsoDate(bad), bad).toBe(false);
    }
  });
});
