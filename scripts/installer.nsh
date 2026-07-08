; ============================================================================
; Palma installer customisations.
;
; The opt-in "factory reset" prompt (added at 1.0.10) was REMOVED at 1.1.5 — the
; installer no longer asks whether to wipe existing Palma data before installing.
; A normal install/upgrade now always keeps everything; there is no data-purge
; path in the installer at all.
;
; This file is still referenced by package.json → build.nsis.include, so it is
; kept intentionally. It defines no customInit / customInstall macros, so
; electron-builder's NSIS template runs its defaults (no prompt, no purge).
;
; If a reset ever needs to come back, see the git history for the 1.0.10
; customInit/customInstall macros — but never hook a purge into customUnInstall
; (upgrades silently run the previous uninstaller → data loss on every update).
; ============================================================================
