import { app, BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { PdfPrinter } from "../services/ExportService";

/**
 * Prints HTML to PDF with Electron's built-in print-to-PDF, in a hidden
 * window with JavaScript turned off. The page is written to a temporary file
 * (deleted afterwards) so large reports aren't limited by URL length.
 */
export class ElectronPdfPrinter implements PdfPrinter {
  /** @inheritdoc */
  public async print(html: string): Promise<Uint8Array> {
    const file = path.join(app.getPath("temp"), `ledger-trust-${randomUUID()}.html`);
    await fs.writeFile(file, html, "utf8");
    const window = new BrowserWindow({
      show: false,
      webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    try {
      await window.loadFile(file);
      return await window.webContents.printToPDF({ pageSize: "Letter", printBackground: true, preferCSSPageSize: true });
    } finally {
      window.destroy();
      await fs.rm(file, { force: true });
    }
  }
}
