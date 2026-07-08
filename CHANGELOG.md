# Changelog

All notable changes to Palma are recorded here. Versions follow
[Semantic Versioning](https://semver.org). Each release ships as an incremental
installer — electron-updater downloads only the changed blocks against the
previously installed version (via the `.blockmap` published with each build).

## [1.1.5] — 2026-07-08 · beta

### Added
- **Send to Focus is now a hover action on every image.** Hover an image on the
  Dump Board and a "Send to Focus" pill appears in the corner — the one action
  that moves a reference into Focus is no longer hidden in the right-click menu.
  Once promoted, the pill reads "Sent to Focus." Videos don't show it (Focus is
  image-only), and the old hover filename label is gone.

### Changed
- **Export is now one dropdown instead of three look-alike rows.** The Export
  dialog opens with a single "What to export" picker (Dump Board / Focus Board /
  Process Brief); the controls beneath adapt to the choice. Process Brief is
  PDF-only and carries a Light/Dark output toggle; boards export as the canvas
  looks now. Nothing is greyed-out or gated — every target is always selectable,
  so a live option never reads as a disabled one.
- **One Export button per view.** The duplicate Export in the project title bar
  is gone; export now lives on the board's own toolbar (the coloured button on
  the Dump Board, a matching one on Focus), and both open the same dialog.
- **Placed references leave the Queue.** Once a reference is dropped into a Focus
  zone it lives in that zone and no longer clutters the Queue shelf — the Queue
  shows only what's still waiting to be placed. Removing a reference from its
  zone returns it to the Queue.
- **Focus zones can't overlap anymore.** Dragging or resizing a zone into another
  pushes the others out of the way (cascading) instead of letting them stack, so
  the board stays readable without any manual tidying.

### Removed
- **The installer no longer asks about a "factory reset."** The opt-in data-wipe
  prompt (added in 1.0.10) is gone; installing or updating always keeps your
  existing projects and app state.



### Fixed
- **Note text no longer turns white in the dark Process Brief export.** A
  coloured sticky note keeps its light paper tint on any page, but the exported
  brief was flipping the text to the dark-theme's white ink — leaving it nearly
  invisible on the pale card. Tinted notes now always render with dark ink,
  matching the in-app view.

## [1.1.3] — 2026-07-07 · beta

### Fixed
- **Cards no longer borrow another project's thumbnail.** A project whose
  folder held a `palma.json` from a different project could silently adopt that
  board — and its snapshot would then be written back as the wrong card's
  thumbnail. Session reconcile now refuses any on-disk file whose id doesn't
  match, and the snapshot step only records when the live board truly belongs to
  the project being left.

### Changed
- **Rename now lives in the ⋯ card menu**, alongside the colour swatches and
  Delete (still available on right-click too).
- **Project cards use flat solid fills** instead of gradients — swatches,
  the auto/seeded fallback, palette thumbnails, sidebar chips and Trash swatches.
- **User guide refreshed**: the Palma Clipper section is now marked **coming
  soon**.

## [1.1.2] — 2026-07-07 · beta

