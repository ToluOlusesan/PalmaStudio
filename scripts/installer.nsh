; ============================================================================
; Optional "factory reset" for the Palma installer (added at 1.0.10).
;
; When existing Palma data is present, the installer asks whether to wipe it
; before installing. Default is NO — a plain install/upgrade keeps everything.
; The prompt is skipped entirely on a first-ever install (no data to reset) and
; on silent installs (/S — including electron-updater auto-updates), which never
; ask and never purge.
;
; Purge scope (only when the user explicitly chooses Yes):
;   %APPDATA%\oasis          — app state (localStorage/leveldb), window state,
;                              Inbox, and app-data Projects incl. assets
;   %LOCALAPPDATA%\oasis     — Chromium caches, if any
;   %LOCALAPPDATA%\oasis-updater — updater cache
; Project folders the user chose elsewhere on disk are untouched — the app
; simply forgets them (Import rediscovers their palma.json).
;
; NOTE: the on-disk folder is "oasis", not "Palma" — Electron derives userData
; from package.json "name" (oasis), while build.productName (Palma) only names
; the installed program. Point every path below at the real "oasis" folders or
; the prompt never fires and nothing is purged.
;
; Deliberately NOT hooked into customUnInstall: upgrades silently run the
; previous version's uninstaller, so a purge there would nuke user data on
; every future update.
; ============================================================================

; The script is compiled twice (installer + uninstaller). Only the installer
; pass references this variable — declaring it in the uninstaller pass trips
; NSIS warning 6001, which electron-builder escalates to an error.
!ifndef BUILD_UNINSTALLER
Var PalmaPurge
!endif

!macro customInit
  StrCpy $PalmaPurge "0"
  ; Auto-updates and scripted installs run silent — never prompt, never purge.
  IfSilent palma_purge_decided
  ; First-ever install — nothing to reset, so don't ask. SetShellVarContext
  ; current so $APPDATA resolves to the per-user path the app actually writes to.
  SetShellVarContext current
  IfFileExists "$APPDATA\oasis\*.*" 0 palma_purge_decided
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
    "Do you want a FULL RESET of Palma?$\r$\n$\r$\nYes — erase all existing Palma data before installing: saved app state, the Inbox, and any projects stored in Palma's app-data folder (including their images). Projects in folders you picked yourself stay on disk but must be re-imported.$\r$\n$\r$\nNo — normal install, everything is kept. (Recommended)" \
    IDYES palma_purge_yes
  Goto palma_purge_decided
palma_purge_yes:
  StrCpy $PalmaPurge "1"
palma_purge_decided:
!macroend

!macro customInstall
  StrCmp $PalmaPurge "1" 0 palma_purge_skip
  SetShellVarContext current
  RMDir /r "$APPDATA\oasis"
  RMDir /r "$LOCALAPPDATA\oasis"
  RMDir /r "$LOCALAPPDATA\oasis-updater"
palma_purge_skip:
!macroend
