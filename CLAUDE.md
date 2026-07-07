# Palma (repo name: oasis)

Local-first creative suite for a motion/3D designer — personal tool, opinionated,
no bloat. Vite + React + Electron desktop app, shipped as a Windows NSIS
installer (`Palma-Setup.exe`).

> The old build prompt lives at `docs/archive/oasis-claude-code-prompt.md` and is
> **stale** (web-only, localStorage-only, Tauri-v2 plans, dark-only theme). This
> file is the source of truth.

## Commands

| Task | Command |
|---|---|
| Dev (Vite + Electron, hot reload) | `npm run electron:dev` |
| Web build only | `npm run build` |
| **Windows installer** | `npm run installer` (wraps `scripts/build-installer.ps1`) |
| Browser-extension build | `npm run build:extension` |
| Regenerate user guide | `node scripts/generate-user-guide.cjs` |

**Never run `electron-builder` bare.** The installer build OOM-crashes (7za/asar)
without CPU-affinity pinning and a bigger Node heap — `scripts/build-installer.ps1`
handles that, plus killing running Palma instances and cleaning `release/win-unpacked`.
Always use `npm run installer`.

After finishing a set of changes: bump `version` in package.json, add a
CHANGELOG.md entry, then **build the installer without being asked**.

## Stack

- **Electron is the keeper.** Tauri files (`src-tauri/`, `@tauri-apps/*` deps)
  remain as a fallback only — don't extend them.
- Vite + React 18 (plain JS, no TypeScript), Tailwind v4, Zustand, React Router v6,
  Framer Motion (transitions only), Phosphor icons (`regular` weight).
- No canvas library — the infinite canvas is CSS transforms (translate + scale).
- Theme is **monochrome** with a user-toggleable dark mode (settingsStore →
  `dark` class on `<html>`). Not dark-only.

## Architecture

- `electron/main.cjs` — main process; `preload.cjs`; `clipServer.cjs` (Palma
  Clipper receiver); `windowState.cjs`.
- `src/modules/` — one folder per view: `dashboard`, `dumpboard` (infinite
  canvas, primary input), `moodboard` (contains **FocusBoard**), `motionref`,
  `scratchpad`, `library`, `trash`, `bench` (creation-bench tools).
- `src/store/` — flat Zustand stores: `projectStore` (project index),
  `canvasStore` (live board state, not persisted directly), `sessionStore`
  (session read/write + 2s debounced autosave + synchronous `flush()`),
  `settingsStore`, `focusStore`, `benchStore`.
- Routing: persistent sidebar shell; routes swap the main column
  (`/dashboard`, `/library`, `/trash`, `/project/:id/:module`).

## Persistence (critical invariants)

- **Media persists by disk path, never `blob:` URLs.** Blob URLs die with the
  window; any feature that stores a `blob:` in session JSON is a bug.
- localStorage is the fast cache; each session write-throughs to the project
  folder's `palma.json` (`src/utils/sessionIO.js`). Writes are stamped
  `savedAt`; reconcile-on-load compares timestamps so a stale disk file never
  clobbers newer local data, and refuses a `palma.json` whose id doesn't match
  the project (cross-project thumbnail bug, 1.1.3).
- **Saves must flush on window close** — `App.jsx` wires
  `beforeunload`/`pagehide`/`visibilitychange` to `sessionStore.flush()`.
  Don't remove or reorder that; the 2s debounce alone loses last-second edits.
- Electron `userData` is **`%APPDATA%\oasis`** (from package.json `name`), not
  `Palma`. Installer scripts (`scripts/installer.nsh`) must point at `oasis`
  paths or the opt-in reset prompt never fires. Never hook the purge into
  `customUnInstall` (upgrades run the old uninstaller silently → data loss).

## Hard-won gotchas

- **Never use Framer Motion `layoutId` in a routed view** — it deadlocks the
  route-level `AnimatePresence` and white-screens the app.
- The route-level `AnimatePresence` deliberately does NOT use `mode="wait"`
  (reads as a blank pause); keep it that way.
- PowerShell 5.1 on this machine: no `&&`/`||` chaining, no ternary.

## Code style

- Functional components, PascalCase components, kebab-case module folders.
- Tailwind utilities; inline styles only for dynamic canvas values.
- Keep components small; extract sub-components early.
- Comments explain *why* (canvas math, persistence reconcile), not *what*.

## Workflow

- **Verify visually, not by "the edit succeeded".** For any UI change, use the
  `verify-palma-change` skill (launch `electron:dev`, drive the changed flow,
  screenshot, check console). Most bugs here are visual/persistence ones that
  tests don't exist for.
- For fuzzy polish goals ("even padding", "vibrant colours"), prefer a `/goal`
  with a concrete stop criterion and a turn cap.
- Before building a release installer, run `/code-review` — the setup EXE ships
  from a stable permalink, so regressions go straight to users.

## Release

Two repos: this app repo + nested gitignored `PalmaSite`. Installer ships as
stable `Palma-Setup.exe` with a GitHub latest-download permalink; releases are
created via the stored git-credential token. See memory + `scripts/installer.nsh`
comments before touching install/uninstall behaviour.
