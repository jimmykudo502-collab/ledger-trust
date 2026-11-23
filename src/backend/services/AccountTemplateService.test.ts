import * as fc from "fast-check";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ACCOUNT_TYPES,
  type Account,
  type AccountInput,
} from "../../common/accounts/accountSchemas";
import { InMemoryAccountRepository } from "../repositories/InMemoryAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { InMemoryTemplateStore, JsonFileTemplateStore } from "../templates/TemplateStore";
import { AccountTemplateService } from "./AccountTemplateService";
import { ChartOfAccountsService } from "./ChartOfAccountsService";

const accountInputArb: fc.Arbitrary<AccountInput> = fc.record({
  code: fc.stringMatching(/^[1-9][0-9]{2,3}$/),
  name: fc.constantFrom("Chequing", "Rent income", "Repairs", "Insurance", "Mortgage"),
  type: fc.constantFrom(...ACCOUNT_TYPES),
});

const accountListArb = fc.uniqueArray(accountInputArb, {
  selector: (account) => account.code,
  maxLength: 12,
});

/** A fresh in-memory setup with a new client id per call. */
const setup = () => {
  const repos = new Map<string, InMemoryAccountRepository>();
  const chart = new ChartOfAccountsService((id) => {
    if (!repos.has(id)) repos.set(id, new InMemoryAccountRepository());
    return repos.get(id);
  });
  const templates = new AccountTemplateService(
    new InMemoryTemplateStore(),
    chart,
    () => new Date("2026-11-22T12:00:00Z"),
  );
  let counter = 0;
  const newClient = (accounts: AccountInput[] = []) => {
    counter += 1;
    const id = `6f1c2c38-3a56-4c43-9a3d-${String(counter).padStart(12, "0")}`;
    chart.initializeClient(id);
    accounts.forEach((account) => {
      if (!chart.findByCode(id, account.code)) chart.create(id, account);
    });
    return id;
  };
  return { chart, templates, newClient };
};

const ownAccounts = (accounts: Account[]) =>
  accounts
    .filter((account) => account.systemKey === null)
    .map(({ code, name, type }) => ({ code, name, type }));

describe("AccountTemplateService", () => {
  it("copies a client's own accounts into an empty client exactly", () => {
    fc.assert(
      fc.property(accountListArb.filter((list) => list.some((a) => a.code !== "1999")), (accounts) => {
        const { chart, templates, newClient } = setup();
        const source = newClient(accounts);
        const target = newClient();

        templates.saveFromClient(source);
        templates.importIntoClient(target);

        expect(ownAccounts(chart.list(target))).toEqual(ownAccounts(chart.list(source)));
      }),
    );
  });

  it("adds nothing when imported a second time", () => {
    fc.assert(
      fc.property(accountListArb, accountListArb, (master, existing) => {
        const { chart, templates, newClient } = setup();
        const source = newClient(master);
        if (ownAccounts(chart.list(source)).length === 0) return;
        templates.saveFromClient(source);
        const target = newClient(existing);

        templates.importIntoClient(target);
        const afterFirst = chart.list(target);
        const second = templates.importIntoClient(target);

        expect(second.added).toBe(0);
        expect(chart.list(target)).toEqual(afterFirst);
      }),
    );
  });

  it("never changes accounts the client already has, and counts every template account", () => {
    fc.assert(
      fc.property(accountListArb, accountListArb, (master, existing) => {
        const { chart, templates, newClient } = setup();
        const source = newClient(master);
        const saved = ownAccounts(chart.list(source));
        if (saved.length === 0) return;
        templates.saveFromClient(source);
        const target = newClient(existing);
        const before = chart.list(target);

        const result = templates.importIntoClient(target);
        const after = chart.list(target);

        for (const account of before) {
          expect(after).toContainEqual(account);
        }
        expect(result.added + result.skipped).toBe(saved.length);
        expect(after).toHaveLength(before.length + result.added);
      }),
    );
  });

  it("leaves system accounts out of the template", () => {
    const { templates, newClient } = setup();
    const source = newClient([{ code: "4000", name: "Rent income", type: "revenue" }]);

    expect(templates.saveFromClient(source)).toEqual({
      accountCount: 1,
      savedAt: "2026-11-22T12:00:00.000Z",
    });
  });

  it("explains when there is nothing to save or import", () => {
    const { templates, newClient } = setup();
    const client = newClient();

    expect(templates.info()).toBeNull();
    expect(() => templates.importIntoClient(client)).toThrow(/No master template/);
    expect(() => templates.saveFromClient(client)).toThrow(/no accounts of its own/);
  });
});

describe("JsonFileTemplateStore", () => {
  let workspace: TempClientWorkspace;
  let filePath: string;

  beforeEach(() => {
    workspace = new TempClientWorkspace();
    filePath = path.join(workspace.directory, "templates", "master.json");
  });

  afterEach(() => {
    workspace.dispose();
  });

  it("reads back exactly what it wrote", () => {
    const store = new JsonFileTemplateStore(filePath);
    expect(store.read()).toBeNull();

    fc.assert(
      fc.property(accountListArb, (accounts) => {
        const template = { version: 1 as const, savedAt: "2026-11-22T12:00:00.000Z", accounts };
        store.write(template);
        expect(store.read()).toEqual(template);
      }),
      { numRuns: 30 },
    );
    expect(fs.readdirSync(path.dirname(filePath))).toEqual(["master.json"]);
  });

  it("reports a damaged file instead of importing junk", () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{"version": 1, "accounts": [{"code": ""}]}');

    expect(() => new JsonFileTemplateStore(filePath).read()).toThrow(/damaged/);
  });
});
