import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BANK_ACCOUNT_KINDS,
  LEDGER_TYPE_FOR_KIND,
} from "../../common/bankAccounts/bankAccountSchemas";
import { SqliteAccountRepository } from "../repositories/SqliteAccountRepository";
import { SqliteBankAccountRepository } from "../repositories/BankAccountRepository";
import { TempClientWorkspace } from "../testing/TempClientWorkspace";
import { BankAccountService } from "./BankAccountService";
import { ChartOfAccountsService } from "./ChartOfAccountsService";
import { ClientService } from "./ClientService";

let workspace: TempClientWorkspace;
let chart: ChartOfAccountsService;
let bankAccounts: BankAccountService;

const newClient = (): string =>
  new ClientService(workspace.clients, [chart]).create({
    name: "Made-up Rentals",
    fiscalYearEnd: "2026-12-31",
  }).id;

beforeEach(() => {
  workspace = new TempClientWorkspace();
  chart = new ChartOfAccountsService((id) => new SqliteAccountRepository(workspace.pool.get(id)));
  bankAccounts = new BankAccountService(
    (id) => new SqliteBankAccountRepository(workspace.pool.get(id)),
    chart,
  );
});

afterEach(() => {
  workspace.dispose();
});

describe("BankAccountService", () => {
  it("links every tab to its own ledger account of the right type (FR-10)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.constantFrom("Chequing", "Savings", "Visa", "Mastercard"),
            kind: fc.constantFrom(...BANK_ACCOUNT_KINDS),
            code: fc.constantFrom("1000", "1010", "2100", "2110", "1999"),
          }),
          { maxLength: 8 },
        ),
        (inputs) => {
          const clientId = newClient();
          for (const { name, kind, code } of inputs) {
            try {
              bankAccounts.create(clientId, { name, kind, ledger: { mode: "new", code } });
            } catch {
              // Code clashes are expected; the invariants below must still hold.
            }
          }
          const tabs = bankAccounts.list(clientId);
          const accountIds = tabs.map((tab) => tab.accountId);
          expect(new Set(accountIds).size).toBe(accountIds.length);
          for (const tab of tabs) {
            const account = chart.find(clientId, tab.accountId);
            expect(account.type).toBe(LEDGER_TYPE_FOR_KIND[tab.kind]);
            expect(account.systemKey).toBeNull();
            expect(tab.accountCode).toBe(account.code);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it("creates the ledger account with the tab's name", () => {
    const clientId = newClient();
    const tab = bankAccounts.create(clientId, {
      name: "Visa",
      kind: "credit_card",
      ledger: { mode: "new", code: "2100" },
    });

    expect(tab).toMatchObject({
      name: "Visa",
      kind: "credit_card",
      accountCode: "2100",
      accountName: "Visa",
      hasImports: false,
      ledgerBalanceCents: 0,
    });
    expect(chart.findByCode(clientId, "2100")).toMatchObject({ name: "Visa", type: "liability" });
  });

  it("links an existing account only if the type fits and it's free", () => {
    const clientId = newClient();
    const cash = chart.create(clientId, { code: "1000", name: "Chequing", type: "asset" });
    const control = chart.findByCode(clientId, "1999");

    expect(() =>
      bankAccounts.create(clientId, { name: "Visa", kind: "credit_card", ledger: { mode: "existing", accountId: cash.id } }),
    ).toThrow("A credit card must post to a liability account, but 1000 Chequing is an asset account.");
    expect(() =>
      bankAccounts.create(clientId, { name: "X", kind: "bank", ledger: { mode: "existing", accountId: control.id } }),
    ).toThrow(/system account/);

    bankAccounts.create(clientId, { name: "Chequing", kind: "bank", ledger: { mode: "existing", accountId: cash.id } });
    expect(() =>
      bankAccounts.create(clientId, { name: "Again", kind: "bank", ledger: { mode: "existing", accountId: cash.id } }),
    ).toThrow(/already linked to the "Chequing" tab/);
  });

  it("keeps tabs in the order they were added, renames, and removes empty ones", () => {
    const clientId = newClient();
    const first = bankAccounts.create(clientId, { name: "Chequing", kind: "bank", ledger: { mode: "new", code: "1000" } });
    bankAccounts.create(clientId, { name: "Visa", kind: "credit_card", ledger: { mode: "new", code: "2100" } });

    bankAccounts.rename(clientId, first.id, "Main chequing");
    expect(bankAccounts.list(clientId).map((tab) => tab.name)).toEqual(["Main chequing", "Visa"]);

    bankAccounts.delete(clientId, first.id);
    expect(bankAccounts.list(clientId).map((tab) => tab.name)).toEqual(["Visa"]);
    expect(chart.findByCode(clientId, "1000")).toBeDefined();
  });

  it("refuses to remove a tab with imports", () => {
    const clientId = newClient();
    const tab = bankAccounts.create(clientId, { name: "Chequing", kind: "bank", ledger: { mode: "new", code: "1000" } });
    workspace.pool
      .get(clientId)
      .prepare("INSERT INTO import_batches (bank_account_id, source_kind) VALUES (?, 'paste')")
      .run(tab.id);

    expect(() => bankAccounts.delete(clientId, tab.id)).toThrow(/has imported transactions/);
  });

  it("explains why a linked ledger account can't be deleted", () => {
    const clientId = newClient();
    const tab = bankAccounts.create(clientId, { name: "Chequing", kind: "bank", ledger: { mode: "new", code: "1000" } });

    expect(() => chart.delete(clientId, tab.accountId)).toThrow(/still in use/);
  });
});
