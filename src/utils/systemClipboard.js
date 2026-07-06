// System (OS) clipboard bridge — copies board content OUT to the real clipboard
// so it can be pasted into other apps (Photoshop, Figma, Slack, docs…). Reading
// the clipboard IN is handled by the browser `paste` event in useDrop, which
// gives us the data synchronously without a permission prompt.
//
// Runs on the web Clipboard API, which is available in Electron's Chromium
// renderer. Every call is best-effort and resolves to a boolean so callers can
// surface a quiet toast rather than throw.

// Write plain text to the OS clipboard.
export async function copyTextToClipboard(text) {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// Write an image to the OS clipboard as PNG. `src` may be a data:, blob:,
// asset://, palma:// or http(s) URL. The image is drawn to a canvas and
// re-encoded to PNG because that's the format the clipboard reliably accepts;
// this also normalises jpg/webp/gif sources. Cross-origin remote images that
// refuse CORS will taint the canvas and fail here — caught and reported false.
export async function copyImageToClipboard(src) {
  if (!src || typeof ClipboardItem === 'undefined') return false
  try {
    const blob = await imageToPngBlob(src)
    if (!blob) return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

function imageToPngBlob(src) {
  return new Promise((resolve) => {
    const img = new Image()
    // Ask for CORS-clean pixels so remote images don't taint the canvas; local
    // protocols (data:/blob:/asset:/palma:) ignore it harmlessly.
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((b) => resolve(b), 'image/png')
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// The single image the clipboard should carry for a selection, if any:
// only when the selection is exactly one image (so mixed selections export as
// text instead of an arbitrary member's bytes).
export function singleImageSrc(items = []) {
  return items.length === 1 && items[0].type === 'image' && items[0].src
    ? items[0].src
    : null
}

// The plain-text representation of a selection — note/comment bodies and image
// labels, joined. Shared by the OS-clipboard writer and the internal clipboard's
// signature so a paste can recognise Palma's own copy.
export function itemsToClipboardText(items = []) {
  return items
    .map((it) => it.content || it.label || '')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n')
}

// Best clipboard representation of a set of canvas items:
//   • exactly one image  → the image bytes (so it drops into image apps)
//   • otherwise, any note/comment text (or image labels) joined together
// Returns true if something was written. Used by Copy (Ctrl/⌘+C, context menu).
export async function copyItemsToClipboard(items = []) {
  if (!items.length) return false
  const imgSrc = singleImageSrc(items)
  if (imgSrc) return copyImageToClipboard(imgSrc)
  const text = itemsToClipboardText(items)
  if (text) return copyTextToClipboard(text)
  return false
}
