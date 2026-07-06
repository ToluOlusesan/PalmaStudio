// Electron main process — the native layer for the desktop build, mirroring the
// Tauri Rust commands in src-tauri/src/lib.rs so the React frontend runs
// unchanged. CommonJS (.cjs) so it loads cleanly even though package.json is
// "type": "module".
const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const fsp = require('fs/promises')
const path = require('path')
const windowState = require('./windowState.cjs')
const { startClipServer } = require('./clipServer.cjs')

const isDev = !!process.env.ELECTRON_DEV

// Local files (project assets) are served to <img>/<video> through a custom,
// privileged scheme rather than file:// (which CSP/webSecurity would block).
// The renderer builds palma://localhost/<urlencoded-abs-path> via the preload
// bridge — the Electron equivalent of Tauri's convertFileSrc / asset: protocol.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'palma',
    // corsEnabled is essential: the colour-extraction features request these
    // images crossOrigin="anonymous". Without it Chromium blocks the cross-origin
    // request before our handler runs, so the CORS response header never applies
    // and the image fails to load. With it, the request reaches the handler and
    // the access-control-allow-origin header below keeps the canvas untainted.
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
])

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
}

function extFromMime(contentType) {
  const type = (contentType || '').split(';')[0].trim().toLowerCase()
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/svg+xml') return 'svg'
  if (type.startsWith('image/')) return type.slice('image/'.length).replace(/[^a-z0-9]/g, '') || 'png'
  return 'png'
}

function safeFolderName(name) {
  return (name || 'Untitled')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'Untitled'
}

function createWindow() {
  const saved = windowState.getBounds({ width: 1280, height: 820 })
  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x != null ? { x: saved.x, y: saved.y } : {}),
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    frame: false, // custom in-app title bar (components/TitleBar.jsx) supplies the chrome
    title: 'Palma',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // lets the preload use webUtils.getPathForFile for dropped files
    },
  })

  windowState.track(win)
  if (saved.maximized) win.maximize()

  // Keep the renderer's maximise/restore icon in sync with the actual state.
  win.on('maximize', () => win.webContents.send('window-maximized', true))
  win.on('unmaximize', () => win.webContents.send('window-maximized', false))

  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

