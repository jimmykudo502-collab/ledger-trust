# Bookkeeping App: Phase 1 Product Requirements

Draft v0.2 · Prepared 22 November 2026 · Status: for review

## 1. Overview

A local desktop app (Electron.js) for a bookkeeper who keeps the books of other people's businesses. The core idea: open a client, upload their bank write-up (Excel or LibreOffice Calc), code the transactions, post them, and immediately have an updated general ledger, trial balance, and financial statements.

### Success criteria

- A bank file for one client can be imported, coded, and posted in a single sitting.
- Reports reflect new postings immediately, with no separate refresh or rebuild step.
- Any report can be run for any date range and exported as PDF or Excel.
- All client data stays on the user's own computer.

## 2. Users and scope

- **User:** a single user, the bookkeeper. No logins and no multi-user support.
- **Clients:** other people's businesses. There is one client today (a rental business), but the app must support many through a client list.
- **Source of data:** bank and credit card write-ups. Anything that is not on a bank statement is entered as a manual journal entry.

## 3. Core workflow

1. Select or create a client.
2. Open a bank account tab and upload the bank write-up (file upload or copy-paste).
3. The app detects the date, description, and amount(s) and stages the rows.
4. The user enters an account code on each row. The code is the offsetting account; the bank account is always the other side.
5. The user posts. Balanced journal entries are created.
6. The user views or exports the reports.

## 4. Functional requirements

### 4.1 Clients

- **FR-1** Client list: create, open, rename, and archive clients.
- **FR-2** Each client's data is fully separate: its own chart of accounts, bank accounts, journal, and periods.
- **FR-3** Each client has its own fiscal year-end, set when the client is created and changeable later. Year-ends can differ between clients. It is entered as a full date (the last day of the current fiscal year, e.g. December 31, 2026); later years end on the same month and day.

### 4.2 Chart of accounts

- **FR-4** One chart of accounts per client, with as many accounts as the user wants to create. A new client starts with a blank chart of accounts, and a master template can be imported to populate it.
- **FR-5** Each account has a code, a name, and a type (asset, liability, equity, revenue, expense). The type is needed to build the balance sheet and income statement.
- **FR-6** If a code is typed in the code column that does not exist yet, the app creates the account (prompting for its name and type).
- **FR-7** Every client includes a Bank Transfer Control account. It is created automatically as an asset with code 1999; it can be renamed or recoded but not deleted or retyped.
- **FR-8** Proposed: accounts with posted activity cannot be deleted.

### 4.3 Bank accounts (tabs)

- **FR-9** A client can have multiple bank accounts and credit cards. Each one is a separate tab.
- **FR-10** Each tab is linked to its own ledger account (for example Chequing, Savings, Visa). Everything uploaded in a tab posts against that account.

### 4.4 Import

- **FR-11** Accept .xlsx and .ods files, and pasted text.
- **FR-12** Auto-detect the date, description, and amount columns. Handle both a single signed amount column and separate debit/credit columns. The user can confirm or adjust the mapping. The heading row and date format (month-first, day-first or year-first) are detected too and can be changed; for credit cards a positive amount defaults to a charge (money out).
- **FR-13** Imported rows go to a staging area. Nothing reaches the ledger until posted.
- **FR-14** Warn when an imported row matches an existing one (same account, date, amount, and description), so overlapping statements do not double-post. Matching ignores case and spacing in the description and is one-to-one, so genuine repeats within a statement still come through; flagged rows start unticked and can be included.

### 4.5 Coding

