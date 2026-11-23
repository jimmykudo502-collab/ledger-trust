import { randomUUID } from "node:crypto";

import {
  columnMappingSchema,
  type ColumnMapping,
  type ImportSource,
  type PreviewRow,
  type SheetAnalysis,
  type SheetRef,
  type StageResult,
} from "../../common/imports/importSchemas";
import type { ImportSourceKind } from "../../common/staging/stagingSchemas";
import { UserFacingError } from "../errors";
import { detectMapping } from "../import/columnDetection";
import { flagDuplicates } from "../import/duplicates";
import { parseRows, type ParsedRow } from "../import/rowParsing";
import type { RawSheet, SpreadsheetReader } from "../import/SpreadsheetReader";
import type { StagingRepository } from "../repositories/StagingRepository";
import type { BankAccountService } from "./BankAccountService";
import type { RuleSuggester } from "./CodingRuleService";

/** Gives the staging repository for one client. */
export type StagingRepositoryProvider = (clientId: string) => StagingRepository;

interface OpenSource {
  readonly name: string;
  readonly kind: ImportSourceKind;
  readonly sheets: readonly RawSheet[];
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_OPEN_SOURCES = 10;
const SAMPLE_ROWS = 12;

/**
 * Runs an import into a bank account tab (FR-11 to FR-14): open a file or
 * pasted text, suggest a column mapping, preview the rows with problems and
 * duplicate warnings, and stage the chosen rows. Opened sources stay in the
 * main process (keyed by a token) so the renderer never handles raw files.
 */
export class ImportService {
  private readonly sources = new Map<string, OpenSource>();

  /**
   * @param reader Reads spreadsheets and pasted text.
   * @param bankAccounts Resolves the tab being imported into.
   * @param stagingFor Returns the staging repository for a client.
   * @param rules Codes new rows from remembered rules (FR-18).
   * @param newToken Source of tokens (injectable for tests).
   */
  public constructor(
    private readonly reader: SpreadsheetReader,
    private readonly bankAccounts: BankAccountService,
    private readonly stagingFor: StagingRepositoryProvider,
    private readonly rules: RuleSuggester,
    private readonly newToken: () => string = randomUUID,
  ) {}

  /**
   * Opens a spreadsheet file.
   * @param fileName The file's name, used to tell .xlsx from .ods.
   * @param bytes The file's contents.
   */
  public openFile(fileName: string, bytes: Uint8Array): ImportSource {
    const extension = fileName.toLowerCase().split(".").pop();
    if (extension !== "xlsx" && extension !== "ods") {
      throw new UserFacingError("Choose an Excel (.xlsx) or LibreOffice (.ods) file.");
    }
    if (bytes.length > MAX_FILE_BYTES) {
      throw new UserFacingError("That file is larger than 25 MB, which is too big for a bank statement.");
    }
    return this.remember({ name: fileName, kind: extension, sheets: this.reader.readFile(bytes) });
  }

  /**
   * Opens pasted rows.
   * @param text Tab- or comma-separated rows.
   */
  public openPaste(text: string): ImportSource {
    return this.remember({ name: "Pasted text", kind: "paste", sheets: this.reader.readText(text) });
  }

  /**
   * Suggests how to read a sheet and returns its first rows for display.
   * @param ref The opened source, sheet, client and tab.
   */
  public analyze(ref: SheetRef): SheetAnalysis {
    const bankAccount = this.bankAccounts.require(ref.clientId, ref.bankAccountId);
    const sheet = this.sheet(ref);
    const { mapping, dateOrderAmbiguous } = detectMapping(sheet.rows, bankAccount.kind);
    return {
      sampleRows: sheet.rows.slice(0, SAMPLE_ROWS),
      columnCount: Math.max(0, ...sheet.rows.map((row) => row.length)),
      suggestedMapping: mapping,
      dateOrderAmbiguous,
    };
  }

  /**
   * Reads every row with a mapping, flagging problems and rows already
   * imported into this tab.
   * @param ref The opened source, sheet, client and tab.
   * @param mapping Which columns hold what.
   */
  public preview(ref: SheetRef, mapping: ColumnMapping): PreviewRow[] {
    this.bankAccounts.require(ref.clientId, ref.bankAccountId);
    const parsed = parseRows(this.sheet(ref).rows, columnMappingSchema.parse(mapping));
    const existing = this.stagingFor(ref.clientId).existingTransactions(ref.bankAccountId);
    const duplicates = flagDuplicates(parsed.map(toStagedRow), existing);
    return parsed.map((row, index) => ({ ...row, duplicate: duplicates[index] }));
  }

  /**
   * Stages the importable rows, leaving out any the user excluded (FR-13),
   * and codes them with any matching remembered rule (FR-18). Nothing
   * reaches the ledger until the rows are posted.
   * @param ref The opened source, sheet, client and tab.
   * @param mapping Which columns hold what.
   * @param excludedRows Spreadsheet row numbers not to import.
   */
  public stage(ref: SheetRef, mapping: ColumnMapping, excludedRows: readonly number[]): StageResult {
    const source = this.source(ref.token);
    const excluded = new Set(excludedRows);
    const suggest = this.rules.suggester(ref.clientId, ref.bankAccountId);
    const rows = this.preview(ref, mapping)
      .filter((row) => row.problem === null && !excluded.has(row.rowNumber))
      .map((row) => ({ ...toStagedRow(row), rowNumber: row.rowNumber, offsetAccountId: suggest(row.description) }));
    if (rows.length === 0) {
      throw new UserFacingError("There are no rows to import. Check the column choices or the rows you left out.");
    }
    const batchId = this.stagingFor(ref.clientId).insertBatch(
      ref.bankAccountId,
      { kind: source.kind, name: source.kind === "paste" ? null : source.name },
      rows,
    );
    this.sources.delete(ref.token);
    return { batchId, stagedCount: rows.length };
  }

  /**
   * Forgets an opened source.
   * @param token The source's token.
   */
  public discard(token: string): void {
    this.sources.delete(token);
  }

  private remember(source: OpenSource): ImportSource {
    if (source.sheets.length === 0) {
      throw new UserFacingError("There's nothing to import: no rows were found.");
    }
    // Keep memory bounded if imports are abandoned without being discarded.
    while (this.sources.size >= MAX_OPEN_SOURCES) {
      this.sources.delete(this.sources.keys().next().value);
    }
    const token = this.newToken();
    this.sources.set(token, source);
    return {
      token,
      name: source.name,
      sheets: source.sheets.map((sheet) => ({ name: sheet.name, rowCount: sheet.rows.length })),
    };
  }

  private source(token: string): OpenSource {
    const source = this.sources.get(token);
    if (!source) {
      throw new UserFacingError("This import has expired. Please open the file again.");
    }
    return source;
  }

  private sheet(ref: SheetRef): RawSheet {
    const sheet = this.source(ref.token).sheets[ref.sheetIndex];
    if (!sheet) {
      throw new UserFacingError("That sheet doesn't exist in the file.");
    }
    return sheet;
  }
}

const toStagedRow = (row: ParsedRow) =>
  row.problem === null
    ? { date: row.date, description: row.description, amountCents: row.amountCents }
    : null;
