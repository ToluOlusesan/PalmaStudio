// Platform bridge — lets the same UI run as a web app, a Tauri desktop app, or
// an Electron desktop app. In the browser these calls degrade gracefully
// (folder = a typed path label, no real disk writes). On the desktop they hit
// native dialogs and the filesystem, so a project's assets are genuinely written
// to its folder on disk. Tauri modules are imported dynamically so the web build
// never loads them; Electron is reached through the preload-exposed window.palma.

const electron = () => (typeof window !== 'undefined' ? window.palma : null)

export function isElectron() {
  return !!electron()
}

export function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

// Either desktop shell — used to decide whether real disk-backed features (asset
// writes, native pickers, on-disk session files) are available.
export function isDesktop() {
  return isElectron() || isTauri()
}

// Native directory picker. Returns an absolute path, or null in web / if
// cancelled — callers fall back to a typed path.
export async function pickDirectory(title = 'Choose project folder') {
  if (isElectron()) {
    try {
      return await electron().pickDirectory(title)
    } catch {
      return null
    }
  }
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const res = await open({ directory: true, multiple: false, title })
      return typeof res === 'string' ? res : null
    } catch {
      return null
    }
  }
  return null
}

// Create a project's folder scaffold (assets/, assets/frames/) on disk.
export async function ensureProject(folder) {
  if (!folder) return false
  if (isElectron()) {
    try {
      await electron().ensureProject(folder)
      return true
    } catch {
      return false
    }
  }
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('ensure_project', { dir: folder })
      return true
    } catch {
      return false
    }
  }
  return false
}

// Write a data-URL asset into the project folder, returning the absolute path
// written (or null in web). Used by Frame Extract's "Export to project" and by
// persistImage below.
export async function saveAsset(folder, relPath, dataUrl) {
  if (!folder || !dataUrl) return null
  const b64 = dataUrl.split(',')[1] || ''
  if (isElectron()) {
    try {
      return await electron().saveAsset(folder, relPath, b64)
    } catch {
      return null
    }
  }
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke('save_asset', { dir: folder, rel: relPath, b64 })
    } catch {
      return null
    }
  }
  return null
}

// Recursively delete a file or folder on disk. Used by project purge to wipe a
// project's assets/ folder (library images) or its whole folder. Returns true
// on success, false in web or on failure.
export async function deletePath(path) {
  if (!path) return false
  if (isElectron()) {
    try {
      return await electron().deletePath(path)
    } catch {
      return false
    }
  }
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('delete_path', { path })
      return true
    } catch {
      return false
    }
  }
  return false
}

// Turn an absolute disk path into a URL the WebView can load (asset:// on Tauri,
// palma:// on Electron). Returns null in web.
export async function toAssetUrl(path) {
  if (!path) return null
  if (isElectron()) return electron().toAssetUrl(path)
  if (isTauri()) {
    try {
      const { convertFileSrc } = await import('@tauri-apps/api/core')
      return convertFileSrc(path)
    } catch {
      return null
    }
  }
  return null
}

// The real on-disk path of a dropped File, if the desktop shell can supply one.
// Electron exposes it via webUtils; under Tauri native drops are handled
// separately (useTauriDrop) so this returns null there.
export function desktopPathForFile(file) {
  if (isElectron()) return electron().getPathForFile(file) || null
  return null
}

// Reveal a file in the OS file manager (Electron desktop only).
export async function revealInFolder(path) {
  if (isElectron() && path) {
    try {
      return await electron().revealInFolder(path)
    } catch {
      return false
    }
  }
  return false
}

// Open a file/folder with the OS default handler.
export async function openPath(path) {
  if (isElectron() && path) {
    try {
      return await electron().openPath(path)
    } catch {
      return null
    }
  }
  return null
}

// Native open-file picker (relinking a missing asset). Returns an absolute path.
export async function pickFile(opts = {}) {
  if (isElectron()) {
    try {
      return await electron().pickFile(opts)
    } catch {
      return null
    }
  }
  return null
}

// Save a data: URL to a user-chosen file (board export). On the desktop this
// opens a native Save dialog; in web it falls back to a browser download.
export async function saveDataUrl(defaultName, dataUrl, filters) {
  if (!dataUrl) return null
  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  if (isElectron()) {
    try {
      return await electron().saveFile({ defaultName, b64, filters })
    } catch {
      return null
    }
  }
  try {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = defaultName || 'export'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return defaultName
  } catch {
    return null
  }
}

// Absolute folder for the auto-provisioned Inbox project (extension clips).
export async function getInboxDir() {
  if (isElectron()) {
    try {
      return await electron().getInboxDir()
    } catch {
      return null
    }
  }
  return null
}

export async function getDefaultProjectDir(name = 'Untitled') {
  if (isElectron() && electron().getDefaultProjectDir) {
    try {
      return await electron().getDefaultProjectDir(name)
    } catch {
      return null
    }
  }
  return null
}

