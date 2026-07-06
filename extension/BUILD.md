# Palma Clipper — build instructions (for AMO reviewers)

This add-on is written by hand and is **not** minified, transpiled, or bundled.
A small Node script (`build-extension.mjs`) copies the hand-written source files
and writes the browser-specific `manifest.json` (the only generated file), then
zips the result. It has **no third-party dependencies** — it uses only Node's
built-in modules — so no `npm install` is required.

## Build environment

- **Operating system:** any (built and tested on Windows 11). macOS/Linux work
  too; the only OS-specific part is the zip step (see note below).
- **Node.js:** v22.18.0 (any Node ≥ 18 works)
- **npm:** 10.9.3 (only used to invoke the script; not strictly required)

## Source files (all hand-written, human-readable)

- `background.js` — the service worker / event page (context-menu clip logic)
- `popup.js` — connection-status check shown in the toolbar popup
- `popup.html` — the popup markup + inline styles
- `manifest.json` — the base (Chrome) manifest the build script starts from
- `icon32.png`, `icon128.png` — toolbar icons

The manifest shipped inside the Firefox package is the ONLY generated file. It is
produced by `scripts/build-extension.mjs`, which reads the base `extension/manifest.json`
above and, for the Firefox target, swaps the background key to an event page and
adds the `browser_specific_settings.gecko` block (add-on id + data-collection
declaration). The output is plain, readable JSON.

## Steps to reproduce the submitted package

1. Install Node.js v22.18.0 (or any Node ≥ 18).
2. From the repository root, run:

   ```
   node scripts/build-extension.mjs
   ```

3. The Firefox package is written to:

   ```
   release/extension/firefox/                     (unpacked folder)
   release/extension/palma-clipper-firefox-v1.0.0.zip
   ```

   The contents of `release/extension/firefox/` are byte-for-byte the files in
   the submitted add-on.

> Zip note: the script's zip step uses Windows PowerShell `Compress-Archive`.
> On macOS/Linux, or to verify the folder directly, load the unpacked
> `release/extension/firefox/` folder instead — the zip is only a container of
> those exact files.
