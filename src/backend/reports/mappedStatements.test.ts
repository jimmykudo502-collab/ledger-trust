import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ACCOUNT_TYPES, type AccountType } from "../../common/accounts/accountSchemas";
import { FS_SECTIONS, type FsLine, type FsMap, type FsSection } from "../../common/fsMaps/fsMapSchemas";
import type { MappedSection } from "../../common/reports/mappedStatementSchemas";
import type { AccountBalance } from "../../common/reports/reportSchemas";
import { buildMappedBalanceSheet, buildMappedIncomeStatement, UNMAPPED_LINE_NAME, type FsMapping } from "./mappedStatements";
import { buildBalanceSheet, buildIncomeStatement } from "./reportBuilders";

const RANGE = { from: "2026-01-01", to: "2026-12-31" };

/**
 * Made-up balances that come from a balanced journal: the closing balances
 * of all accounts add up to zero, as do period debits less credits.
 */
const balancesArb = fc
  .array(
    fc.record({
      type: fc.constantFrom(...ACCOUNT_TYPES),
      opening: fc.integer({ min: -1_000_000, max: 1_000_000 }),
      debit: fc.integer({ min: 0, max: 1_000_000 }),
      credit: fc.integer({ min: 0, max: 1_000_000 }),
    }),
    { minLength: 1, maxLength: 15 },
  )
  .map((rows) => {
    const opening = rows.reduce((s, r) => s + r.opening, 0);
    const net = rows.reduce((s, r) => s + r.debit - r.credit, 0);
    // A balancing equity account keeps the "journal" balanced.
    const all = [...rows, { type: "equity" as AccountType, opening: -opening, debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0 }];
    return all.map(
      (r, i): AccountBalance => ({
        accountId: i + 1,
        code: String(1000 + i),
        name: `Account ${i + 1}`,
        type: r.type,
        openingCents: r.opening,
        debitCents: r.debit,
        creditCents: r.credit,
        closingCents: r.opening + r.debit - r.credit,
      }),
    );
  });

/** A random map: some lines, and each account on a random line or none (possibly a misfit). */
const mappingArb = (balances: readonly AccountBalance[], map: FsMap) =>
  fc
    .tuple(
      fc.array(fc.constantFrom(...FS_SECTIONS), { minLength: 1, maxLength: 8 }),
      fc.array(fc.option(fc.nat(20), { nil: undefined }), { minLength: balances.length, maxLength: balances.length }),
    )
    .map(([sections, picks]): FsMapping => {
      const lines: FsLine[] = sections.map((section, i) => ({ id: i + 1, map, code: String(100 + i), name: `Line ${i}`, section, accountCount: 0 }));
      const lineOfAccount = new Map<number, number>();
      balances.forEach((row, i) => {
        const pick = picks[i];
        if (pick !== undefined && pick < lines.length) lineOfAccount.set(row.accountId, lines[pick].id);
      });
      return { map, lines, lineOfAccount };
    });

const scenarioArb = balancesArb.chain((balances) =>
  fc.tuple(fc.constant(balances), mappingArb(balances, "internal"), mappingArb(balances, "external")),
);

const accountsIn = (sections: readonly MappedSection[]) => sections.flatMap((s) => s.lines.flatMap((l) => l.accounts));

