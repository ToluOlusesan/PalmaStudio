// Preload bridge — the only channel between the sandboxed renderer and the
// Electron main process. Exposes a small, explicit window.palma API via
// contextBridge (no nodeIntegration). platform.js talks to this instead of
// Tauri's invoke() when running under Electron.
const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('palma', {
  isElectron: true,

  // Filesystem commands — mirror the Tauri invoke() calls.
  ensureProject: (dir) => ipcRenderer.invoke('ensure-project', dir),
  saveAsset: (dir, rel, b64) => ipcRenderer.invoke('save-asset', dir, rel, b64),
  saveSession: (dir, json) => ipcRenderer.invoke('save-session', dir, json),
  readSession: (dir) => ipcRenderer.invoke('read-session', dir),
  scanProjects: (root) => ipcRenderer.invoke('scan-projects', root),
  pickDirectory: (title) => ipcRenderer.invoke('pick-directory', title),
  pickFile: (opts) => ipcRenderer.invoke('pick-file', opts),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
  revealInFolder: (p) => ipcRenderer.invoke('reveal-in-folder', p),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  getInboxDir: () => ipcRenderer.invoke('get-inbox-dir'),
  getDefaultProjectDir: (name) => ipcRenderer.invoke('get-default-project-dir', name),
  copyAsset: (srcPath, targetDir, rel) => ipcRenderer.invoke('copy-asset', srcPath, targetDir, rel),
  deletePath: (p) => ipcRenderer.invoke('delete-path', p),
  downloadImageUrl: (url) => ipcRenderer.invoke('download-image-url', url),

  // Browser-extension clips relayed from the local ingest server. Returns an
  // unsubscribe fn.
  onClip: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('clip-received', handler)
    return () => ipcRenderer.removeListener('clip-received', handler)
  },

  // Turn an absolute disk path into a palma:// URL the WebView can load
  // (the Electron analogue of Tauri's convertFileSrc).
  toAssetUrl: (p) => 'palma://localhost/' + encodeURIComponent(p),

  // The real on-disk path of a dropped File (Electron's replacement for the
  // removed File.path). Lets dropped images/videos be referenced from disk and
  // persist across restarts, like Tauri's native drag-drop.
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
})

// Window controls for the frameless title bar.
contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  close: () => ipcRenderer.send('window-close'),
  // Subscribe to maximise/restore changes; returns an unsubscribe fn.
  onMaximizedChange: (cb) => {
    const handler = (_e, isMax) => cb(isMax)
    ipcRenderer.on('window-maximized', handler)
    return () => ipcRenderer.removeListener('window-maximized', handler)
  },
})
