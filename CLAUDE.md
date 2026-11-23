# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Electron desktop app (package name `agentobi`) built with Electron Forge + Vite, React 19 and TypeScript. It is intended to call LLMs through OpenRouter (`@openrouter/agent`), with `zod` available for schema validation. Secrets (e.g. the OpenRouter API key) are loaded from a `.env` file at the repo root via `dotenv` in the main process. `.env` is git-ignored — never commit it or print its contents.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`, `pnpm-workspace.yaml`).

- `pnpm install` — install dependencies
- `pnpm start` — run the app in dev mode (Vite dev server + Electron, DevTools open)
- `pnpm lint` — ESLint over `.ts`/`.tsx`
- `pnpm exec tsc --noEmit` — type-check (no dedicated script)
- `pnpm test` — run all tests once (Vitest + fast-check); `pnpm test:watch` for watch mode
- `pnpm package` / `pnpm make` — build distributables into `out/`

Vitest is pinned to 3.x because the app uses Vite 5 (Vitest 4+ requires Vite 6+). Test config lives in `vitest.config.mts`.

## Architecture

```
src/
  main.ts            Electron main process: creates the window, registers IPC handlers
  preload.ts         Preload script: exposes renderer-facing clients via contextBridge
  renderer.tsx       React entry point (mounts into #app in index.html)
  common/ipc/        Code shared by main and renderer (IPC channel names)
  backend/           Main-process only
    services/        Business logic as classes (e.g. HelloWorldService)
    ipc/             ipcMain.handle registrations that delegate to services
  frontend/          Renderer side
    ipc/             Preload clients wrapping ipcRenderer.invoke, exposed on window
    components/      React components
global.d.ts          Types for the window.* APIs exposed by preload
```

Vite configs: `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`; Forge config in `forge.config.ts`.

### Adding a new IPC feature

Follow the existing HelloWorld slice end to end:

1. Add a channel name to `APP_CHANNELS` in `src/common/ipc/AppChannels.ts` (format `app:camelCaseName`).
2. Implement the logic in a service class under `src/backend/services/`.
3. Register a handler in `src/backend/ipc/<Feature>Handlers.ts` (`register<Feature>Handlers(ipcMain)`) and call it from `src/main.ts`.
4. Add a client in `src/frontend/ipc/<Feature>Client.ts` that calls `ipcRenderer.invoke` and an `expose<Feature>Client()` that uses `contextBridge.exposeInMainWorld`; call it from `src/preload.ts`.
5. Declare the exposed API on `Window` in `global.d.ts`.
6. Use it from React via `window.<feature>`.

## Workflow

### Plan before coding

- Always write a plan and share it before making any code change. The plan names the files to touch, the approach, and how the change will be tested. Wait for approval before implementing.
- For a large change (several features, many files, or a refactor across layers), write a **multi-phase plan**. Each phase must:
  - be small enough to review on its own,
  - leave the app building, linting and passing tests,
  - state its goal, the files it touches, and how it is verified.
  Finish and commit one phase before starting the next, and check in after each phase.

### Commits

- Make small, focused commits: one logical change per commit (e.g. "add channel + service", then "add preload client + UI"). Don't mix refactors, formatting and behavior changes in one commit.
- Each commit should build, lint and pass tests on its own.
- Write imperative, descriptive commit messages (`add OpenRouter chat service`, not `updates`).
- Commit and push automatically: once a change (or a phase of a plan) is done and passes test, lint and type-check, commit it and push it to the remote right away without asking for permission.
- Never force-push, rewrite pushed history, or push code that fails test, lint or type-check.

### Testing

- Use **property-based testing** for logic: state the properties (invariants) that must hold for all inputs and let the framework generate the inputs, rather than relying only on a few hand-picked examples. Use [fast-check](https://github.com/dubzzz/fast-check) with Vitest (`import * as fc from "fast-check"`). See `src/backend/services/HelloWorldService.test.ts` for the pattern.
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
  - *Liskov substitution:* implementations of an interface must be interchangeable (e.g. a fake LLM client in tests behaves like the real one).
  - *Interface segregation:* expose small, purpose-specific interfaces (one preload client per feature rather than one large `window.api`).
  - *Dependency inversion:* services depend on interfaces and receive dependencies through their constructor (e.g. an `LlmClient` interface, not a hard-coded OpenRouter instance), which also makes them testable.
- Prefer clear names, small functions, early returns, and explicit types at module boundaries. Avoid `any`.
- Handle errors explicitly. Never swallow them silently, and surface useful messages to the UI.

## Conventions

- Keep Node/Electron-only code (filesystem, network calls, API keys, OpenRouter) in `backend/`. The renderer must only talk to it through preload-exposed IPC clients — never import `electron` or backend modules from React components.
- Renderer code must not see secrets; read env vars only in the main process.
- Backend logic lives in classes; IPC handler files stay thin.
- Add JSDoc comments to exported functions, classes and methods, matching the existing style.
- Double quotes, semicolons, trailing commas in multi-line literals.
- Validate data crossing the IPC boundary or coming back from LLM calls with `zod` where shapes matter.

### State management

- Use React's built-in state (`useState`, `useReducer`) for state owned by one component or a small subtree.
- When state must be shared across multiple components (e.g. conversation history, settings, app-wide loading/error status), use **Zustand**. Don't add it, or any other state library, until that need actually exists, and don't use Redux, MobX or React Context as a global store.
- Stores live in `src/frontend/stores/` as `use<Feature>Store.ts`, one store per feature (not one global store).
- Stores hold UI state only. Secrets, API calls and persistent data stay in the main process; store actions call the preload IPC clients (`window.<feature>`) and keep the results.
- Keep store logic testable: put state transitions in pure functions and cover them with property-based tests.