### Added
- **Right-click a project card** for a context menu: **Reveal in Explorer**
  (opens the project's folder in the OS file manager) and **Delete**.
- **Rename a project** inline from that menu — the card's title becomes an
  editable field (Enter to save, Esc to cancel); the new name is written back
  to the project's `palma.json`.
- **Double-click the Focus canvas** to drop a note where you clicked, ready to
  type — no trip to the toolbar.

## [1.1.0] — 2026-07-05 · beta

### Added
- **Guided first-run tutorial.** New users get a quiet, one-time walkthrough
  that teaches on the live interface rather than a mockup: each tip **dims the
  rest of the window and spotlights the real control** it's about, alongside an
  animated illustration (the same monochrome caricatures from the website).
  The tour teaches creating a project on first launch, then introduces each
  module's controls the first time it's opened — **Dump Board**, **Focus**,
  **Scratchpad**, and **Library**. Every tip shows once; "Skip tour" turns the
  rest off, and **Show tips** in the sidebar footer replays them anytime.

### Changed
- **The "sent to Focus" dot is now green.** A reference promoted to the Focus
  board shows a small marker in its top-right corner; it was a near-black ink
  dot that could read as a stray mark, and is now green so it clearly means
  "active — already in Focus."

### Fixed
- **The Library no longer gets laggy with a large shelf.** Three fixes: video
  assets now show a static thumbnail (cached poster frame + a play badge)
  instead of a live `<video>` element each — a grid of dozens of players was
  the main drag; cells scrolled out of view are skipped by the browser
  (`content-visibility`); and the search box defers grid filtering so typing
  stays responsive. The full-size viewer still plays real video on click.

## [1.0.10] — 2026-07-05

### Added
- **Optional full reset in the installer.** The installer now asks whether to
  erase all existing per-user Palma state — `%APPDATA%\Palma` (saved app
  state, Inbox, and any projects stored in the app-data `Projects` folder,
  including their assets) plus updater/browser caches — before installing, so
  the app can start completely fresh, as if never installed. Default is
  **No** (normal install, everything kept), and silent installs — including
  auto-updates — never ask and never purge. Project folders you chose
  yourself elsewhere on disk are never deleted; after a reset the app forgets
  them — use **Import** to bring them back.

### Fixed
- **Pinterest/web clipboard images now persist reliably.** Copied internet
  images pasted with Ctrl/⌘+V are written to the project's `assets/` folder and
  landed on the board immediately after the asset write, before any optional
  image-size decoding. This closes the remaining "only the last pasted web image
  survives reopen" race without changing the local-file path.
- **Clipboard HTML/URL image copies are captured as local assets.** When a site
  puts an `<img src="…">` or direct image URL on the clipboard instead of bitmap
  bytes, Palma downloads the image through the desktop bridge and saves it into
  the project instead of persisting a fragile remote reference.
- **Folderless desktop projects get an app-data asset folder.** New desktop
  projects created without an explicit folder now receive a durable project
  folder automatically, so pasted internet images have a real `assets/`
  destination instead of falling back to large inline localStorage entries.

## [1.0.9] — 2026-07-02

### Removed
- **Heading 1 / Heading 2 removed from the Scratchpad toolbar.** Even sized to
  a two-row block, headings kept breaking the ruled-paper illusion — different
  browsers/fonts don't put a heading's baseline in a consistent spot within a
  line box, so no fixed multiple of the rule spacing landed it reliably. Rather
  than keep chasing pixel alignment, headings are gone; Bold stays available
  for emphasis. Any heading already written in an existing Scratchpad still
  renders (2-row-tall, as before) — this only removes the ability to make new
  ones.

## [1.0.8] — 2026-07-02

### Added
- **Zone-pinned comments now appear in the Process Brief**, listed under their
  attached zone's reference grid on that zone's page (with a "+N more" fallback
  if there isn't room for all of them). A zone with only comments and no
  images yet still gets a page, rather than being skipped entirely.

### Changed
- Cover page footer now reads **"Created on:"** instead of "Generated".

## [1.0.7] — 2026-07-02

### Fixed
- **Note text was unreadable in dark mode.** Note cards keep a fixed pastel
  paper palette regardless of theme (a sticky note doesn't change colour under
  different light), but their text was following the theme's ink token, which
  goes near-white in dark mode — nearly invisible on a light note. Note text is
  now fixed dark ink, always, matching its fixed background.
- **Scratchpad's ruled background could fall short of the full page,** leaving
  a visible seam where the ruling stopped. The scrollable wrapper was missing
  `min-h-0` (required for a flex-1 child in a column layout to size correctly),
  so the ruled div's `min-height: 100%` had nothing solid to resolve against.
- Rounded the Dump Board's and Focus Board's dot-grid tile size to a whole
  pixel. A fractional tile (e.g. 22×0.92 zoom = 20.24px) repeated across a wide
  canvas can accumulate sub-pixel rounding error into a visible seam partway
  across, worse under non-100% OS display scaling.

### Changed
- **Distinct sun/moon icons for the dark-mode switch** instead of one mark
  with a fill-weight change — a moon while light (click for dark), a sun while
  dark (click for light).

## [1.0.6] — 2026-07-02

### Changed
- **Dropped/pasted images now force an immediate disk write.** 1.0.5 fixed
  drops from landing on the wrong project after a fast navigation, but the
  "still-open, different-tab" case relied on the normal 2s-debounced autosave
  (itself backed by a flush-on-navigate and flush-on-quit safety net) to
  eventually reach disk. That's correct in principle, but a one-shot drop has
  no natural "next edit" to lean on if any of those triggers is missed — so it
  no longer waits on any of them. Every drop/paste/upload that lands an item
  now flushes straight to `palma.json` synchronously, the moment it lands, live
  or not. (Browser-extension clips share the same code path and get the same
  guarantee for free.)

## [1.0.5] — 2026-07-02

### Fixed
- **Web-dragged/pasted images could vanish — "the last one always survives."**
  Persisting an image (writing its bytes to the project's `assets/`) is async;
  the code that landed the finished item on the canvas was unguarded against
  the user having switched projects — or even just switched away and back
  quickly — before that write finished. Whichever drop was still in flight lost
  the race against the next save/reload cycle and got silently discarded; only
  the very last one, resolving after the dust settled, reliably survived.
  Every drop/paste that persists an image now captures which project it
  belongs to *before* the async write starts, and lands the item there
  durably — live on the canvas if that project is still open and visible,
  written straight to its saved session otherwise — so a fast tab switch can
  no longer eat an in-flight image. Affects drag-drop, clipboard paste, and the
  toolbar file picker.

## [1.0.4] — 2026-07-02

### Changed
- **Process Brief is now landscape.** The multi-page PDF (cover, Dump Board,
  zone pages, Notes, closing page) switched from A4 portrait to A4 landscape —
  a Dump Board render or a zone's contact-sheet grid fits with far less
  letterboxing, and it reads more like a board/presentation than a printed
  report.

### Fixed
- **Process Brief closing page was off-centre.** `align: 'center'` combined
  with letter-spacing (`charSpace`) doesn't account for the extra tracking in
  jsPDF's centring math, so "Powered by Palma" drifted off true centre — now
  measured and positioned manually. Also switched it to the brand serif
  (matching the cover title) instead of the sans eyebrow font.
- **Scratchpad headings floated between ruled lines.** H1/H2 render larger than
  one 28px rule row, so they were being squeezed into a single row instead of
  sitting on one. Headings now get a line-height that's an exact multiple of
  the rule spacing, landing their baseline on a real rule.

## [1.0.3] — 2026-07-02

### Added
- **System clipboard integration.** Copy (Ctrl/⌘+C) now mirrors the selection to
  the OS clipboard — a single image copies as real PNG bytes (paste into other
  apps), anything else copies as text. Paste (Ctrl/⌘+V) is one smart path: an
  image on the OS clipboard always pastes as an image; otherwise Palma prefers
  its own last in-app copy (rich — groups, positions, disk refs preserved), and
  falls back to turning outside text or a URL into a note or image reference.
- **Extension clips route to the open project.** Palma Clipper saves now land on
  whichever project is currently open (live if its Dump Board is visible,
  merged in otherwise); only when nothing is open do they fall back to Inbox.
- **App-wide dark mode.** A switch in the sidebar footer (above New Project)
  toggles a persisted, sticky dark theme for the whole app — paper grain
  texture included. Canvas dot-grids and Scratchpad's ruled lines adapt too.
- **Notes and pinned comments in Focus.** An "Add Note" toolbar button drops a
  freestanding, draggable/resizable note on the Focus canvas; each zone's
  header gained a comment-pin button that attaches a comment directly to that
  zone — it automatically follows the zone when moved or resized.
- **Ruled paper in the Scratchpad.** Blue horizontal rules and a pink margin
  line, notebook-style — list numbers and bullets sit in the margin gutter.
- **Process Brief overhaul.** Every page — including the cover — now shares the
  same paper-textured background and a consistent footer bar, so the document
  reads as one designed object. Added a **Notes** page pulled from the
  project's Scratchpad, a closing "Powered by Palma" page, and a **light/dark**
  export choice in the Export dialog.
- **Palma User Guide** — a full illustrated PDF tutorial covering every module,
  shipped alongside the app.

### Changed
- **Focus zone images are no longer cropped.** Members show their full,
  uncropped aspect ratio (letterboxed in the auto-tidy grid) instead of being
  force-cropped to a square — on-screen, in the Focus Board export, and in the
  Process Brief's per-zone pages.
- Focus no longer dims or re-themes the app when opened — it reads exactly like
  the Dump Board; only the explicit dark-mode switch changes the theme.

## [1.0.2] — 2026-06-22

### Added
- **Export scale choice.** The Export button and the canvas right-click menu now
  offer PNG and PDF at **1×** (smaller file) or **2×** (crisper, larger). 2×
  renders up to a 5000px long edge for PNG / 6000px for PDF; detail is still
  bounded by each source image's native pixels.

### Changed
- **Much smaller PDF exports.** PDFs now embed a JPEG instead of a lossless PNG,
  cutting file size by roughly an order of magnitude — a board PDF is now a few MB
  rather than 40+. PNG export stays lossless for when fidelity matters most.

### Fixed
- Very large boards could export blank when they exceeded the browser's canvas
  limits. A safety clamp now scales the export to fit while keeping aspect ratio.

## [1.0.1] — 2026-06-22

### Fixed
- **Export now includes connectors.** PNG and PDF exports were dropping the
  arrows/lines drawn between items; they are now rendered edge-to-edge with
  arrowheads, matching the board.
- **Copy / Paste in the right-click menu.** The context menu gained *Copy* on
  items (copies the whole selection when the clicked item is part of one) and
  *Paste* on both items and empty canvas (drops at the cursor). Mirrors the
  existing Ctrl+C / Ctrl+V shortcuts and works across boards.
- **Dragging comments.** An expanded comment could only be grabbed from a thin
  strip near its bottom edge — the text field was swallowing the drag. The whole
  comment body is draggable again; a click still focuses it to type.
- **Tidy preserves relationships.** Tidy no longer scatters pinned comments or
  items joined by an arrow. Connected items stay put so the link isn't torn
  apart, and a comment pinned to an image now rides along to the image's new
  spot.

## [1.0.0] — 2026-06-20

- First packaged Windows release (NSIS installer, auto-update enabled).
</content>
</invoke>
