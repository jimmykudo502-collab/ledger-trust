# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Ledger Trust** is a local, offline desktop bookkeeping app for a single bookkeeper who keeps the books for other people's businesses (clients). The core flow: open a client, import their bank or credit card write-up (.xlsx, .ods or pasted text), code each transaction to an account, post it, and immediately see an updated general ledger, trial balance, balance sheet and income statement, all exportable to PDF and Excel for any date range.

Phase 2 adds internal and external financial statement (FS) maps: each account maps to one numbered FS line per map, and the balance sheet and income statement can be laid out by account, internal FS or external FS from the same journal data.

The full requirements are in [docs/phase-1-prd.md](docs/phase-1-prd.md) (Phase 2 FS maps are section 4.12, FR-33 to FR-37). Read it before planning any feature and reference requirement IDs (`FR-n`) in plans and commit messages.

### Stack

- Electron (Electron Forge + Vite), React 19, TypeScript. Package name is `agentobi`. Windows first.
- Storage: SQLite via `better-sqlite3`, **one database file per client**.
- Spreadsheets: SheetJS to read .xlsx/.ods imports and write Excel reports. PDFs use Electron's built-in print-to-PDF.
- Validation: `zod`. Shared UI state: `zustand` (see State management).
- `better-sqlite3` (13.x) ships Node-API prebuilds that load in both Node (Vitest) and Electron, so there is no native rebuild step: Forge's `rebuildConfig.ignoreModules` skips it and `vite.main.config.ts` marks it external. Client databases use SQLite's default rollback journal, not WAL, so a closed client is one file that can be copied as a backup. Because the Forge Vite plugin only packages `.vite/`, a `packageAfterCopy` hook in `forge.config.ts` copies better-sqlite3's `lib/`, `package.json` and `prebuilds/` into the package, and `AutoUnpackNativesPlugin` keeps the `.node` binary outside the asar.
- SheetJS (`xlsx`) is installed from the official CDN tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), not the outdated npm registry copy. Read files with `cellNF: true` and convert date cells via `XLSX.SSF.parse_date_code`, never JS `Date`, so time zones can't shift dates (see `SpreadsheetReader`).
- `@openrouter/agent` is installed from earlier scaffolding but is **not** part of Phase 1. Don't build features on it, since client data must never leave the machine.

### Domain rules (non-negotiable)

- **Local only:** no network calls, no telemetry, and no client data leaves the machine.
- **The journal is the single source of truth.** The general ledger, trial balance and financial statements are computed from posted journal lines only and never stored separately (FR-31).
- **Every journal entry balances:** total debits equal total credits, enforced in the backend, not just the UI (FR-21, FR-24).
- **Staging before posting:** imported rows sit in staging until posted, and nothing reaches the ledger before that (FR-13). Each journal entry keeps a link to its source row (FR-22).
- **Clients are fully isolated:** separate chart of accounts, bank accounts, journal and periods per client (FR-2).
- **Locked periods are immutable:** changes go through reversing entries so the original stays visible (FR-27).
- Store money as **integer cents**, never floating point; convert only at the import and display edges.

### Phase 1 build order

1. Project setup and database (done)
2. Clients and chart of accounts (done)
3. Bank account tabs and import (done)
4. Coding grid and posting (done)
5. Transfer matching and control account review (done)
6. Manual journal entries (done)
7. Reports: trial balance, general ledger, balance sheet, income statement (done)
8. Period lock, year-end close and roll-forward (done)
9. PDF and Excel export (done)
10. Testing with made-up client data before any real files are used (done: demo client + `src/backend/endToEnd.test.ts`)

Phase 2 so far: FS maps and mapped statements (FR-33 to FR-36, done), trial balance by FS map (FR-37, done).

Treat each step as a phase of a multi-phase plan (see Workflow). Out of scope for Phase 1: A/R and A/P aging, invoicing, payroll, sales tax, inventory, multi-user, cloud sync, bank feeds, bank reconciliation and multi-currency.

### Privacy

