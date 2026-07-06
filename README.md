# Palma

> A quiet place for references. Yours, on disk. — Spatial Foundry

Palma is a **local-first creative suite** for gathering the references, video, and
notes behind a project — then shaping them into a direction. Every project points
at its own folder on your disk; your source files stay where they are, in your
hands. No cloud, no account, no lock-in.

**[⤓ Download for Windows](https://github.com/ToluOlusesan/PalmaStudio/releases/latest)** · signed installer, ~86 MB

## What's inside

- **Dump Board** — an infinite canvas. Drag in images and video, paste
  screenshots and links, double-click for a note, connect items with arrows,
  group, multi-select, and Tidy the pile into rows.
- **Focus** — sort references into zones (colour, texture, motion…) and pull a
  direction out of the noise.
- **Scratchpad** — a per-project notebook that autosaves and flows into the
  exported brief.
- **Library** — every project's media gathered onto one shelf, searchable and
  filterable, with one-click export into any project.
- **Trash** — deleting a project moves it here; restore it any time, or purge it
  for good with an opt-in wipe of its files on disk.
- **Export** — boards go out as high-res PNG or PDF (with connectors and notes);
  palettes and a process brief come along too.

A companion **browser clipper** ([`extension/`](extension/)) sends clips straight
into a project's Inbox.

## Local-first by design

Each project is a real folder on disk containing a `palma.json` and an `assets/`
directory. State is cached in the app and mirrored to that folder, so projects
are portable files you own — not rows in someone's database. App data lives under
`%APPDATA%\oasis`; the installer offers an optional full reset for existing
installs, and auto-updates never touch your data.

## Run from source

```bash
npm install
npm run electron:dev      # Vite dev server + Electron shell (hot reload)
npm run electron:build    # → release/Palma Setup <version>.exe (signed NSIS installer)
```

Other scripts: `npm run dev` (web preview only), `npm run build` (renderer
bundle → `dist/`), `npm run build:extension` (package the browser clipper).

> Building the Windows installer is memory-hungry (asar + 7za); if it OOMs, run
> with a larger Node heap and CPU affinity — see `scripts/`.

## Stack

Electron (the desktop shell / keeper) · Vite · React · Tailwind v4 · Zustand ·
React Router v6 · Framer Motion (transitions only) · Phosphor Icons. The infinite
canvas is raw CSS transforms — no canvas library. A Tauri shell (`src-tauri/`) is
kept as a fallback; Electron is the shipping target.

## Structure

```
electron/     main process, preload bridge, custom palma:// asset protocol,
              local clip-ingest server, window state
src/
  components/ AppLayout, Sidebar, Topbar, TitleBar, Modal, Button, Logo, …
  modules/
    dashboard/  project grid + new / import / trash
    dumpboard/  the infinite canvas — the core (pan/zoom/drop/notes/connectors)
    moodboard/  Focus board (zones, queue, curate) — shares the canvas engine
    motionref/  video player + frame pinning + timing notes
    scratchpad/ per-project notebook, autosaved
    library/    cross-project asset shelf
    trash/      soft-deleted projects: restore / purge
  store/        projectStore · canvasStore · sessionStore · settingsStore · …
  utils/        captureBoard (export) · platform (fs bridge) · sessionIO · …
scripts/        installer.nsh (NSIS), packaging + asset generation
extension/      browser clipper → project Inbox
```

## Design

Monochrome shell — ink on paper — with one deliberate splash of colour in the
canvas tools. DM Serif Display for identity and titles, Inter for UI, JetBrains
Mono for captions and data. Motion is functional: short, eased, no spring; the
canvas responds 1:1.

---

© Spatial Foundry. All rights reserved.
