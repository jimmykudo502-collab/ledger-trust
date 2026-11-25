import type { AccountInput } from "../../common/accounts/accountSchemas";

/**
 * A made-up rental business used for the demo client and end-to-end tests.
 * None of this is real client data. The bank rows match the sample files in
 * docs/sample-imports.
 */

/** A bank row: positive = money into that tab's account. */
export interface DemoRow {
  readonly date: string;
  readonly description: string;
  readonly amountCents: number;
}

export const DEMO_CLIENT_NAME = "Demo - Maple Street Rentals (made-up)";

export const DEMO_ACCOUNTS: readonly AccountInput[] = [
  { code: "1000", name: "Chequing", type: "asset" },
  { code: "1010", name: "Savings", type: "asset" },
  { code: "1500", name: "Building", type: "asset" },
  { code: "1510", name: "Accumulated depreciation - building", type: "asset" },
  { code: "2100", name: "Visa", type: "liability" },
  { code: "2500", name: "Mortgage payable", type: "liability" },
  { code: "3000", name: "Owner's capital", type: "equity" },
  { code: "3900", name: "Retained earnings", type: "equity" },
  { code: "4000", name: "Rental income", type: "revenue" },
  { code: "4010", name: "Late fees", type: "revenue" },
  { code: "4900", name: "Interest income", type: "revenue" },
  { code: "5100", name: "Repairs and maintenance", type: "expense" },
  { code: "5200", name: "Utilities", type: "expense" },
  { code: "5300", name: "Property tax", type: "expense" },
  { code: "5400", name: "Insurance", type: "expense" },
  { code: "5500", name: "Mortgage interest", type: "expense" },
  { code: "5600", name: "Bank charges", type: "expense" },
  { code: "5700", name: "Advertising", type: "expense" },
  { code: "5800", name: "Professional fees", type: "expense" },
  { code: "5900", name: "Vehicle and travel", type: "expense" },
  { code: "5950", name: "Office supplies", type: "expense" },
  { code: "6000", name: "Depreciation", type: "expense" },
  { code: "6100", name: "Snow removal", type: "expense" },
];

/**
 * Each demo account's line on the internal and external FS maps (FR-34):
 * account code → [internal map number, external map number]. The map lines
 * are the starter lines (FR-35).
 */
export const DEMO_FS_MAP: readonly [string, string, string][] = [
  ["1000", "1000", "100"],
  ["1010", "1000", "100"],
  ["1500", "1500", "150"],
  ["1510", "1590", "150"],
  ["1999", "1300", "120"],
  ["2100", "2100", "200"],
  ["2500", "2500", "250"],
  ["3000", "3000", "300"],
  ["3900", "3900", "390"],
  ["4000", "4000", "400"],
  ["4010", "4100", "400"],
  ["4900", "7000", "700"],
  ["5100", "6600", "600"],
  ["5200", "6700", "600"],
  ["5300", "6500", "600"],
  ["5400", "6200", "610"],
  ["5500", "7500", "750"],
  ["5600", "6100", "610"],
  ["5700", "6000", "610"],
  ["5800", "6400", "610"],
  ["5900", "6800", "610"],
  ["5950", "6300", "610"],
  ["6000", "6900", "690"],
  ["6100", "6600", "600"],
];

/** Remembered coding rules (FR-18): description text → account code. */
export const DEMO_RULES: readonly [string, string][] = [
  ["RENT", "4000"],
  ["LATE FEE", "4010"],
  ["MORTGAGE", "2500"],
  ["PROPERTY TAX", "5300"],
  ["HYDRO", "5200"],
  ["GAS CO", "5200"],
  ["INSURANCE", "5400"],
  ["ACCOUNT FEE", "5600"],
  ["HOME HARDWARE", "5100"],
  ["PLUMBING", "5100"],
  ["ELECTRIC", "5100"],
  ["PAINT", "5100"],
  ["APPLIANCE", "5100"],
  ["LOCKSMITH", "5100"],
  ["SNOW REMOVAL", "6100"],
  ["ACCOUNTING", "5800"],
  ["INTEREST", "4900"],
  ["GAS STATION", "5900"],
  ["OFFICE SUPPLY", "5950"],
  ["ADVERTISING", "5700"],
];

const cents = (dollars: number) => Math.round(dollars * 100);