Real client financial files must never be committed, logged or pasted into prompts or tests. Use made-up data for fixtures and tests. Made-up statements for manual testing live in `docs/sample-imports/` (covered by `sampleImports.test.ts`). `.env` is git-ignored; never commit it or print its contents.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`, `pnpm-workspace.yaml`). `nodeLinker: hoisted` in `pnpm-workspace.yaml` is required by Electron Forge; packages with install scripts must be listed under `allowBuilds`. `overrides: yauzl: 3.3.1` is there because extract-zip's default yauzl 2.x silently stops part-way through unzipping Electron under Node 26, which broke `pnpm package`.

- `pnpm install` — install dependencies
- `pnpm start` — run the app in dev mode (Vite dev server + Electron, DevTools in a separate window). Set `LEDGER_TRUST_DATA_DIR` to use a scratch data folder instead of `%APPDATA%gentobi`.
- `pnpm lint` — ESLint over `.ts`/`.tsx`
- `pnpm exec tsc --noEmit` — type-check (no dedicated script)
- `pnpm test` — run all tests once (Vitest + fast-check); `pnpm test:watch` for watch mode
- `pnpm package` / `pnpm make` — build distributables into `out/`
- `pnpm run install-app` — build and install the app for the current Windows user (`%LOCALAPPDATA%\Programs\Ledger Trust`) with "Ledger Trust" Desktop and Start menu shortcuts (`scripts/install-local.ps1`). Re-run after changes to update the installed copy. The packaged exe is named Ledger Trust, but package.json's `name` stays `agentobi` so client data stays in `%APPDATA%gentobi`; don't rename it without migrating that folder.

Vitest is pinned to 3.x because the app uses Vite 5 (Vitest 4+ requires Vite 6+). Test config lives in `vitest.config.mts`, which sets a 30s per-test timeout because property tests that create many client databases can pass 5s inside OneDrive.

The repo lives inside OneDrive, which sometimes locks files in `node_modules` mid-run; a test file then fails to load with "resource busy or locked". That is not a code failure: rerun. Always gate commits on the exit codes of `pnpm test && pnpm lint && pnpm exec tsc --noEmit`, never on grepping their output.

## Architecture

```
src/
  main.ts            Electron main process: creates the window, registers IPC handlers
  preload.ts         Preload script: exposes renderer-facing clients via contextBridge
  renderer.tsx       React entry point (mounts into #app in index.html)
  common/            Shared by main and renderer, no Node/Electron imports
    ipc/             APP_CHANNELS and the IpcResult envelope
    <feature>/       zod schemas, types and the window API interface per feature
  backend/           Main-process only
    createBackend.ts Composition root: builds services and their dependencies
    errors.ts        UserFacingError: messages safe to show in the UI
    services/        Business logic as classes (ClientService, ChartOfAccountsService, ...)
    repositories/    Storage interfaces with SQLite and in-memory implementations
    db/              ClientFileStore (one <uuid>.sqlite per client), ClientConnectionPool,
                     ClientDatabaseFactory, MigrationRunner, clientMigrations.ts
    templates/       Master chart of accounts template store (JSON file; v2 also holds FS map lines)
    fsMaps/          Starter FS lines for the internal and external maps (FR-35)
    import/          SpreadsheetReader (SheetJS), columnDetection, rowParsing,
                     importDates, duplicates: pure import logic used by ImportService
    posting/         bankEntryLines (FR-16), pickRule (FR-18), findTransferPairs (FR-19)
    reports/         Pure report builders over per-account balances (FR-29 to FR-31) and
                     mappedStatements (statements and the trial balance rolled up by FS map, FR-36, FR-37)
    exports/         ReportDocument layouts, HTML/Excel renderers, ElectronPdfPrinter (FR-32)
    demo/            Made-up demo client data and DemoClientService (step 10)
    ipc/             Thin handlers registered via handleValidated()
    testing/         Test helpers, e.g. TempClientWorkspace
  frontend/          Renderer side
    ipc/             Preload clients built on invokeResult(), exposed on window
    stores/          Zustand stores plus their pure, tested logic
    components/      React components, grouped by feature
global.d.ts          Types for the window.* APIs exposed by preload
```

Vite configs: `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`; Forge config in `forge.config.ts`.

### Database

- One SQLite file per client, opened with `ClientDatabaseFactory.open(path)` (foreign keys on, schema migrated). Tests use `IN_MEMORY_DATABASE`.
- Schema changes are new entries appended to `CLIENT_MIGRATIONS` in `src/backend/db/clientMigrations.ts` (version = previous + 1, tracked in `PRAGMA user_version`). Never edit a migration that has shipped.
- Tables are `STRICT`; money columns are `INTEGER` cents; dates are `YYYY-MM-DD` text checked with `date(x) IS x`. Journal lines hold a debit or a credit, never both.
- Every journal entry goes through `JournalService.post`, which checks balance, one-sided lines and real accounts (SQLite can't check a multi-row invariant at commit). Never insert journal rows any other way.
- Work that spans repositories (e.g. a journal entry plus its staged row's status) runs inside the injected `TransactionRunner`, so it all commits or all rolls back.
- `FiscalYearService` is the journal's `PeriodGuard`: nothing dated in a locked fiscal year can be posted, replaced or deleted. Only the year-end close/reopen bypass it (`postClosingEntry`, `deleteClosingEntry`).
- FS maps live in `fs_lines` (one row per line, `map` is internal/external) and `account_fs_lines` (one row per account per map; a composite foreign key keeps an account's internal line on the internal map). `FsMapService` enforces that balance sheet accounts only go on balance sheet lines. Mapped statements (`MappedStatementService`) reuse `ReportRepository.balances`; the screen and exports share the row order in `src/common/reports/mappedStatementLayout.ts`.
- Reports never store anything: every report comes from `ReportRepository.balances` (opening before the range, period debits/credits, closing) and `ledgerLines`. Year-end closing entries dated inside the range are left out of period figures unless `includeClosingEntries` is set; the income statement always leaves them out.

### Adding a new IPC feature

Follow the Clients slice (`ClientService` → `ClientHandlers` → `ClientsClient` → `useClientStore`) end to end:

1. Put zod request schemas, types and a `<Feature>Api` interface in `src/common/<feature>/`.
2. Add channel names to `APP_CHANNELS` in `src/common/ipc/AppChannels.ts` (format `app:camelCaseName`).
3. Implement the logic in a service class under `src/backend/services/` with dependencies injected; wire it in `createBackend.ts`. Throw `UserFacingError` for messages the user should see.
4. Register handlers in `src/backend/ipc/<Feature>Handlers.ts` with `handleValidated(ipcMain, channel, schema, fn)`, which validates the request and returns an `IpcResult`; call `register<Feature>Handlers(ipcMain, service)` from `src/main.ts`.
5. Add `src/frontend/ipc/<Feature>Client.ts` implementing the `<Feature>Api` with `invokeResult()` (which throws the user-facing message) plus `expose<Feature>Client()`; call it from `src/preload.ts`.
6. Declare it on `Window` in `global.d.ts` as `import("./src/common/<feature>/...").<Feature>Api` (no top-level imports there).
7. Use it from React via `window.<feature>`. Preload changes need a full app restart, not just a reload.

## Workflow

### Keep these instructions current

Update this file (and `docs/phase-1-prd.md` when requirements change) whenever it makes sense, as part of the same change rather than as an afterthought. Typical triggers:

- A new dependency, command, script or tool is added or removed.
- The folder structure, architecture or a recurring pattern changes (e.g. the IPC recipe, a new `stores/` or `db/` layout).
- A decision is made or an open question in the PRD is answered.
- The user corrects how something should be done, or states a new preference.
- Something here turns out to be wrong, stale or missing (e.g. a phase in the build order is finished).

Keep edits short and specific, put them in the matching section, remove anything outdated instead of piling on, and mention the update in the summary to the user. Commit instruction changes with the change that caused them, or on their own if there is no code change.

### Plan, then build

- Plan internally before coding, but don't share the plan or wait for approval: the user wants to see working software, not plans. Ask only when a decision genuinely can't be made from the PRD or sensible defaults.
- Work through each build-order step (a "module") as a series of small phases. Each phase must leave the app building, linting and passing tests, and is committed and pushed on its own.
- Don't check in after each phase. When a whole module is done, launch the app (`pnpm start`) so the user can test it, and tell them briefly what to try and any decisions made along the way.

### Commits

- Make small, focused commits: one logical change per commit (e.g. "add channel + service", then "add preload client + UI"). Don't mix refactors, formatting and behavior changes in one commit.
- Each commit should build, lint and pass tests on its own.
- Write imperative, descriptive commit messages (`add trial balance report (FR-29)`, not `updates`).
- Commit and push automatically: once a change (or a phase of a plan) is done and passes test, lint and type-check, commit it and push it to the remote right away without asking for permission.
- Never force-push, rewrite pushed history, or push code that fails test, lint or type-check.

### Testing

- Use **property-based testing** for logic: state the properties (invariants) that must hold for all inputs and let the framework generate the inputs, rather than relying only on a few hand-picked examples. Use [fast-check](https://github.com/dubzzz/fast-check) with Vitest (`import * as fc from "fast-check"`). See `src/backend/services/ChartOfAccountsService.test.ts` for the pattern, including a model-based test that checks the SQLite and in-memory repositories behave the same.
- Typical properties: round-trips (`parse(serialize(x)) === x`), invariants (totals never negative, output always matches the zod schema), idempotence, and equivalence with a simpler reference implementation.
- Add example-based tests alongside for specific known cases and regressions.
- Put tests next to the code as `*.test.ts`. Backend services are classes with injected dependencies so they can be tested without Electron or network calls.
- Write or update tests in the same change as the code they cover.

## Engineering principles

Follow industry-standard best practices for TypeScript, React and Electron (including Electron's security checklist: keep `contextIsolation` on, `nodeIntegration` off, and expose only narrow APIs via preload).

- **DRY:** don't duplicate logic, constants or types. Pull shared code into a single source of truth (e.g. channel names in `AppChannels.ts`, shared types/schemas in `src/common/`). Don't over-abstract on the first repetition: extract once the duplication is real.
- **SOLID:**
  - *Single responsibility:* each class, module and component does one thing (services hold logic, handlers only wire IPC, components only render).
  - *Open/closed:* add features by adding new modules (new service, handler, client), not by growing existing ones with conditionals.
  - *Liskov substitution:* implementations of an interface must be interchangeable (e.g. an in-memory journal repository in tests behaves like the SQLite one).
  - *Interface segregation:* expose small, purpose-specific interfaces (one preload client per feature rather than one large `window.api`).
  - *Dependency inversion:* services depend on interfaces and receive dependencies through their constructor (e.g. a `JournalRepository` interface, not a hard-coded `better-sqlite3` connection), which also makes them testable.
- Prefer clear names, small functions, early returns, and explicit types at module boundaries. Avoid `any`.
- Handle errors explicitly. Never swallow them silently, and surface useful messages to the UI.

## Conventions

- Keep Node/Electron-only code (filesystem, SQLite, file imports and exports) in `backend/`. The renderer must only talk to it through preload-exposed IPC clients — never import `electron` or backend modules from React components.
- Renderer code must not see secrets; read env vars only in the main process.
- Backend logic lives in classes; IPC handler files stay thin.
- Add JSDoc comments to exported functions, classes and methods, matching the existing style.
- Double quotes, semicolons, trailing commas in multi-line literals.
- Validate data crossing the IPC boundary and every imported spreadsheet row with `zod`.

### State management

- Use React's built-in state (`useState`, `useReducer`) for state owned by one component or a small subtree.
- When state must be shared across multiple components (e.g. the selected client, staged rows in the coding grid, app-wide loading/error status), use **Zustand**. Don't add it, or any other state library, until that need actually exists, and don't use Redux, MobX or React Context as a global store.
- Stores live in `src/frontend/stores/` as `use<Feature>Store.ts`, one store per feature (not one global store).
- Stores hold UI state only. Secrets, API calls and persistent data stay in the main process; store actions call the preload IPC clients (`window.<feature>`) and keep the results.
- Keep store logic testable: put state transitions in pure functions and cover them with property-based tests.
