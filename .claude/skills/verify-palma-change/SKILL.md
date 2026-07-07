---
name: verify-palma-change
description: Verify any Palma UI or persistence change end-to-end in the running app before declaring it done. Use after editing anything under src/ or electron/ that has a visible or persisted effect.
---

# Verifying a Palma change

Never report a change as complete because the edit succeeded and the build
compiled. Palma has no test suite — the only verification is driving the real
app. Most regressions here are visual (theme tokens, canvas layout) or
persistence bugs (lost items after reload), so check both.

## 1. Launch

```
npm run electron:dev
```

Wait for the Electron window (vite serves on 127.0.0.1:5173). If an old
Palma/electron instance is running, kill it first — two instances fight over
localStorage and windowState.

## 2. Drive the changed flow — not just the happy path

- Navigate to the exact module you touched (Dump Board, Focus, Dashboard,
  Library, Trash, Scratchpad…).
- Interact with the change directly: click the control, drag the item, open
  the menu. Screenshot before/after states.
- Check **both themes**: toggle dark mode from the sidebar switch — every
  surface is token-based and a hardcoded colour will look right in one theme
  and wrong in the other.
- For canvas changes: verify at more than one zoom level (wheel zoom) and
  after a pan — CSS-transform math bugs hide at zoom 1.

## 3. Persistence check (mandatory for anything touching stores or session IO)

1. Make a change on the board (add/move an item).
2. Close the window immediately (within 2 s — inside the autosave debounce).
3. Relaunch and confirm the change survived (`flush()` on close must have run).
4. Confirm no `blob:` URLs were written into the session JSON
   (`%APPDATA%\oasis` localStorage / project `palma.json`).

## 4. Console

Open DevTools (Ctrl+Shift+I in dev). Zero new errors or warnings. Pay special
attention to AnimatePresence/Framer warnings — a `layoutId` in a routed view
white-screens the app in production even if dev limps along.

## 5. If shipping

If this change is being released: bump version, update CHANGELOG.md, run
`/code-review`, then `npm run installer`. Smoke-test the packaged app from
`release\win-unpacked\Palma.exe` — dev mode and packaged mode differ (file
paths, no vite server).

If any step fails, fix it and rerun from step 1. Do not hand back partially
verified work.
