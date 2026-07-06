// Module-level clipboard for canvas items. Lives outside canvasStore (which is
// re-hydrated per board) so copy/paste works across boards within a session.
//
// Alongside the stripped items we keep a text `signature` — the same text
// copyItemsToClipboard writes to the OS clipboard. On paste, DumpBoard compares
// the OS clipboard's text to this signature to tell "these are the Palma items I
// just copied" (→ rich internal paste) apart from arbitrary external text.
import { itemsToClipboardText, singleImageSrc } from './systemClipboard.js'

let CLIP = []
let SIG = '' // OS-clipboard text this copy mirrored ('' when it mirrored an image)

// Store stripped copies (no id / zIndex — those are assigned fresh on paste).
export function setItemClipboard(items = []) {
  CLIP = items.map((it) => {
    const { id, zIndex, ...rest } = it
    return rest
  })
  // A single-image copy mirrors image bytes (not text) to the OS clipboard, so
  // its signature is empty; everything else mirrors joined text.
  SIG = singleImageSrc(items) ? '' : itemsToClipboardText(items)
}

export function getItemClipboard() {
  return CLIP
}

// The text this copy placed on the OS clipboard (for own-copy detection).
export function getItemClipboardSignature() {
  return SIG
}
