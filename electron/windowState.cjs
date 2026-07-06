// Persist and restore the window's size/position/maximised state across
// launches. Stored as JSON in the app's userData dir (no extra dependency).
const fs = require('fs')
const path = require('path')
const { app, screen } = require('electron')

const file = () => path.join(app.getPath('userData'), 'window-state.json')

function read() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'))
  } catch {
    return null
  }
}
function write(state) {
  try {
    fs.writeFileSync(file(), JSON.stringify(state))
  } catch {
    /* best effort */
  }
}

// Saved bounds if they still land on a connected display, else the defaults
// (centred — no x/y). `maximized` is returned separately.
function getBounds(defaults) {
  const s = read()
  if (!s || !s.bounds) return { ...defaults, maximized: false }
  const b = s.bounds
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
  })
  if (!onScreen) return { ...defaults, maximized: false }
  return { ...b, maximized: !!s.maximized }
}

// Save on resize/move (debounced) and on close. When maximised we keep the last
// restored bounds so un-maximising returns to a sensible size.
function track(win) {
  let timer = null
  const persist = () => {
    if (win.isDestroyed()) return
    if (win.isMaximized()) write({ ...(read() || {}), maximized: true })
    else write({ bounds: win.getBounds(), maximized: false })
  }
  const debounced = () => {
    clearTimeout(timer)
    timer = setTimeout(persist, 400)
  }
  win.on('resize', debounced)
  win.on('move', debounced)
  win.on('close', () => {
    clearTimeout(timer)
    persist()
  })
}

module.exports = { getBounds, track }