// Subscribe to browser-extension clips relayed from the local ingest server.
// Returns an unsubscribe function (no-op off Electron).
export function onClip(cb) {
  if (isElectron() && electron().onClip) return electron().onClip(cb)
  return () => {}
}

// Copy an asset file into another project's folder (Move/Copy to project).
// Returns the new absolute path or null.
export async function copyAsset(srcPath, targetDir, rel) {
  if (isElectron() && srcPath && targetDir) {
    try {
      return await electron().copyAsset(srcPath, targetDir, rel)
    } catch {
      return null
    }
  }
  return null
}

export async function downloadImageUrl(url) {
  if (!/^https?:\/\//i.test(url || '')) return null
  if (isElectron() && electron().downloadImageUrl) {
    try {
      return await electron().downloadImageUrl(url)
    } catch {
      return null
    }
  }
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/png'
    if (!type.toLowerCase().startsWith('image/')) return null
    const blob = await res.blob()
    return {
      dataUrl: await readDataUrl(blob),
      ext: imageExtFromType(type),
    }
  } catch {
    return null
  }
}

// Does this item path point at a real on-disk file (so we can reveal/open it)?
// Excludes urls / data / blob / asset-protocol refs.
export function isDiskPath(p) {
  if (!p || typeof p !== 'string') return false
  if (/^(https?:|data:|blob:|palma:|asset:)/i.test(p)) return false
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\')
}

// Read a File/Blob as a data: URL.
function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function imageExtFromType(type) {
  const clean = (type || '').split(';')[0].trim().toLowerCase()
  if (clean === 'image/jpeg') return 'jpg'
  if (clean === 'image/svg+xml') return 'svg'
  if (clean.startsWith('image/')) return clean.slice('image/'.length).replace(/[^a-z0-9]/g, '') || 'png'
  return 'png'
}

// Persist a transient image (a pasted screenshot, a blob-backed file) so it
// survives a reload. On the desktop the bytes are written into the project's
// assets/ folder and referenced via an asset URL — a lean session entry with the
// real file on disk. In web (or when the project has no folder, or the disk
// write fails) it falls back to the inline data: URL, which the serialiser
// persists untouched. Either way the returned src is a stable ref, never a
// session-scoped blob: URL. Returns { src, path }.
export async function persistImage(folder, relPath, file) {
  const dataUrl = await readDataUrl(file)
  if (isDesktop() && folder) {
    const savedPath = await saveAsset(folder, relPath, dataUrl)
    if (savedPath) {
      const url = await toAssetUrl(savedPath)
      if (url) return { src: url, path: savedPath }
    }
  }
  return { src: dataUrl, path: relPath }
}

export async function persistRemoteImage(folder, url, relBase = 'remote') {
  const downloaded = await downloadImageUrl(url)
  if (!downloaded?.dataUrl) return null
  const ext = downloaded.ext || 'png'
  const relPath = `assets/${relBase}.${ext}`
  if (isDesktop() && folder) {
    const savedPath = await saveAsset(folder, relPath, downloaded.dataUrl)
    if (savedPath) {
      const src = await toAssetUrl(savedPath)
      if (src) return { src, path: savedPath }
    }
  }
  return { src: downloaded.dataUrl, path: url }
}

// Write-through a project's session JSON to <folder>/palma.json on disk. Best
// effort, fire-and-forget — localStorage remains the working cache. No-op in
// web or when the project has no folder.
export async function saveSessionFile(folder, session) {
  if (!folder || !session) return null
  const json = JSON.stringify(session, null, 2)
  if (isElectron()) {
    try {
      return await electron().saveSession(folder, json)
    } catch {
      return null
    }
  }
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke('save_session', { dir: folder, json })
    } catch {
      return null
    }
  }
  return null
}

// Read a project's session back from <folder>/palma.json. The on-disk copy is
// authoritative when opening a project on the desktop. Returns the parsed
// session or null (web, no folder, missing file, or parse failure).
export async function readSessionFile(folder) {
  if (!folder) return null
  const parse = (json) => {
    try {
      return json ? JSON.parse(json) : null
    } catch {
      return null
    }
  }
  if (isElectron()) {
    try {
      return parse(await electron().readSession(folder))
    } catch {
      return null
    }
  }
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return parse(await invoke('read_session', { dir: folder }))
    } catch {
      return null
    }
  }
  return null
}

// Discover projects on disk: scan a chosen root (and its immediate subfolders)
// for palma.json. Returns parsed sessions. Empty array in web / on failure.
export async function scanProjects(root) {
  if (!root) return []
  const parseAll = (list) =>
    (list || [])
      .map((s) => {
        try {
          return JSON.parse(s)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  if (isElectron()) {
    try {
      return parseAll(await electron().scanProjects(root))
    } catch {
      return []
    }
  }
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseAll(await invoke('scan_projects', { root }))
    } catch {
      return []
    }
  }
  return []
}