const chequingRows = (): DemoRow[] => {
  const rows: DemoRow[] = [];
  const add = (date: string, description: string, dollars: number) => rows.push({ date, description, amountCents: cents(dollars) });
  for (const [month, label] of [["01", "JAN"], ["02", "FEB"], ["03", "MAR"]] as const) {
    const m = Number(month);
    add(`2026-${month}-01`, "E-TRANSFER RECEIVED J SMITH RENT UNIT 1", 1450);
    add(`2026-${month}-01`, "E-TRANSFER RECEIVED A PATEL RENT UNIT 2", 1325);
    add(`2026-${month}-02`, "MOBILE DEPOSIT - RENT UNIT 3", 1500);
    add(`2026-${month}-03`, "PRE-AUTH DEBIT MAPLE TRUST MORTGAGE", -2150);
    add(`2026-${month}-05`, "PRE-AUTH DEBIT CITY OF EXAMPLE PROPERTY TAX", -312.5);
    add(`2026-${month}-08`, "PRE-AUTH DEBIT HYDRO EXAMPLE", -96 - m * 7.15);
    add(`2026-${month}-10`, "PRE-AUTH DEBIT EXAMPLE GAS CO", -142 + m * 11.3);
    add(`2026-${month}-15`, "PRE-AUTH DEBIT NORTHSTAR INSURANCE", -145);
    add(`2026-${month}-15`, "TRANSFER TO SAVINGS 9876", -500);
    add(`2026-${month}-28`, "PAYMENT - VISA 4512", -(240 + m * 35.55));
    add(`2026-${month}-${month === "02" ? "28" : "31"}`, `MONTHLY ACCOUNT FEE ${label}`, -4.95);
  }
  add("2026-01-12", "POS PURCHASE HOME HARDWARE #221", -213.77);
  add("2026-01-19", "CHEQUE #101 - ABC PLUMBING", -385);
  add("2026-01-22", "POS PURCHASE PAINT & DECOR", -96.42);
  add("2026-02-06", "E-TRANSFER SENT - SNOW REMOVAL CO", -180);
  add("2026-02-09", "POS PURCHASE HOME HARDWARE #221", -58.13);
  add("2026-02-17", "E-TRANSFER RECEIVED A PATEL LATE FEE", 50);
  add("2026-02-20", "CHEQUE #102 - BRIGHT ELECTRIC", -460);
  add("2026-03-04", "E-TRANSFER SENT - SNOW REMOVAL CO", -180);
  add("2026-03-11", "POS PURCHASE APPLIANCE DEPOT", -899.99);
  add("2026-03-18", "ONLINE PAYMENT - EXAMPLE ACCOUNTING", -275);
  add("2026-03-25", "INTEREST PAID", 1.84);
  return rows.sort((a, b) => a.date.localeCompare(b.date));
};

const savingsRows = (): DemoRow[] =>
  [
    ["2026-01-16", "TRANSFER FROM CHEQUING 1234", 500],
    ["2026-01-31", "INTEREST PAID", 0.62],
    ["2026-02-16", "TRANSFER FROM CHEQUING 1234", 500],
    ["2026-02-28", "INTEREST PAID", 1.24],
    ["2026-03-16", "TRANSFER FROM CHEQUING 1234", 500],
    ["2026-03-31", "INTEREST PAID", 1.87],
  ].map(([date, description, dollars]) => ({ date: date as string, description: description as string, amountCents: cents(dollars as number) }));

/** Visa rows as money in/out of the card account: charges are money out. */
const visaRows = (): DemoRow[] =>
  [
    ["2026-01-06", "HOME HARDWARE #221", -84.12],
    ["2026-01-14", "GAS STATION 42", -61.2],
    ["2026-01-21", "OFFICE SUPPLY DEPOT", -38.45],
    ["2026-01-29", "PAYMENT - THANK YOU", 275.55],
    ["2026-02-03", "ONLINE ADVERTISING", -126.4],
    ["2026-02-18", "HOME HARDWARE #221", -142.3],
    ["2026-03-02", "PAYMENT - THANK YOU", 311.1],
    ["2026-03-09", "LOCKSMITH EXAMPLE", -165],
    ["2026-03-22", "GAS STATION 42", -58.75],
    ["2026-03-30", "PAYMENT - THANK YOU", 346.65],
  ].map(([date, description, dollars]) => ({ date: date as string, description: description as string, amountCents: cents(dollars as number) }));

/** Each tab's made-up rows, keyed by the tab's ledger account code. */
export const DEMO_TABS: readonly { name: string; kind: "bank" | "credit_card"; code: string; rows: () => DemoRow[] }[] = [
  { name: "Chequing", kind: "bank", code: "1000", rows: chequingRows },
  { name: "Savings", kind: "bank", code: "1010", rows: savingsRows },
  { name: "Visa", kind: "credit_card", code: "2100", rows: visaRows },
];

/** Rows on or before this date are posted in the demo; later ones wait in staging. */
export const DEMO_POSTED_THROUGH = "2026-03-02";

/** Manual journal entries (FR-25): opening balances and adjustments. */
export const DEMO_ENTRIES: readonly { date: string; description: string; lines: [string, number, number][] }[] = [
  {
    date: "2026-01-01",
    description: "Opening balances",
    lines: [
      ["1000", 800000, 0],
      ["1010", 250000, 0],
      ["1500", 45000000, 0],
      ["2500", 0, 30000000],
      ["3000", 0, 16050000],
    ],
  },
  {
    date: "2026-03-31",
    description: "Reclassify Q1 mortgage interest out of the mortgage payments",
    lines: [
      ["5500", 238500, 0],
      ["2500", 0, 238500],
    ],
  },
  {
    date: "2026-03-31",
    description: "Q1 building depreciation",
    lines: [
      ["6000", 280000, 0],
      ["1510", 0, 280000],
    ],
  },
];
