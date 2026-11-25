import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ACCOUNT_TYPES, type Account } from "../../../common/accounts/accountSchemas";
import { canMap, FS_MAPS, FS_SECTIONS, type FsAssignment, type FsLine } from "../../../common/fsMaps/fsMapSchemas";
import { lineOptionsFor, linesBySection, unmappedAccounts } from "./fsMapLogic";

const linesArb = fc
  .array(fc.record({ map: fc.constantFrom(...FS_MAPS), section: fc.constantFrom(...FS_SECTIONS), code: fc.stringMatching(/^[0-9A-Z]{1,5}$/) }), {
    maxLength: 20,
  })
  .map((rows) => rows.map((row, i): FsLine => ({ ...row, id: i + 1, name: `Line ${i}`, accountCount: 0 })));

describe("FS map screen logic", () => {
  it("groups exactly the chosen map's lines, each once, in statement order", () => {
    fc.assert(
      fc.property(linesArb, fc.constantFrom(...FS_MAPS), (lines, map) => {
        const groups = linesBySection(lines, map);
        const shown = groups.flatMap((g) => g.lines.map((l) => l.id)).sort((a, b) => a - b);
        expect(shown).toEqual(lines.filter((l) => l.map === map).map((l) => l.id));
        const order = groups.map((g) => FS_SECTIONS.indexOf(g.section));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        groups.forEach((g) => g.lines.forEach((l) => expect(l.section).toBe(g.section)));
      }),
    );
  });

  it("offers an account only lines it can be mapped to", () => {
    fc.assert(
      fc.property(linesArb, fc.constantFrom(...FS_MAPS), fc.constantFrom(...ACCOUNT_TYPES), (lines, map, type) => {
        const offered = lineOptionsFor(lines, map, type).flatMap((g) => g.lines);
        expect(offered.every((l) => l.map === map && canMap(type, l.section))).toBe(true);
        expect(offered).toHaveLength(lines.filter((l) => l.map === map && canMap(type, l.section)).length);
      }),
    );
  });

  it("counts accounts with no line, or a line that doesn't fit, as unmapped", () => {
    const account = (id: number, type: Account["type"]): Account => ({ id, code: String(id), name: `A${id}`, type, systemKey: null, hasActivity: false });
    const lines: FsLine[] = [
      { id: 1, map: "internal", code: "100", name: "Cash", section: "current_assets", accountCount: 1 },
      { id: 2, map: "internal", code: "400", name: "Revenue", section: "revenue", accountCount: 1 },
    ];
    const accounts = [account(1, "asset"), account(2, "asset"), account(3, "liability")];
    const assignments: FsAssignment[] = [
      { accountId: 1, internal: 1, external: null },
      { accountId: 2, internal: null, external: null },
      { accountId: 3, internal: 2, external: null },
    ];
    expect(unmappedAccounts(accounts, lines, assignments, "internal").map((a) => a.id)).toEqual([2, 3]);
    expect(unmappedAccounts(accounts, lines, assignments, "external")).toHaveLength(3);
  });
});
