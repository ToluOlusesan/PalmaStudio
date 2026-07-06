# Oasis — Claude Code Build Prompt
## Spatial Foundry · June 2026

---

You are building **Oasis**, a local-first creative suite for a motion and 3D designer. This is a personal tool, not a startup product. Every decision should reflect that: opinionated, fast, visually distinctive, no bloat.

---

## What you are building

A Vite + React web application with the following structure:

```
oasis/
├── src/
│   ├── components/        # Shared UI (Button, NavItem, Card, Badge, Modal)
│   ├── modules/
│   │   ├── dashboard/     # Project grid home screen
│   │   ├── dumpboard/     # Infinite canvas — primary creative input
│   │   ├── moodboard/     # Structured canvas for visual language
│   │   ├── motionref/     # Video player + frame pinning
│   │   ├── projectskin/   # Colour + ref snapshot
│   │   ├── bento/         # Presentation composer
│   │   ├── journal/       # Passive visual history
│   │   └── scratchpad/    # Freeform text notes
│   ├── store/             # Zustand state management
│   │   ├── projectStore.js
│   │   ├── canvasStore.js
│   │   └── sessionStore.js
│   ├── hooks/             # Custom hooks (useCanvas, useSession, useDrop)
│   ├── utils/             # helpers (pathUtils, colourExtract, sessionIO)
│   └── assets/            # Static assets (logo SVG)
├── public/
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Tech stack

- **Vite + React** (no Next.js)
- **Tailwind CSS** — utility classes only, no custom CSS files except for the canvas dot grid
- **Zustand** — state management. Keep stores flat and simple
- **React Router v6** — routing between dashboard and project modules
- **Framer Motion** — transitions only (view changes, card hovers). No decorative animation
- **Phosphor Icons React** — `@phosphor-icons/react`. Weight: `regular` throughout. Size 15–16px in nav/toolbar
- **No canvas library** — the infinite canvas is built with CSS transforms (translate + scale on a positioned div)

---

## Design system — implement exactly as specified

### Colours (CSS custom properties on :root)

```css
:root {
  --bg: #0E0E0C;
  --surface: #161614;
  --surface-2: #1E1E1B;
  --surface-3: #252522;
  --ink: #F0EDE8;
  --ink-2: #888880;
  --ink-3: #555550;
  --border: rgba(255, 255, 255, 0.07);
  --border-2: rgba(255, 255, 255, 0.12);
  --accent: #E8E2D8;
  --accent-fg: #111110;
  --sand: rgba(255, 255, 255, 0.05);
  --sand-hover: rgba(255, 255, 255, 0.08);
  --warning: #E09050;
  --warning-bg: rgba(180, 90, 20, 0.2);
  --warning-border: rgba(180, 90, 20, 0.4);
}
```

### Typography

Import from Google Fonts:
```
DM Serif Display (weight 400) — for app wordmark, project titles, page headings
Inter (weight 300, 400, 500) — for all UI chrome
```

Type scale:
- App wordmark: 17px DM Serif Display
- Page title (topbar): 18px DM Serif Display
- Project card title: 13px DM Serif Display
- Section nav label: 10px Inter, uppercase, letter-spacing 0.08em, color var(--ink-3)
- Nav item: 13px Inter
- Module tab: 12px Inter
- Button: 12px Inter
- Body / canvas label: 13px Inter
- Meta / date: 11px Inter
- Badge: 9–10px Inter

### Layout

- Sidebar: 200px fixed width, background var(--surface), border-right 0.5px solid var(--border)
- Topbar: 52px height, background var(--surface), border-bottom 0.5px solid var(--border)
- Module tab bar: 40px height, background var(--surface), border-bottom 0.5px solid var(--border)
- Canvas background: var(--bg) with dot grid (see canvas section)

### Border radius

- App shell: 12px (or none if full window)
- Project cards: 8px
- Nav items, buttons, tool buttons: 6px
- Badges: 4px

---

## Component specs

### NavItem
```jsx
// Default: color var(--ink-2), transparent bg
// Hover: background var(--sand-hover), color var(--ink)
// Active: background var(--surface-3), color var(--ink), fontWeight 500
// Height 32px, padding 7px 8px, borderRadius 6px, gap 8px between icon and label
```

### Button variants
```jsx
// default: transparent bg, border 0.5px solid var(--border-2), color var(--ink-2)
//   hover: background var(--sand-hover), color var(--ink)
// primary: background var(--accent), color var(--accent-fg), no border, fontWeight 500
//   hover: background #F5EFE5
// tool: transparent bg, no border, color var(--ink-2)
//   hover: background var(--surface-3), color var(--ink), border 0.5px solid var(--border)
// tool-active: background var(--surface-3), color var(--ink), border 0.5px solid var(--border-2)
// All buttons: 12px Inter, borderRadius 6px, padding 6px 14px, transition 120ms ease
```

### Project card
```jsx
// borderRadius 8px, border 0.5px solid var(--border), background var(--surface-2)
// thumbnail: aspect-ratio 3/4, overflow hidden, full bleed
// meta: padding 10px 12px 12px, borderTop 0.5px solid var(--border)
// title: 13px DM Serif Display, color var(--ink)
// date: 11px Inter, color var(--ink-3)
// hover: transform translateY(-2px), border-color var(--border-2), transition 150ms ease
```

### Module tab bar
```jsx
// Tab default: 12px Inter, color var(--ink-3), borderBottom 1.5px solid transparent
// Tab hover: color var(--ink-2)
// Tab active: color var(--ink), borderBottom 1.5px solid var(--accent), fontWeight 500
// No background change on tabs — only border and colour
```

### Missing file badge
```jsx
// position: absolute top-right of canvas item
// background: var(--warning-bg)
// color: var(--warning)
// border: 0.5px solid var(--warning-border)
// borderRadius: 4px, fontSize: 9px, padding: 2px 5px
// text: "missing"
```

---

## Canvas system (Dump Board)

The infinite canvas is built entirely with CSS transforms. No canvas library.

```jsx
// Canvas container: position relative, overflow hidden, width 100%, flex 1
// Background: var(--bg)
// Dot grid via CSS:
//   backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)"
//   backgroundSize: "24px 24px"