- **FR-15** A grid shows date, description, amount, and an editable code column.
- **FR-16** The debit/credit direction comes from the sign of the amount: money in debits the bank account and credits the coded account; money out credits the bank account and debits the coded account. (Credit card tabs follow the same logic using the card's account type.)
- **FR-17** Rows without a code cannot be posted.
- **FR-18** Remembered rules such as "description contains X, use code Y", applied automatically on later imports. A rule applies to one tab or every tab; when several match, the longest text wins, then the tab-specific rule, then the newest. Rules never overwrite a code already entered.

### 4.6 Transfers between a client's own accounts

- **FR-19** The app detects matching pairs across tabs (same amount, opposite direction, dates no more than about 3 to 4 days apart) and codes both sides to the Bank Transfer Control account.
- **FR-20** The control account should net to zero. A review screen shows its balance and any unmatched items so the user can confirm which belong and which do not.

### 4.7 Posting

- **FR-21** Posting creates balanced double-entry journal entries from the coded rows.
- **FR-22** Each journal entry stays linked to its source row for traceability.
- **FR-23** Posted entries appear in the ledger and reports immediately.

### 4.8 Manual journal entries

- **FR-24** A journal entry screen with a date, a description, and two or more debit/credit lines. Debits must equal credits before it can be posted.
- **FR-25** Used for corrections, non-cash transactions, opening balances, and adjustments.

### 4.9 Periods, corrections, and year-end

- **FR-26** While a period is open, the user can edit or delete entries freely. A posted bank row can be unposted: its entry is removed and the row returns to staging with its code.
- **FR-27** The user can lock a period. Once a year is locked and rolled forward, changes can only be made with reversing entries, so the original remains visible in the ledger. A locked year can be unlocked again if needed.
- **FR-28** Year-end close and roll-forward: lock the year, close revenue and expense accounts into retained earnings, and carry the balance sheet balances into the new year as opening balances.

### 4.10 Reports (core)

- **FR-29** Trial balance, general ledger, balance sheet, and income statement.
- **FR-30** Every report can be run for any date range the user chooses.
- **FR-31** All reports are derived from posted journal lines only, so they are always consistent with each other.

### 4.11 Export

- **FR-32** Every report exports to PDF and to Excel, ready to send to a client. Each export shows the client name, the report title, and the period.

## 5. Data model (high level)

Core entities: Client, Account, BankAccount (linked to an Account), ImportBatch, StagedTransaction, JournalEntry, JournalLine, and FiscalYear/Period.

**Guiding principle:** the journal is the single source of truth. The general ledger, trial balance, and financial statements are views computed from it, never stored separately.

**Storage:** one SQLite file per client.

## 6. Non-functional requirements

- **Local only.** No internet connection is required and no client data leaves the machine.
- **Backup.** Backing up a client means copying its single data file. Proposed: a built-in backup/export function.
- **Integrity.** Debits must equal credits on every entry, enforced by the app.
- **Platform.** Windows first.

## 7. Technology

- Electron.js on Node.js (LTS) for the desktop app.
- SQLite through the better-sqlite3 library for storage (confirmed).
- SheetJS to read .xlsx and .ods files and to write Excel reports.
- Electron's built-in print-to-PDF for PDF reports.

## 8. Out of scope for Phase 1

- A/R aging, A/P aging, and sales by customer. These need customer and invoice data that a bank write-up does not contain.
- Invoicing and bill entry, payroll, sales tax, and inventory.
- Multi-user access, cloud sync, automatic bank feeds, bank reconciliation, and multiple currencies per client.

## 9. Decisions and open questions

### Decided

- Fiscal year: custom year-end per client.
- Storage: SQLite, one file per client.
- Currency: one currency per client for now; multiple currencies come later.
- Duplicate detection and remembered coding rules: included in Phase 1.
- Imports: rows that can't be read (bad date or amount) are shown with the reason and never staged. An import can be removed from staging until any of its rows is posted. Bank tabs post to an asset account, credit card tabs to a liability account.
- Bank reconciliation: after Phase 1, once transactions are being booked.
- Unlocking: a locked year can be unlocked.
- Transfer matching window: about 3 to 4 days (implemented as at most 4 days apart).
- Transfer matching: after every import, pairs whose rows each have exactly one possible partner are matched automatically and both sides coded to Bank Transfer Control; rows with several possible partners are offered as suggestions on the Transfers tab. Only uncoded staged rows, or rows already coded to the control account, are considered, so rows coded or posted to another account are never changed. Any match can be undone.
- New clients: blank chart of accounts, with a master template that can be imported.
- Master template: one master chart of accounts kept in the app. The user saves any client's chart (minus system accounts) as the master and imports it into other clients; codes the client already uses are skipped. Importing a template from Excel may follow with the import phase.
- Fiscal year-end is stored as the full date of the current fiscal year's end (`YYYY-MM-DD`). When rolling forward, a February 29 year-end becomes the last day of February in non-leap years.
- Accounts with posted entries keep their type, so past statements don't change.

### Still open

1. First client's fiscal year-end date.
2. Unlocked years: when a rolled-forward year is unlocked and changed, how should the next year's opening balances update?

## 10. Suggested build order

1. Project setup and database.
2. Clients and chart of accounts.
3. Bank account tabs and import.
4. Coding grid and posting.
5. Transfer matching and the control account review.
6. Manual journal entries.
7. Reports: trial balance, general ledger, balance sheet, income statement.
8. Period lock, year-end close, and roll-forward.
9. PDF and Excel export.
10. Testing with made-up client data before any real files are used.