// Window controls for the frameless chrome — driven by the custom title bar.
ipcMain.on('window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
ipcMain.on('window-toggle-maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (!w) return
  w.isMaximized() ? w.unmaximize() : w.maximize()
})
ipcMain.on('window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())

app.whenReady().then(() => {
  // Serve a local file by absolute path encoded into the palma:// URL.
  // The Access-Control-Allow-Origin header is essential: the colour-extraction
  // features (Mood Distiller, Skin Panel, Project Skin, board thumbnails) load
  // these images with crossOrigin="anonymous" and draw them to a <canvas> to read
  // pixels. Without CORS the image either fails to load or taints the canvas, so
  // getImageData()/toDataURL() throw and those features silently produce nothing.
  protocol.handle('palma', async (request) => {
    try {
      const u = new URL(request.url)
      const filePath = decodeURIComponent(u.pathname).replace(/^\//, '')
      const buf = await fsp.readFile(filePath)
      const ext = path.extname(filePath).slice(1).toLowerCase()
      return new Response(buf, {
        headers: {
          'content-type': MIME[ext] || 'application/octet-stream',
          'access-control-allow-origin': '*',
          'cache-control': 'no-cache',
        },
      })
    } catch {
      return new Response('Not found', {
        status: 404,
        headers: { 'access-control-allow-origin': '*' },
      })
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Local ingest server for the Palma browser extension — delivers clips to the
  // first open window.
  startClipServer(() => BrowserWindow.getAllWindows()[0] || null)

  // Auto-update: check on launch and download in the background, then show a
  // native notification when an update is ready. No-ops gracefully (caught)
  // until a release feed is configured (build.publish in package.json + a host).
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---- IPC: 1:1 with the Tauri Rust commands (same args, same return shapes) ---

// ensure_project: scaffold <dir>/assets and <dir>/assets/frames.
ipcMain.handle('ensure-project', async (_e, dir) => {
  for (const sub of ['assets', 'assets/frames']) {
    await fsp.mkdir(path.join(dir, sub), { recursive: true })
  }
  return true
})

// save_asset: decode base64 into <dir>/<rel>, return the absolute path written.
ipcMain.handle('save-asset', async (_e, dir, rel, b64) => {
  const full = path.join(dir, rel)
  await fsp.mkdir(path.dirname(full), { recursive: true })
  await fsp.writeFile(full, Buffer.from(b64, 'base64'))
  return full
})

// save_session: write the session JSON to <dir>/palma.json, return its path.
ipcMain.handle('save-session', async (_e, dir, json) => {
  await fsp.mkdir(dir, { recursive: true })
  const full = path.join(dir, 'palma.json')
  await fsp.writeFile(full, json, 'utf8')
  return full
})

// read_session: read <dir>/palma.json, or null when it doesn't exist yet.
ipcMain.handle('read-session', async (_e, dir) => {
  try {
    return await fsp.readFile(path.join(dir, 'palma.json'), 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
})

// scan_projects: collect palma.json from root and one level of subfolders.
ipcMain.handle('scan-projects', async (_e, root) => {
  const out = []
  const take = async (p) => {
    try {
      out.push(await fsp.readFile(path.join(p, 'palma.json'), 'utf8'))
    } catch {
      /* no palma.json here */
    }
  }
  await take(root)
  try {
    const entries = await fsp.readdir(root, { withFileTypes: true })
    for (const e of entries) if (e.isDirectory()) await take(path.join(root, e.name))
  } catch {
    /* unreadable root */
  }
  return out
})

// Native directory picker.
ipcMain.handle('pick-directory', async (_e, title) => {
  const res = await dialog.showOpenDialog({ title, properties: ['openDirectory'] })
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
})

// Native file picker — used to relink a missing asset.
ipcMain.handle('pick-file', async (_e, { title, filters } = {}) => {
  const res = await dialog.showOpenDialog({
    title: title || 'Choose a file',
    properties: ['openFile'],
    filters: filters || [],
  })
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
})

// Save a base64 payload to a user-chosen location (board export, etc.).
ipcMain.handle('save-file', async (_e, { defaultName, b64, filters } = {}) => {
  const res = await dialog.showSaveDialog({ defaultPath: defaultName, filters: filters || [] })
  if (res.canceled || !res.filePath) return null
  await fsp.writeFile(res.filePath, Buffer.from(b64, 'base64'))
  return res.filePath
})

// Reveal a file in the OS file manager / open a folder.
ipcMain.handle('reveal-in-folder', (_e, p) => {
  shell.showItemInFolder(p)
  return true
})
ipcMain.handle('open-path', (_e, p) => shell.openPath(p))

// Default folder for the auto-provisioned Inbox project (browser-extension
// clips land here). Lives under userData so it needs no user choice.
ipcMain.handle('get-inbox-dir', () => path.join(app.getPath('userData'), 'Inbox'))

ipcMain.handle('get-default-project-dir', (_e, name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(app.getPath('userData'), 'Projects', `${safeFolderName(name)}-${stamp}`)
})

// Copy an asset file from one project's folder into another's (Move/Copy to
// project). Returns the new absolute path, or null.
ipcMain.handle('copy-asset', async (_e, srcPath, targetDir, rel) => {
  try {
    const full = path.join(targetDir, rel)
    await fsp.mkdir(path.dirname(full), { recursive: true })
    await fsp.copyFile(srcPath, full)
    return full
  } catch {
    return null
  }
})

// Recursively delete a file or folder on disk (project purge: wipe a project's
// assets/ folder, or its whole folder). Guarded so a bad/empty path or a drive
// root can never trigger a catastrophic recursive delete.
ipcMain.handle('delete-path', async (_e, target) => {
  try {
    if (typeof target !== 'string') return false
    const full = path.resolve(target)
    // Refuse empty, relative-resolved-to-cwd, or a filesystem/drive root
    // (e.g. "C:\\", "/", "\\\\server\\share").
    const { root } = path.parse(full)
    if (!full || full === root) return false
    await fsp.rm(full, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
})

// Download an internet image through the native process. Renderer fetches are
// often blocked by CORS/hotlink rules, while pasted URL images need to become
// durable project assets instead of brittle remote references.
ipcMain.handle('download-image-url', async (_e, rawUrl) => {
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const res = await fetch(url.toString(), {
      headers: {
        'user-agent': 'Palma/1.0',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/png'
    if (!contentType.toLowerCase().startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return {
      dataUrl: `data:${contentType.split(';')[0]};base64,${buf.toString('base64')}`,
      ext: extFromMime(contentType),
    }
  } catch {
    return null
  }
})