describe("mapped statements (FR-36)", () => {
  it("always balance and agree with the account-by-account statements, on either map", () => {
    fc.assert(
      fc.property(scenarioArb, ([balances, internal, external]) => {
        const plainSheet = buildBalanceSheet(RANGE, balances);
        const plainIncome = buildIncomeStatement(RANGE, balances);
        for (const mapping of [internal, external]) {
          const sheet = buildMappedBalanceSheet(RANGE, balances, mapping);
          expect(sheet.totalAssetsCents).toBe(sheet.totalLiabilitiesCents + sheet.totalEquityCents);
          expect(sheet.currentEarningsCents).toBe(plainSheet.currentEarningsCents);

          const income = buildMappedIncomeStatement(RANGE, balances, mapping);
          expect(income.netIncomeCents).toBe(plainIncome.netIncomeCents);

          // Every account with an amount shows up exactly once.
          const shownSheet = accountsIn([...sheet.assets, ...sheet.liabilities, sheet.equity]).map((a) => a.accountId);
          const expectedSheet = [...plainSheet.assets, ...plainSheet.liabilities, ...plainSheet.equity].map((l) => l.accountId);
          expect(shownSheet.sort()).toEqual(expectedSheet.sort());
          const shownIncome = accountsIn([
            income.revenue, income.costOfSales, income.operatingExpenses, income.otherIncome, income.otherExpenses, income.incomeTaxes,
          ]).map((a) => a.accountId);
          expect(shownIncome.sort()).toEqual([...plainIncome.revenue, ...plainIncome.expenses].map((l) => l.accountId).sort());

          // Lines and sections add up.
          for (const section of [...sheet.assets, ...sheet.liabilities, sheet.equity, income.revenue, income.operatingExpenses]) {
            for (const line of section.lines) {
              expect(line.amountCents).toBe(line.accounts.reduce((s, a) => s + a.amountCents, 0));
            }
            expect(section.totalCents).toBe(section.lines.reduce((s, l) => s + l.amountCents, 0));
          }
        }
      }),
    );
  });

  it("matches the account-by-account totals when every account is mapped to a section of its own type", () => {
    const naturalSection: Record<AccountType, FsSection[]> = {
      asset: ["current_assets", "non_current_assets"],
      liability: ["current_liabilities", "non_current_liabilities"],
      equity: ["equity"],
      revenue: ["revenue", "other_income"],
      expense: ["cost_of_sales", "operating_expenses", "other_expenses", "income_taxes"],
    };
    fc.assert(
      fc.property(balancesArb, fc.infiniteStream(fc.nat(3)), (balances, picks) => {
        const lines: FsLine[] = FS_SECTIONS.map((section, i) => ({ id: i + 1, map: "external", code: String(i), name: section, section, accountCount: 0 }));
        const it = picks[Symbol.iterator]();
        const lineOfAccount = new Map(
          balances.map((row) => {
            const options = naturalSection[row.type];
            const section = options[it.next().value % options.length];
            return [row.accountId, FS_SECTIONS.indexOf(section) + 1] as const;
          }),
        );
        const mapping: FsMapping = { map: "external", lines, lineOfAccount };
        const sheet = buildMappedBalanceSheet(RANGE, balances, mapping);
        const plain = buildBalanceSheet(RANGE, balances);
        expect(sheet.totalAssetsCents).toBe(plain.totalAssetsCents);
        expect(sheet.totalLiabilitiesCents).toBe(plain.totalLiabilitiesCents);
        expect(sheet.totalEquityCents).toBe(plain.totalEquityCents);
        expect(sheet.unmappedAccountCount).toBe(0);
        const income = buildMappedIncomeStatement(RANGE, balances, mapping);
        const plainIncome = buildIncomeStatement(RANGE, balances);
        expect(income.revenue.totalCents + income.otherIncome.totalCents).toBe(plainIncome.totalRevenueCents);
      }),
    );
  });

  it("rolls accounts into lines and puts unmapped or misfit accounts in a catch-all line", () => {
    const row = (accountId: number, code: string, type: AccountType, closingCents: number): AccountBalance => ({
      accountId, code, name: `A${code}`, type, openingCents: 0, debitCents: Math.max(closingCents, 0), creditCents: Math.max(-closingCents, 0), closingCents,
    });
    const balances = [
      row(1, "1000", "asset", 50_00),
      row(2, "1010", "asset", 25_00),
      row(3, "1500", "asset", 100_00),
      row(4, "2100", "liability", -40_00),
      row(5, "4000", "revenue", -135_00),
    ];
    const lines: FsLine[] = [
      { id: 10, map: "external", code: "100", name: "Cash", section: "current_assets", accountCount: 2 },
      { id: 11, map: "external", code: "400", name: "Revenue", section: "revenue", accountCount: 0 },
    ];
    // 1500 is unmapped; 2100 is wrongly on an income statement line.
    const mapping: FsMapping = { map: "external", lines, lineOfAccount: new Map([[1, 10], [2, 10], [4, 11]]) };
    const sheet = buildMappedBalanceSheet(RANGE, balances, mapping);
    expect(sheet.assets[0].lines).toEqual([
      expect.objectContaining({ lineId: 10, code: "100", name: "Cash", amountCents: 75_00 }),
      expect.objectContaining({ lineId: null, name: UNMAPPED_LINE_NAME, amountCents: 100_00 }),
    ]);
    expect(sheet.liabilities[0].lines).toEqual([expect.objectContaining({ lineId: null, amountCents: 40_00 })]);
    expect(sheet.unmappedAccountCount).toBe(2);
    expect(sheet.currentEarningsCents).toBe(135_00);
    expect(sheet.totalAssetsCents).toBe(175_00);
  });
});
