import { app, BrowserWindow, ipcMain } from "electron";
import dotenv from "dotenv";
import path from "node:path";
import started from "electron-squirrel-startup";
import { createBackend } from "./backend/createBackend";
import { registerAccountTemplateHandlers } from "./backend/ipc/AccountTemplateHandlers";
import { registerBankAccountHandlers } from "./backend/ipc/BankAccountHandlers";
import { registerChartOfAccountsHandlers } from "./backend/ipc/ChartOfAccountsHandlers";
import { registerClientHandlers } from "./backend/ipc/ClientHandlers";
import { registerCodingRuleHandlers } from "./backend/ipc/CodingRuleHandlers";
import { registerImportHandlers } from "./backend/ipc/ImportHandlers";
import { registerJournalEntryHandlers } from "./backend/ipc/JournalEntryHandlers";
import { registerReportHandlers } from "./backend/ipc/ReportHandlers";
import { registerStagingHandlers } from "./backend/ipc/StagingHandlers";
import { registerTransferHandlers } from "./backend/ipc/TransferHandlers";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Ledger Trust",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools in their own window so the app keeps its full width.
  mainWindow.webContents.openDevTools({ mode: "detach" });
};

// LEDGER_TRUST_DATA_DIR lets tests and demos use a scratch folder instead of
// the real client data.
const backend = createBackend(
  process.env.LEDGER_TRUST_DATA_DIR ?? app.getPath("userData"),
);

registerClientHandlers(ipcMain, backend.clients);
registerChartOfAccountsHandlers(ipcMain, backend.chartOfAccounts);
registerAccountTemplateHandlers(ipcMain, backend.accountTemplates);
registerBankAccountHandlers(ipcMain, backend.bankAccounts);
registerImportHandlers(ipcMain, backend.imports);
registerStagingHandlers(ipcMain, backend.staging, backend.coding, backend.posting);
registerCodingRuleHandlers(ipcMain, backend.codingRules);
registerTransferHandlers(ipcMain, backend.transfers);
registerJournalEntryHandlers(ipcMain, backend.manualEntries);
registerReportHandlers(ipcMain, backend.reports);

app.on("will-quit", () => {
  backend.dispose();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
