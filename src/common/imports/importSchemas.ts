import { z } from "zod";

import { bankAccountIdSchema } from "../bankAccounts/bankAccountSchemas";
import { clientIdSchema, type ClientId } from "../clients/clientSchemas";
import { isoDateSchema } from "../dates";

/** How all-numeric dates such as 01/05/2026 are written in an import. */
export const DATE_ORDERS = ["MDY", "DMY", "YMD"] as const;
export const dateOrderSchema = z.enum(DATE_ORDERS);
export type DateOrder = z.infer<typeof dateOrderSchema>;

export const DATE_ORDER_LABELS: Record<DateOrder, string> = {
  MDY: "Month/Day/Year",
  DMY: "Day/Month/Year",
  YMD: "Year/Month/Day",
};

/**
 * A spreadsheet cell after reading: text, a number, or empty. Date cells are
 * already turned into `YYYY-MM-DD` text.
 */
export type Cell = string | number | null;

const columnSchema = z.number().int().min(0).max(255);

/** Where the amount comes from (FR-12). */
export const amountMappingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("signed"),
    column: columnSchema,
    /** True if a positive number means money coming into the account. */
    positiveIsMoneyIn: z.boolean(),
  }),
  z.object({
    kind: z.literal("split"),
    moneyInColumn: columnSchema,
    moneyOutColumn: columnSchema,
  }),
]);

/** How to read transactions out of a sheet (FR-12). */
export const columnMappingSchema = z
  .object({
    /** Row index (0-based) of the column headings, or null if there are none. */
    headerRow: z.number().int().min(0).nullable(),
    dateColumn: columnSchema,
    descriptionColumn: columnSchema,
    amount: amountMappingSchema,
    dateOrder: dateOrderSchema,
  })
  .refine(
    (mapping) => {
      const columns = [
        mapping.dateColumn,
        mapping.descriptionColumn,
        ...(mapping.amount.kind === "signed"
          ? [mapping.amount.column]
          : [mapping.amount.moneyInColumn, mapping.amount.moneyOutColumn]),
      ];
      return new Set(columns).size === columns.length;
    },
    { message: "Each column can only be used once." },
  );

export type AmountMapping = z.infer<typeof amountMappingSchema>;
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

/** A transaction read from a row, ready to stage. Amounts: positive = money in. */
export const stagedRowSchema = z.object({
  date: isoDateSchema,
  description: z.string().max(500),
  amountCents: z
    .number()
    .int()
    .refine((cents) => cents !== 0, "Amount is zero.")
    .refine(Number.isSafeInteger, "Amount is too large."),
});

export type StagedRowInput = z.infer<typeof stagedRowSchema>;

/** One row of the import preview. */
export interface PreviewRow {
  /** Spreadsheet row number as the user sees it (1-based). */
  readonly rowNumber: number;
  readonly date: string | null;
  readonly description: string;
  readonly amountCents: number | null;
  /** Why the row can't be imported, or null if it can. */
  readonly problem: string | null;
  /**
   * True if the same transaction (account, date, amount, description) was
   * already imported (FR-14).
   */
  readonly duplicate: boolean;
}

/** A sheet in an opened import source. */
export interface ImportSheet {
  readonly name: string;
  readonly rowCount: number;
}

/** An opened file or pasted text, held in the main process until staged. */
export interface ImportSource {
  readonly token: string;
  /** File name, or "Pasted text". */
  readonly name: string;
  readonly sheets: readonly ImportSheet[];
}

/** What the import screen needs to show a sheet and its suggested mapping. */
export interface SheetAnalysis {
  /** The first rows exactly as read, to show which row holds the headings. */
  readonly sampleRows: readonly (readonly Cell[])[];
  readonly columnCount: number;
  readonly suggestedMapping: ColumnMapping;
  /** True if the dates could be either month-first or day-first. */
  readonly dateOrderAmbiguous: boolean;
}

/** Result of staging an import. */
export interface StageResult {
  readonly batchId: number;
  readonly stagedCount: number;
  /** Transfers between the client's own tabs matched automatically (FR-19). */
  readonly matchedTransfers: number;
}

const tokenSchema = z.uuid();
const sheetIndexSchema = z.number().int().min(0);

export const pasteRequestSchema = z.object({
  text: z.string().min(1, "Paste some rows first.").max(5_000_000),
});

export const analyzeRequestSchema = z.object({
  clientId: clientIdSchema,
  bankAccountId: bankAccountIdSchema,
  token: tokenSchema,
  sheetIndex: sheetIndexSchema,
});

export const previewRequestSchema = analyzeRequestSchema.extend({
  mapping: columnMappingSchema,
});

export const stageRequestSchema = previewRequestSchema.extend({
  /** Row numbers the user chose not to import (e.g. duplicates). */
  excludedRows: z.array(z.number().int().min(1)).max(100_000),
});

export const discardRequestSchema = z.object({ token: tokenSchema });

/** Selects a sheet of an opened source for one client's tab. */
export interface SheetRef {
  clientId: ClientId;
  bankAccountId: number;
  token: string;
  sheetIndex: number;
}

/**
 * The import API the preload script exposes to the renderer as
 * `window.imports`.
 */
export interface ImportsApi {
  /** Shows the open-file dialog; resolves to null if the user cancels. */
  openFile(): Promise<ImportSource | null>;
  /** Reads pasted rows (tab- or comma-separated). */
  openPaste(text: string): Promise<ImportSource>;
  analyze(ref: SheetRef): Promise<SheetAnalysis>;
  preview(ref: SheetRef, mapping: ColumnMapping): Promise<PreviewRow[]>;
  stage(ref: SheetRef, mapping: ColumnMapping, excludedRows: number[]): Promise<StageResult>;
  /** Forgets an opened source without staging it. */
  discard(token: string): Promise<void>;
}
