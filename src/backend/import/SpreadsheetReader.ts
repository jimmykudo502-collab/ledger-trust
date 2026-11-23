import * as XLSX from "xlsx";

import type { Cell } from "../../common/imports/importSchemas";
import { UserFacingError } from "../errors";

/** A sheet read into plain rows of cells. */
export interface RawSheet {
  readonly name: string;
  readonly rows: Cell[][];
}

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 100;
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Reads .xlsx and .ods files and pasted text into rows of cells (FR-11),
 * using SheetJS. Date cells become `YYYY-MM-DD` text taken from the
 * spreadsheet's own date code, so the computer's time zone can't shift them.
 */
export class SpreadsheetReader {
  /**
   * Reads a spreadsheet file.
   * @param bytes The file's contents.
   * @returns Every sheet that has at least one non-empty row.
   * @throws UserFacingError if the file can't be read as a spreadsheet.
   */
  public readFile(bytes: Uint8Array): RawSheet[] {
    // .xlsx and .ods files are both ZIP archives.
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    if (!isZip) {
      throw new UserFacingError(
        "That file couldn't be read. Choose an Excel (.xlsx) or LibreOffice (.ods) spreadsheet.",
      );
    }
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(bytes, { type: "buffer", cellNF: true, cellDates: false, dense: false });
    } catch {
      throw new UserFacingError(
        "That file couldn't be read. Choose an Excel (.xlsx) or LibreOffice (.ods) spreadsheet.",
      );
    }
    return this.toSheets(workbook);
  }

  /**
   * Reads pasted rows: tab-separated (as copied from a spreadsheet) or
   * comma-separated text.
   * @param text The pasted text.
   */
  public readText(text: string): RawSheet[] {
    const workbook = XLSX.read(text, { type: "string", raw: true });
    return this.toSheets(workbook);
  }

  private toSheets(workbook: XLSX.WorkBook): RawSheet[] {
    return workbook.SheetNames.map((name) => ({
      name,
      rows: this.readSheet(workbook.Sheets[name]),
    })).filter((sheet) => sheet.rows.length > 0);
  }

  private readSheet(sheet: XLSX.WorkSheet): Cell[][] {
    if (!sheet["!ref"]) {
      return [];
    }
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const lastRow = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
    const lastColumn = Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1);
    const rows: Cell[][] = [];
    for (let r = range.s.r; r <= lastRow; r += 1) {
      const row: Cell[] = [];
      for (let c = range.s.c; c <= lastColumn; c += 1) {
        row.push(toCell(sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined));
      }
      while (row.length > 0 && row[row.length - 1] === null) {
        row.pop();
      }
      rows.push(row);
    }
    while (rows.length > 0 && rows[rows.length - 1].length === 0) {
      rows.pop();
    }
    return rows;
  }
}

const toCell = (cell: XLSX.CellObject | undefined): Cell => {
  if (!cell || cell.v === undefined || cell.v === null) {
    return null;
  }
  switch (cell.t) {
    case "n": {
      const value = cell.v as number;
      if (typeof cell.z === "string" && XLSX.SSF.is_date(cell.z)) {
        const parts = XLSX.SSF.parse_date_code(value);
        return parts ? `${String(parts.y).padStart(4, "0")}-${pad(parts.m)}-${pad(parts.d)}` : value;
      }
      return value;
    }
    case "d": {
      const date = cell.v as Date;
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    case "s": {
      const text = String(cell.v).trim();
      return text === "" ? null : text;
    }
    case "b":
      return cell.v ? "TRUE" : "FALSE";
    default:
      return null;
  }
};
