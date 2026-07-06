# Oasis

> Your creative ground. — Spatial Foundry

A local-first creative suite for motion & 3D designers. Session-based visual
research, mood development, motion reference, and presentation — in one
warm-dark environment that reads like a darkroom, not a dashboard.

This is the **v1 web build** (Vite + React). A Tauri wrapper with real
filesystem access is planned for v2; every v1 limitation is flagged in code.

## Run (web)

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # production bundle → dist/
```

## Desktop app (Tauri)

Requires the Rust toolchain (MSVC on Windows) + WebView2. Per-project folders
use the native picker, and Frame Extract writes real PNGs into the project's
`assets/frames/` on disk.

```bash
npm run tauri dev      # run the desktop shell against the dev server
npm run tauri build    # → src-tauri/target/release/bundle/nsis/Palma_<ver>_x64-setup.exe
npm run tauri icon src-tauri/icons/source.png   # regenerate icons from the mark
```

Windows installer output: `src-tauri/target/release/bundle/nsis/Palma_1.0.0_x64-setup.exe`.
Note: `time` is pinned to `=0.3.47` in `src-tauri/Cargo.toml` (0.3.48 breaks `cookie`).

## Stack

Vite · React · Tailwind v4 (`@tailwindcss/vite`) · Zustand · React Router v6 ·
Framer Motion (transitions only) · Phosphor Icons (`regular`). No canvas
library — the infinite canvas is raw CSS transforms.

## Structure

```
src/
  components/   AppLayout, Sidebar, Topbar, ModuleTabBar, ProjectShell,
                Button, NavItem, Badge, Modal, Logo, Thumb, PageView
  modules/
    dashboard/  project grid + new project + journal strip
    dumpboard/  infinite canvas (pan/zoom/drop/notes/resize) — the core
    moodboard/  Mood Distiller (shares the canvas engine, separate board)
    motionref/  video player + frame pinning (F) + timing notes
    projectskin/ palette extraction + pinned refs + note snapshot
    bento/      auto-composed bento grid from session assets
    scratchpad/ freeform per-project text, auto-saved
    journal/    global passive visual history
    library/    cross-project shelf (placeholder — Phase 3)
  store/        projectStore · canvasStore · sessionStore · journalStore
  hooks/        useCanvas (pan/zoom) · useDrop (intake) · useSession (load/save)
  utils/        pathUtils · colourExtract · sessionIO · format · id
```

## Design system

Warm-dark, one expressive colour (Oasis Cream `#E8E2D8`) per screen. Tokens
live in `src/index.css` — both as Tailwind `@theme` utilities (`bg-surface`,
`text-ink-2`…) and as canonical CSS variables (`--border`, `--sand-hover`…) for
dynamic/canvas use. DM Serif Display for identity & titles; Inter for all UI
chrome. Motion is functional only: 100–180ms, ease/ease-out, no spring; the
canvas itself responds 1:1 with no easing.

## Storage (v1)

Sessions persist to `localStorage`:
- `oasis.projects` — dashboard summaries
- `oasis.session.<id>` — full session JSON (state only, never file contents)
- `oasis.journal` — passive history entries

Canvas state auto-saves on a 2s debounce after any change. Leaving a project
records a coalesced Journal entry automatically.

### Known v1 limitations (Tauri v2 fixes these)

- Dropped files become object URLs; `path` is simulated from `file.name`.
  Object URLs don't survive a reload, so file-backed items show the amber
  **missing** badge until re-dropped. Notes (inline text) persist fully.
- Motion Refs pins are captured as data URLs (these *do* persist); the clip
  itself is relinked by re-picking the file.
- No export pipeline — Bento composes for on-screen review only.
```
