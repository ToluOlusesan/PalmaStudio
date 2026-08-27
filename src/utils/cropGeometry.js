// Frame-vs-fill geometry for canvas media, so the board can behave like Figma:
// dragging a corner SCALES the card (frame and picture together, aspect locked),
// while Ctrl-dragging CROPS it (the frame changes, the picture stays exactly the
// size it was, and the excess is clipped).
//
// The model: `item.width`/`item.height` are the frame — the box on the board.
// `item.crop` is the picture drawn inside it, in the frame's own coordinates:
//   { w, h }  the drawn size of the whole picture (≥ the frame, or it wouldn't
//             cover), and
//   { x, y }  the picture's top-left relative to the frame's top-left (≤ 0).
// An item with no `crop` is drawn centre-cover, which is what every board made
// before this existed already looked like — so nothing has to be migrated.

export const hasCrop = (item) => !!(item?.crop?.w > 0 && item?.crop?.h > 0)

const round = (n) => Math.round(n * 10) / 10

// Centre-cover geometry: the smallest drawn size that still fills the frame.
export function coverCrop(natW, natH, frameW, frameH) {
  if (!natW || !natH) return { w: frameW, h: frameH, x: 0, y: 0 }
  const k = Math.max(frameW / natW, frameH / natH)
  const w = natW * k
  const h = natH * k
  return { w: round(w), h: round(h), x: round((frameW - w) / 2), y: round((frameH - h) / 2) }
}

// The crop an item is currently showing — its own, or the implicit cover one.
export function resolveCrop(item, natW, natH) {
  return hasCrop(item) ? item.crop : coverCrop(natW, natH, item.width, item.height)
}

// Keep the frame covered: grow the picture if the frame outgrew it (aspect
// locked, focal point preserved), then pull the offsets back inside so no gap
// can show at an edge.
export function clampCrop(crop, frameW, frameH) {
  const k = Math.max(1, frameW / crop.w, frameH / crop.h)
  const w = crop.w * k
  const h = crop.h * k
  const x = Math.min(0, Math.max(frameW - w, crop.x * k))
  const y = Math.min(0, Math.max(frameH - h, crop.y * k))
  return { w: round(w), h: round(h), x: round(x), y: round(y) }
}

// Scale a crop alongside its frame, so a scale-drag keeps the composition.
export function scaleCrop(crop, k) {
  return { w: round(crop.w * k), h: round(crop.h * k), x: round(crop.x * k), y: round(crop.y * k) }
}

// CSS for the media element inside a cropped frame. Absolute so the picture can
// overflow the frame (which clips it); `maxWidth: none` because the surrounding
// card sets img { max-width: 100% } through Tailwind's preflight.
export function cropStyle(crop) {
  return {
    position: 'absolute',
    left: crop.x,
    top: crop.y,
    width: crop.w,
    height: crop.h,
    maxWidth: 'none',
    objectFit: 'fill',
  }
}

// The source rectangle to sample when re-drawing a cropped item onto a canvas
// (board export). Returns null when the item has no crop — callers then use
// their own centre-cover path.
export function cropSourceRect(item, natW, natH) {
  if (!hasCrop(item) || !natW || !natH) return null
  const { w, h, x, y } = item.crop
  const scale = w / natW // drawn px per natural px
  return {
    sx: -x / scale,
    sy: -y / scale,
    sw: item.width / scale,
    sh: item.height / scale,
  }
}

// ---- storyboard panels ---------------------------------------------------
// A Dump Board card owns its pixel size, so its crop can live in pixels. A
// storyboard panel can't: its box changes with the board's panel-size AND its
// aspect ratio, both of which are settings the user flips freely.
//
// So a panel stores its framing as { scale, fx, fy } — how far the picture is
// zoomed past the minimum that covers the frame, and which point of the picture
// sits at the frame's centre. Both are dimensionless, so the framing survives
// any box change, and crucially the picture's own aspect ratio is never stored:
// it's re-derived from the source every render. (Storing width and height as
// separate fractions of the box looks equivalent and isn't — switch the board
// from 16:9 to 9:16 and a square image gets drawn 360×1140.)
//
// { scale: 1, fx: 0.5, fy: 0.5 } is plain centre-cover, which is what an
// untouched panel already shows, so `null` and the default agree.

const isPanelCrop = (c) => !!c && Number.isFinite(c.scale)

// Where the picture sits inside the panel box, in px, clamped so the frame is
// always fully covered (no letterbox bars in a storyboard frame).
export function panelPicture(panel, frameW, frameH, natW, natH) {
  const base = coverCrop(natW, natH, frameW, frameH)
  const crop = isPanelCrop(panel?.crop) ? panel.crop : null
  const scale = Math.max(1, crop?.scale ?? 1)
  const w = base.w * scale
  const h = base.h * scale
  const fx = crop?.fx ?? 0.5
  const fy = crop?.fy ?? 0.5
  return {
    w: round(w),
    h: round(h),
    x: round(Math.min(0, Math.max(frameW - w, frameW / 2 - fx * w))),
    y: round(Math.min(0, Math.max(frameH - h, frameH / 2 - fy * h))),
  }
}

// Turn a dragged/zoomed pixel rect back into the stored framing.
export function panelCropFrom(px, frameW, frameH, natW, natH) {
  const base = coverCrop(natW, natH, frameW, frameH)
  const c = clampCrop(px, frameW, frameH)
  return {
    scale: Math.max(1, c.w / (base.w || 1)),
    fx: (frameW / 2 - c.x) / (c.w || 1),
    fy: (frameH / 2 - c.y) / (c.h || 1),
  }
}
