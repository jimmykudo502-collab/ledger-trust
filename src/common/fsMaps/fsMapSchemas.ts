import { z } from "zod";

import { accountIdSchema, type AccountType } from "../accounts/accountSchemas";
import { clientIdSchema, type ClientId } from "../clients/clientSchemas";

/**
 * Financial statement (FS) maps (FR-33 to FR-36). Each client has two maps,
 * internal and external. A map is a list of numbered FS lines, each in a
 * statement section; every account can be assigned one line per map. The
 * mapped balance sheet and income statement add up accounts by line, so the
 * internal and external statements show the same journal data laid out
 * differently.
 */
export const FS_MAPS = ["internal", "external"] as const;
export type FsMap = (typeof FS_MAPS)[number];

export const FS_MAP_LABELS: Record<FsMap, string> = {
  internal: "Internal",
  external: "External",
};

/** The statement sections an FS line can sit in, in statement order. */
export const FS_SECTIONS = [
  "current_assets",
  "non_current_assets",
  "current_liabilities",
  "non_current_liabilities",
  "equity",
  "revenue",
  "cost_of_sales",
  "operating_expenses",
  "other_income",
  "other_expenses",
  "income_taxes",
] as const;
export type FsSection = (typeof FS_SECTIONS)[number];

/** Which statement a section (or an account type) belongs to. */
export type FsStatement = "balanceSheet" | "incomeStatement";

/** Section facts: label, statement and normal balance (amounts are shown positive in it). */
export const FS_SECTION_INFO: Record<FsSection, { readonly label: string; readonly statement: FsStatement; readonly normal: "debit" | "credit" }> = {
  current_assets: { label: "Current assets", statement: "balanceSheet", normal: "debit" },
  non_current_assets: { label: "Non-current assets", statement: "balanceSheet", normal: "debit" },
  current_liabilities: { label: "Current liabilities", statement: "balanceSheet", normal: "credit" },
  non_current_liabilities: { label: "Non-current liabilities", statement: "balanceSheet", normal: "credit" },
  equity: { label: "Equity", statement: "balanceSheet", normal: "credit" },
  revenue: { label: "Revenue", statement: "incomeStatement", normal: "credit" },
  cost_of_sales: { label: "Cost of sales", statement: "incomeStatement", normal: "debit" },
  operating_expenses: { label: "Operating expenses", statement: "incomeStatement", normal: "debit" },
  other_income: { label: "Other income", statement: "incomeStatement", normal: "credit" },
  other_expenses: { label: "Other expenses", statement: "incomeStatement", normal: "debit" },
  income_taxes: { label: "Income taxes", statement: "incomeStatement", normal: "debit" },
};

/** The statement an account type appears on. */
export const statementOfType = (type: AccountType): FsStatement =>
  type === "revenue" || type === "expense" ? "incomeStatement" : "balanceSheet";

/** Where an account with no FS line shows on a mapped statement. */
export const DEFAULT_SECTION_FOR_TYPE: Record<AccountType, FsSection> = {
  asset: "current_assets",
  liability: "current_liabilities",
  equity: "equity",
  revenue: "revenue",
  expense: "operating_expenses",
};

/**
 * Whether an account of this type can be mapped to a line in this section:
 * balance sheet accounts go on balance sheet lines and revenue and expense
 * accounts on income statement lines, so both statements still balance.
 */
export const canMap = (type: AccountType, section: FsSection): boolean =>
  statementOfType(type) === FS_SECTION_INFO[section].statement;

export const fsMapSchema = z.enum(FS_MAPS);
export const fsSectionSchema = z.enum(FS_SECTIONS);

/** An FS map number, e.g. "1000" or "A100". */
export const fsLineCodeSchema = z
  .string()
  .trim()
  .min(1, "Enter a map number.")
  .max(20, "Map numbers can be at most 20 characters.");

/** The editable fields of an FS line. */
export const fsLineInputSchema = z.object({
  code: fsLineCodeSchema,
  name: z.string().trim().min(1, "Enter a line name.").max(200, "Line names can be at most 200 characters."),
  section: fsSectionSchema,
});
export type FsLineInput = z.infer<typeof fsLineInputSchema>;

/** A line on an FS map. */
export interface FsLine extends FsLineInput {
  readonly id: number;
  readonly map: FsMap;
  /** How many accounts are mapped to it. */
  readonly accountCount: number;
}

/** One account's FS lines (null = not mapped). */
export interface FsAssignment {
  readonly accountId: number;
  readonly internal: number | null;
  readonly external: number | null;
}

/** Every FS line of both maps plus every account's assignment. */
export interface FsMapOverview {
  readonly lines: readonly FsLine[];
  readonly assignments: readonly FsAssignment[];
}

/** Outcome of adding the starter lines to a map. */
export interface StarterLinesResult {
  readonly added: number;
  /** Starter lines skipped because the map already uses their number. */
  readonly skipped: number;
}

export const fsLineIdSchema = z.number().int().positive();

export const fsOverviewRequestSchema = z.object({ clientId: clientIdSchema });
export const createFsLineRequestSchema = z.object({ clientId: clientIdSchema, map: fsMapSchema, line: fsLineInputSchema });
export const updateFsLineRequestSchema = z.object({ clientId: clientIdSchema, lineId: fsLineIdSchema, line: fsLineInputSchema });
export const deleteFsLineRequestSchema = z.object({ clientId: clientIdSchema, lineId: fsLineIdSchema });
export const assignFsLineRequestSchema = z.object({
  clientId: clientIdSchema,
  map: fsMapSchema,
  accountIds: z.array(accountIdSchema).min(1).max(10_000),
  lineId: fsLineIdSchema.nullable(),
});
export const starterLinesRequestSchema = z.object({ clientId: clientIdSchema, map: fsMapSchema });

/** Orders FS lines by section, then by map number (digit runs compared as numbers). */
export const compareFsLines = (a: Pick<FsLine, "section" | "code">, b: Pick<FsLine, "section" | "code">): number =>
  FS_SECTIONS.indexOf(a.section) - FS_SECTIONS.indexOf(b.section) ||
  a.code.localeCompare(b.code, undefined, { numeric: true });

/**
 * The FS map API the preload script exposes to the renderer as
 * `window.fsMaps`.
 */
export interface FsMapsApi {
  overview(clientId: ClientId): Promise<FsMapOverview>;
  createLine(clientId: ClientId, map: FsMap, line: FsLineInput): Promise<FsLine>;
  updateLine(clientId: ClientId, lineId: number, line: FsLineInput): Promise<FsLine>;
  /** Deletes a line; accounts mapped to it become unmapped. */
  deleteLine(clientId: ClientId, lineId: number): Promise<void>;
  /** Maps accounts to a line on one map, or unmaps them with null. */
  assign(clientId: ClientId, map: FsMap, accountIds: readonly number[], lineId: number | null): Promise<void>;
  /** Adds a standard set of lines to a map, skipping numbers already used. */
  addStarterLines(clientId: ClientId, map: FsMap): Promise<StarterLinesResult>;
}
