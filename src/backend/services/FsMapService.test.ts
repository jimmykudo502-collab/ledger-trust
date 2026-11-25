import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AccountType } from "../../common/accounts/accountSchemas";
import { canMap, FS_MAPS, FS_SECTIONS, type FsMap } from "../../common/fsMaps/fsMapSchemas";
import { STARTER_LINES } from "../fsMaps/starterLines";
import { SqliteFsMapRepository } from "../repositories/FsMapRepository";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";
import { FsMapService } from "./FsMapService";

let workspace: TempClientWorkspace;
let chart: ChartOfAccountsService;
let fsMaps: FsMapService;

beforeEach(() => {
  workspace = new TempClientWorkspace();
  chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(workspace.pool.get(id)));
  fsMaps = new FsMapService((id) => new SqliteFsMapRepository(workspace.pool.get(id)), chart, workspace.inTransaction);
});

afterEach(() => {
  workspace.dispose();
});

const ACCOUNTS: [string, string, AccountType][] = [
  ["1000", "Chequing", "asset"],
  ["2100", "Visa", "liability"],
  ["3000", "Owner equity", "equity"],
  ["4000", "Rent income", "revenue"],
  ["5100", "Repairs", "expense"],
];

const setup = () => {
  const clientId = new ClientService(workspace.clients, [chart]).create({ name: "Made-up Rentals", fiscalYearEnd: "2026-12-31" }).id;
  const accounts = ACCOUNTS.map(([code, name, type]) => chart.create(clientId, { code, name, type }));
  return { clientId, accounts };
};

const assignmentOf = (clientId: string, accountId: number, map: FsMap) =>
  fsMaps.overview(clientId).assignments.find((a) => a.accountId === accountId)?.[map] ?? null;

describe("FsMapService (FR-33 to FR-35)", () => {
  it("maps accounts only to lines on their own statement, all or nothing", () => {
    // One client for every run (creating a database file per run is slow);
    // each run starts with every account unmapped.
    const { clientId, accounts } = setup();
    const allIds = accounts.map((a) => a.id);
    let run = 0;
    fc.assert(
      fc.property(
        fc.constantFrom(...FS_MAPS),
        fc.constantFrom(...FS_SECTIONS),
        fc.uniqueArray(fc.nat(ACCOUNTS.length - 1), { minLength: 1, maxLength: ACCOUNTS.length }),
        (map, section, picks) => {
          FS_MAPS.forEach((m) => fsMaps.assign(clientId, m, allIds, null));
          run += 1;
          const line = fsMaps.createLine(clientId, map, { code: `X${run}`, name: "Test line", section });
          const chosen = picks.map((i) => accounts[i]);
          const allFit = chosen.every((account) => canMap(account.type, section));
          if (allFit) {
            fsMaps.assign(clientId, map, chosen.map((a) => a.id), line.id);
          } else {
            expect(() => fsMaps.assign(clientId, map, chosen.map((a) => a.id), line.id)).toThrow(/can't be mapped/);
          }
          for (const account of accounts) {
            const expected = allFit && chosen.includes(account) ? line.id : null;
            expect(assignmentOf(clientId, account.id, map)).toBe(expected);
            // The other map is never touched.
            expect(assignmentOf(clientId, account.id, map === "internal" ? "external" : "internal")).toBeNull();
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("keeps internal and external assignments separate and refuses a line from the other map", () => {
    const { clientId, accounts } = setup();
    const cash = accounts[0];
    const internal = fsMaps.createLine(clientId, "internal", { code: "1000", name: "Cash and bank", section: "current_assets" });
    const external = fsMaps.createLine(clientId, "external", { code: "100", name: "Cash", section: "current_assets" });
    fsMaps.assign(clientId, "internal", [cash.id], internal.id);
    fsMaps.assign(clientId, "external", [cash.id], external.id);
    expect(fsMaps.overview(clientId).assignments.find((a) => a.accountId === cash.id)).toEqual({
      accountId: cash.id,
      internal: internal.id,
      external: external.id,
    });
    expect(() => fsMaps.assign(clientId, "internal", [cash.id], external.id)).toThrow(/not on the internal map/);
    fsMaps.assign(clientId, "internal", [cash.id], null);
    expect(assignmentOf(clientId, cash.id, "internal")).toBeNull();
    expect(assignmentOf(clientId, cash.id, "external")).toBe(external.id);
  });

  it("allows the same map number on both maps but not twice on one", () => {
    const { clientId } = setup();
    fsMaps.createLine(clientId, "internal", { code: "100", name: "Cash", section: "current_assets" });
    fsMaps.createLine(clientId, "external", { code: "100", name: "Cash", section: "current_assets" });
    expect(() => fsMaps.createLine(clientId, "internal", { code: "100", name: "Other", section: "equity" })).toThrow(/already used/);
  });

  it("refuses to move a line to the other statement while it has accounts that don't fit", () => {
    const { clientId, accounts } = setup();
    const line = fsMaps.createLine(clientId, "internal", { code: "1000", name: "Cash", section: "current_assets" });
    fsMaps.assign(clientId, "internal", [accounts[0].id], line.id);
    expect(() => fsMaps.updateLine(clientId, line.id, { code: "1000", name: "Cash", section: "revenue" })).toThrow(/Move it/);
    const moved = fsMaps.updateLine(clientId, line.id, { code: "1001", name: "Bank", section: "non_current_assets" });
    expect(moved).toMatchObject({ code: "1001", name: "Bank", section: "non_current_assets", accountCount: 1 });
  });

  it("unmaps accounts when their line or the account itself is deleted", () => {
    const { clientId, accounts } = setup();
    const line = fsMaps.createLine(clientId, "external", { code: "600", name: "Expenses", section: "operating_expenses" });
    fsMaps.assign(clientId, "external", [accounts[4].id], line.id);
    fsMaps.deleteLine(clientId, line.id);
    expect(assignmentOf(clientId, accounts[4].id, "external")).toBeNull();

    const again = fsMaps.createLine(clientId, "external", { code: "600", name: "Expenses", section: "operating_expenses" });
    fsMaps.assign(clientId, "external", [accounts[4].id], again.id);
    chart.delete(clientId, accounts[4].id);
    expect(fsMaps.overview(clientId).lines.find((l) => l.id === again.id)?.accountCount).toBe(0);
  });

  it("adds the starter lines once, skipping numbers already used", () => {
    const { clientId } = setup();
    fsMaps.createLine(clientId, "external", { code: "100", name: "My cash line", section: "current_assets" });
    const first = fsMaps.addStarterLines(clientId, "external");
    expect(first).toEqual({ added: STARTER_LINES.external.length - 1, skipped: 1 });
    expect(fsMaps.addStarterLines(clientId, "external")).toEqual({ added: 0, skipped: STARTER_LINES.external.length });
    expect(fsMaps.findLineByCode(clientId, "external", "100")?.name).toBe("My cash line");
    expect(fsMaps.overview(clientId).lines.filter((l) => l.map === "internal")).toHaveLength(0);
  });

  it("starter lines have unique numbers per map", () => {
    for (const map of FS_MAPS) {
      const codes = STARTER_LINES[map].map((line) => line.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});
