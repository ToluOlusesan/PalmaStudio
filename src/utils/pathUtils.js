// Path + file helpers. In the v1 web build we have no real filesystem,
// so paths are simulated from File.name and object URLs. Flagged for the
// Tauri fs swap in v2.

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'heic']
const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv']

export function extOf(nameOrPath = '') {
  const clean = nameOrPath.split('?')[0].split('#')[0]
  const dot = clean.lastIndexOf('.')
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase()
}

export function basename(path = '') {
  const clean = path.split('?')[0]
  return clean.slice(clean.replace(/\\/g, '/').lastIndexOf('/') + 1)
}

export function kindFromName(name = '') {
  const ext = extOf(name)
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (VIDEO_EXT.includes(ext)) return 'video'
  return 'note'
}

export function isImageType(type = '') {
  return type.startsWith('image/')
}
export function isVideoType(type = '') {
  return type.startsWith('video/')
}

// Compose the path an asset lives at inside a project's own folder.
// The project folder IS the project root; assets nest under assets/<sub>/.
export function assetPath(projectFolder, sub, filename) {
  const root = (projectFolder || '~/Palma/untitled').replace(/[\\/]+$/, '')
  const parts = [root, 'assets']
  if (sub) parts.push(sub)
  if (filename) parts.push(filename)
  return parts.join('/')
}

// Only file-backed items (image / video) can be "missing". Text items — notes
// and comments — have no src and must never be flagged missing, or they'd reload
// as broken-file placeholders.
export function checkMissing(item) {
  if (item.type === 'image' || item.type === 'video') return !item.src
  return false
}