// Inner canvas: position absolute, transform: `translate(${panX}px, ${panY}px) scale(${zoom})`
// transformOrigin: "0 0"

// Canvas items: position absolute, left: item.x, top: item.y, width: item.width, height: item.height
// drag: update x/y in store on mousemove
// resize: handle corners, update width/height

// Controls:
// - Pan: space + drag, or middle mouse
// - Zoom: wheel event, clamp 0.25 to 4.0
// - Toolbar zoom display: Math.round(zoom * 100) + "%"
```

State for canvas in Zustand:
```js
{
  panX: 0,
  panY: 0,
  zoom: 1,
  items: [], // { id, type, path, x, y, width, height, zIndex, label }
  maxZ: 0,   // increment on each new item or bring-to-front
}
```

---

## Session model

Sessions are stored in localStorage in v1, keyed by project ID. Format:

```json
{
  "id": "proj_abc123",
  "name": "Amo y Muerte",
  "created": "2026-06-09T10:00:00Z",
  "lastOpened": "2026-06-11T14:22:00Z",
  "modules": {
    "dumpboard": {
      "panX": 0,
      "panY": 0,
      "zoom": 1,
      "items": [
        {
          "id": "item_001",
          "type": "image",
          "path": "/Users/user/projects/amo/assets/ref_01.jpg",
          "x": 32,
          "y": 24,
          "width": 140,
          "height": 176,
          "zIndex": 1,
          "label": "ref_01.jpg"
        },
        {
          "id": "item_002",
          "type": "video",
          "path": "/Users/user/projects/amo/motion_ref.mp4",
          "x": 316,
          "y": 38,
          "width": 164,
          "height": 124,
          "zIndex": 2,
          "label": "motion_ref.mp4",
          "pinnedFrames": [{ "timestamp": 4.0, "label": "frame_001" }],
          "sequences": []
        },
        {
          "id": "item_003",
          "type": "note",
          "x": 248,
          "y": 200,
          "width": 100,
          "height": 118,
          "zIndex": 3,
          "content": "feels like dusk in a greenhouse — warm rot, deep green, grief"
        }
      ]
    },
    "scratchpad": {
      "content": ""
    }
  }
}
```

On load: check each item's path with `fetch` or file existence check. If not found, set `item.missing = true`.

---

## Asset intake rules

| Source | Behaviour |
|---|---|
| Drag from Finder (image) | Store path reference. Do not copy. |
| Drag from Finder (video) | Store path reference. Do not copy. |
| Drag from browser / paste | Download to `/project/assets/` folder. Store new local path. |
| Text note | Store inline in session JSON. No path. |

In v1 (web build), simulate file paths using `file.name` and object URLs. Flag for Tauri replacement in v2.

---

## Journal

The Journal is auto-generated. On every session close (or every 30 minutes of activity):

1. Capture a canvas thumbnail (html2canvas or similar on the dump board)
2. Extract 4 dominant colours from canvas items (use color-thief or manual pixel sampling)
3. Write a journal entry to localStorage: `{ projectId, projectName, timestamp, thumbnail, palette[] }`

Journal view renders entries in reverse chronological order. Each entry: thumbnail, date, project name, colour dots, session count, ref count.

---

## File structure detail

### src/store/projectStore.js
```js
// Zustand store
// State: projects[] (list of session summaries), activeProjectId
// Actions: createProject, openProject, updateProject, deleteProject
// Persists to localStorage
```

### src/store/canvasStore.js
```js
// State: panX, panY, zoom, items[], selectedIds[], maxZ
// Actions: addItem, updateItem, deleteItem, bringToFront, setPan, setZoom
// Does NOT persist — session IO handled by sessionStore
```

### src/store/sessionStore.js
```js
// Handles read/write of full session JSON
// loadSession(id): reads from localStorage, hydrates canvasStore
// saveSession(): serialises canvasStore state into session JSON, writes to localStorage
// Auto-save: debounced 2s after any canvas change
```

### src/hooks/useCanvas.js
```js
// Manages pan and zoom state
// Handles mouse events for pan (space + drag) and zoom (wheel)
// Returns: { panX, panY, zoom, canvasRef, handleMouseDown, handleWheel }
```

### src/hooks/useDrop.js
```js
// Handles drag-and-drop onto the canvas
// Accepts: image files, video files, URLs
// Returns: { isDragging, handleDrop, handleDragOver }
```

---

## Build order

Build in this order. Do not skip phases.

**Phase 1 — Shell**
1. Vite + React project setup with Tailwind
2. Google Fonts import (DM Serif Display + Inter)
3. CSS custom properties on :root
4. App layout: sidebar + main area
5. Sidebar: logo, nav items, creation bench section
6. React Router: /dashboard, /project/:id/dumpboard (and other modules)

**Phase 2 — Dashboard**
1. Project card grid
2. New project button → creates session, routes to dumpboard
3. Journal strip (static placeholder data first)
4. projectStore Zustand setup

**Phase 3 — Dump Board**
1. Canvas container with dot grid background
2. Pan + zoom with CSS transforms (useCanvas hook)
3. useDrop for image intake
4. Render canvas items (images, video placeholders, notes)
5. Item drag to reposition
6. Missing file badge
7. canvasStore + sessionStore + auto-save

**Phase 4 — Module shell**
1. Topbar with breadcrumb
2. Module tab bar (tabs render placeholder content for unbuilt modules)
3. Scratchpad (simplest module — just a textarea)

---

## What NOT to build

- No authentication
- No cloud sync
- No export pipeline
- No onboarding flow
- No settings screen (v1)
- No dark/light toggle — dark only
- No notifications
- No right-click context menus in v1

---

## Code style

- Functional components only. No class components.
- Tailwind for all styling. Avoid inline style objects except for dynamic canvas values (transform, position).
- Name components in PascalCase, files in kebab-case.
- Keep components under 150 lines. Extract sub-components early.
- Comments only where behaviour is non-obvious (canvas math, colour extraction).
- No TypeScript in v1. Plain JS.

---

## Logo

The Oasis logo SVG is at `src/assets/logo.svg`. It is a line-drawn island/palm illustration. In the sidebar, render it at 26×20px. On dark backgrounds, the stroke colour is `#E8E2D8` (Accent). Wordmark "Oasis" sits to the right in 17px DM Serif Display, color var(--ink).

---

## Start command

```bash
npm create vite@latest oasis -- --template react
cd oasis
npm install
npm install tailwindcss @tailwindcss/vite
npm install zustand react-router-dom framer-motion @phosphor-icons/react
npx tailwindcss init
```

Begin with Phase 1. Ask before moving to Phase 2.
