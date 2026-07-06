// Real canvas thumbnails without a DOM-capture library. We draw the board's
// image items onto an offscreen canvas at their relative positions (cover-
// cropped, z-ordered) over the monochrome base. Produces a genuine miniature of
// the layout for dashboard cards.

const BG = '#f5f5f5'
const MAX = 480 // longest edge of the output thumbnail

// Theme-aware render palette. Defaults (light) match every existing caller
// (dashboard thumbnails, board PNG/PDF exports) byte-for-byte; `dark` is opt-in
// via the `theme` option, used by the Process Brief's dark export.
const THEME = {
  light: { bg: '#f5f5f5', ink: '#0a0a0a', inkSoft: 'rgba(10,10,10,0.12)', card: '#ffffff' },
  dark: { bg: '#1e1e1e', ink: '#f4f4f4', inkSoft: 'rgba(244,244,244,0.16)', card: '#262626' },
}

// Safety ceilings for the export canvas — kept under Chromium's limits so a
// high-res export can never silently come back blank.
const MAX_EDGE = 14000 // px per side
const MAX_AREA = 130e6 // ~130 megapixels total

function loadImage(src) {
  return new Promise((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

// Draw `img` to cover the box (dx,dy,dw,dh) — crops overflow like object-cover.
function drawCover(ctx, img, dx, dy, dw, dh) {
  const ir = img.width / img.height
  const br = dw / dh
  let sx = 0
  let sy = 0
  let sw = img.width
  let sh = img.height
  if (ir > br) {
    sw = img.height * br
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / br
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

// Where the ray from an item's centre toward (tx,ty) exits its box — so
// connectors emerge from item edges, mirroring the on-board geometry.
function edgePoint(it, tx, ty) {
  const cx = it.x + it.width / 2
  const cy = it.y + it.height / 2
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx !== 0 ? it.width / 2 / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? it.height / 2 / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

// Draw the connectors (arrows) between items onto the export canvas, edge-to-edge
// with a filled arrowhead at the destination — matching the board's SVG.
function drawEdges(ctx, edges, items, minX, minY, pad, scale, theme = 'light') {
  if (!edges?.length) return
  const byId = new Map(items.map((it) => [it.id, it]))
  const toPx = (p) => ({ x: (p.x - minX + pad) * scale, y: (p.y - minY + pad) * scale })
  const color = theme === 'dark' ? 'rgba(244,244,244,0.5)' : 'rgba(10,10,10,0.45)'
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(1, 1.5 * scale)
  for (const e of edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) continue
    const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
    const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    const p1 = toPx(edgePoint(a, bc.x, bc.y))
    const p2 = toPx(edgePoint(b, ac.x, ac.y))
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    // arrowhead at p2
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const len = Math.max(6, 8 * scale)
    const spread = Math.PI / 7
    ctx.beginPath()
    ctx.moveTo(p2.x, p2.y)
    ctx.lineTo(p2.x - len * Math.cos(ang - spread), p2.y - len * Math.sin(ang - spread))
    ctx.lineTo(p2.x - len * Math.cos(ang + spread), p2.y - len * Math.sin(ang + spread))
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Word-wrap `text` to `maxWidth`, honouring explicit newlines.
function wrapText(ctx, text, maxWidth) {
  const out = []
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line)
        line = word
      } else {
        line = test
      }
    }
    out.push(line)
  }
  return out
}

// Draw a note / comment as a text card. Comments always render expanded (their
// stored width/height is the expanded size) and carry a small accent dot.
function drawTextCard(ctx, it, x, y, w, h, scale, theme = 'light') {
  const pal = THEME[theme] || THEME.light
  const isComment = it.type === 'comment'
  roundRect(ctx, x, y, w, h, 6 * scale)
  // Notes carry a paper tint (the user's chosen colour, unaffected by theme —
  // a coloured sticky note reads the same on any page); comments stay on the
  // theme's card surface with a coloured marker dot.
  ctx.fillStyle = !isComment && it.color ? it.color : pal.card
  ctx.fill()
  ctx.lineWidth = Math.max(1, 0.6 * scale)
  ctx.strokeStyle = pal.inkSoft
  ctx.stroke()

  const pad = 11 * scale
  const fontPx = (isComment ? 12 : 13) * scale
  ctx.font = `${fontPx}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillStyle = pal.ink
  const lines = wrapText(ctx, it.content || '', w - pad * 2 - (isComment ? 8 * scale : 0))
  const lh = fontPx * 1.5
  let ty = y + pad
  for (const ln of lines) {
    if (ty + lh > y + h - pad * 0.5) break
    ctx.fillText(ln, x + pad, ty)
    ty += lh
  }
  if (isComment) {
    ctx.fillStyle = it.color || '#8A8F98'
    ctx.beginPath()
    ctx.arc(x + w - pad, y + pad + 1 * scale, 3 * scale, 0, Math.PI * 2)
    ctx.fill()
  }
}

// The Palma mark (the brand island), kept in sync with components/Logo.jsx.
// viewBox 0 0 1072.85 860.96. We rasterise it from an inline SVG data URL so it
// can be drawn onto the export canvas.
const LOGO_VIEWBOX = { w: 1072.85, h: 860.96 }
const LOGO_PATHS =
  '<path d="m917.93,344.39c-13.59,25.56-27.04,48.06-37.83,71.78-18.23,40.07-30.34,82.03-31.41,126.49-.09,3.69,1.44,8.93,4.11,10.95,56.42,42.71,117.73,75.42,187.73,89.82,6.94,1.43,13.96,2.45,20.97,3.52,6.3.97,12.04,3.01,11.19,10.68-.82,7.38-6.78,9.4-13.08,8.54-16.16-2.2-32.52-3.82-48.3-7.72-65.49-16.19-122.75-48.97-176.08-89.28-61.55-46.53-114.73-101.8-166.07-159.02-19.14-21.34-38.64-42.35-58.21-63.3-5.24-5.61-11.02-10.82-17.08-15.54-15.98-12.46-31.59-13.06-47.21.02-13.18,11.03-25.11,23.63-37.01,36.09-34.47,36.12-67.42,73.79-103.19,108.56-94.39,91.78-202.52,161.76-329.23,200.83-14.11,4.35-28.66,7.3-43.08,10.58-6.47,1.47-13.03.96-14.66-7.03-1.6-7.86,3.92-10.66,10.58-12.28,95.8-23.27,181.65-67.43,260.95-125.07,3.44-2.5,5.71-8.53,6.05-13.09,4.55-61.5-3.13-121.82-18.43-181.33-12.16-47.32-29.5-92.71-51.31-136.4-1.36-2.72-2.89-5.37-4.65-8.63-21.96,12.19-39.52,28.83-54.74,47.99-25.76,32.42-43.14,68.7-49.66,109.92-.46,2.92-3.83,5.38-5.85,8.06-1.88-2.52-4.76-4.78-5.48-7.6-8.93-35.2-1.13-67.86,16.37-98.59,16.7-29.32,41.3-50.24,71.73-64.48,3.28-1.54,6.59-3.03,11.8-5.43-20.83-5.11-39.94-6.18-59.24-5.02-53.11,3.2-99.24,22.66-138.07,59.25-2.14,2.01-5.66,2.55-8.54,3.78-.26-3.37-1.72-7.21-.59-10.02,11.52-28.77,32.36-49.33,59.27-63.55,45.45-24.01,92.11-20.23,138.95-4.19,2.87.98,5.71,2.08,8.53,3.12.38-.87.9-1.57.75-1.77-29.85-40.52-66.29-72.26-116.57-84.08-14.54-3.42-29.9-3.27-44.83-5.15-3.25-.41-6.28-2.48-9.42-3.78,2.47-2.66,4.44-6.49,7.5-7.79,44.6-19.01,98.07-8.44,132.58,28.45,16.43,17.56,29.27,38.46,43.15,57.05,1.56-9.29,3.09-20.97,5.54-32.44,7.36-34.46,21.68-65.46,47.17-90.45C294.66,15.62,320.29,2.59,350.81.18c3.05-.24,6.25-.32,9.2.34,1.76.39,4.12,2.15,4.47,3.69.36,1.58-1.06,3.93-2.33,5.41-1.13,1.31-3.07,2.01-4.74,2.77-52.77,23.8-85.82,65.83-108.03,117.59-5.66,13.2-9.69,27.1-14.46,40.68.69.47,1.39.94,2.08,1.41,3.76-3.25,7.45-6.6,11.29-9.75,29.99-24.62,63.48-41.49,102.76-44.04,32.54-2.11,63.12,4.79,90.45,23.46,1.78,1.22,3.95,2.19,5.16,3.85,2.71,3.68,4.92,7.73,7.33,11.63-4.5,0-9.32,1.11-13.44-.13-68.59-20.73-132.66-10.07-193.2,28.99,3.02,0,6.03-.07,9.05.01,47.83,1.27,90.05,15.51,119.7,55.27,8.46,11.34,13.41,25.38,19.25,38.51,1.1,2.48-1.2,6.48-1.94,9.77-2.68-1.67-6.07-2.77-7.95-5.09-35.22-43.43-80.78-69.62-135.01-81.48-2.95-.64-6.02-.72-10.6-1.24,57.22,96.41,85.85,199.68,88.14,312.22,4.04-3.08,6.89-5.1,9.57-7.33,48.53-40.34,91.47-86.22,133-133.55,15.25-17.38,30.25-35.05,46.55-51.4,37.36-37.45,70.17-37.62,106.69.67,28.71,30.09,54.74,62.72,83.33,92.94,33.66,35.57,68.76,69.78,103.32,104.49,3.4,3.42,7.38,6.27,12.25,10.35,10.94-71.77,38.35-134.82,83.88-192.27-10.73-2.36-20.05-5.06-29.56-6.39-33.32-4.64-65.08.74-95.09,16.07-1.1.56-2.17,1.49-3.31,1.59-3.04.26-6.11.17-9.17.21.68-3.07.31-7.26,2.2-9.01,9.66-8.89,18.85-19.07,30.13-25.27,33.2-18.26,66.58-13.35,99.19,3.06,2.18,1.1,4.33,2.28,8.55,4.5-2.01-5.32-3.26-8.91-4.72-12.42-9.64-23.1-23.53-43.2-42.35-59.82-14.51-12.81-31.1-20.79-50.57-22.73-3.19-.32-6.15-2.93-9.21-4.47,2.51-2.7,4.51-6.64,7.6-7.92,23.78-9.78,46.06-6.25,65.92,9.79,26.27,21.22,38.81,50.26,45.21,82.51.39,1.98.72,3.98,1.27,7,6.65-8.77,12.21-16.78,18.44-24.21,30.22-36.03,70.59-48.42,112.62-34.16,5.1,1.73,9.08,6.76,13.57,10.25-5.03,1.22-10.08,3.54-15.1,3.5-46.6-.37-83.13,20.66-115.76,53.07,13.06-.75,24.92-2.41,36.68-1.92,37.32,1.57,69.11,14.74,90.91,46.68,3.6,5.28,6.36,11.3,8.52,17.33.93,2.59-.66,6.08-1.1,9.16-2.7-.94-5.89-1.27-8.02-2.94-6.77-5.32-12.79-11.65-19.74-16.7-29.97-21.77-63.67-33.27-100.59-35.5-1.84-.11-3.7-.15-5.54-.09-.48.02-.93.56-2.11,1.32,4.18,3.34,8.3,6.33,12.09,9.71,28.75,25.64,42.44,56.86,35.09,95.74-.4,2.1-.65,4.48-1.82,6.14-1.6,2.27-4.01,3.96-6.08,5.9-1.6-2.32-4.38-4.52-4.64-6.99-3.32-31.89-16.53-59.72-34.77-85.45-4.57-6.44-10.04-12.25-17.39-21.13Z"/>' +
  '<path d="m355.07,704.91c-70.95,2.33-139.05,16.95-205.53,40.28-3.77,1.32-7.57,3.05-11.47,3.4-2.9.26-5.98-1.39-8.98-2.19,1.35-3.05,1.87-7.58,4.2-8.9,9.36-5.3,19.07-10.1,29.02-14.19,80.85-33.16,165.01-44.28,251.84-37.32,67.69,5.43,132.79,23.37,197.99,40.85,70.15,18.82,140.79,33.76,214.17,30.8,47.5-1.91,93.52-10.89,138.67-25.21,2.35-.74,4.76-2.03,7.08-1.91,2.41.13,5.9,1.06,6.8,2.75.95,1.79.28,5.96-1.24,7.25-4.18,3.53-8.95,6.56-13.89,8.95-44.65,21.59-92.34,29.84-141.43,31.72-69.77,2.67-137.2-11.22-204.36-28.09-55.54-13.94-111.19-27.74-167.35-38.78-31.25-6.14-63.63-6.49-95.51-9.45Z"/>' +
  '<path d="m575.09,468.99c15.04,1.3,27.82,8.93,30.84,24.63,6.33,32.9,29.07,45.83,57.96,53.05,8.96,2.24,17.87,4.66,26.8,7.02,21.36,5.64,40.65,15.4,59.16,27.49,19.78,12.93,40.64,24.18,60.88,36.42,2.8,1.69,4.73,4.84,7.06,7.32-3.47.99-7.51,3.65-10.31,2.69-16.25-5.55-33.62-9.67-47.98-18.53-31.49-19.43-65.1-31.6-101.14-38.73-12.2-2.42-24.12-7.4-35.46-12.73-17.88-8.42-29.6-22.7-34.91-41.97-.82-2.96-1.83-5.89-2.94-8.75-3.57-9.21-8.64-12.15-18.05-8.68-8.02,2.95-15.6,7.21-23.11,11.38-25.82,14.35-50.74,30.61-77.49,42.88-21.88,10.03-45.85,15.58-69.02,22.69-4.59,1.41-9.79,1.27-14.68,1.12-2.05-.06-4.04-2-6.06-3.09,1.32-2.17,2.48-4.48,4.05-6.46.67-.84,2.16-1.1,3.34-1.46,47.06-14.47,88.45-39.97,129.43-66.34,12.92-8.32,26.23-16.13,39.87-23.18,6.65-3.44,14.48-4.59,21.77-6.78Z"/>' +
  '<path d="m640.65,813.72c30.84,1.96,60.19,8.98,89.47,16.55,35.37,9.15,71.26,14.35,107.88,13.68,1.54-.03,3.25-.37,4.58.18,2.06.84,3.86,2.32,5.77,3.53-1.54,1.98-2.72,5.15-4.67,5.73-7.95,2.34-16.05,4.48-24.24,5.6-34.46,4.73-68.36.54-101.58-8.57-41.5-11.38-83.11-20.81-126.63-17.35-2.6.21-5.43-2.51-8.15-3.87,2.27-2.17,4.26-5.74,6.87-6.28,16.82-3.44,33.78-6.22,50.69-9.21Z"/>'

export const LOGO_ASPECT = LOGO_VIEWBOX.w / LOGO_VIEWBOX.h
export function logoDataUrl(fill) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_VIEWBOX.w} ${LOGO_VIEWBOX.h}" fill="${fill}">` +
    LOGO_PATHS +
    '</svg>'
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

// Stamp the Palma mark in the bottom-left corner — used on exports only. Brand
// rule: the logo is never recoloured/skewed/shadowed, so we use the sanctioned
// light-mode ink and a gentle overall opacity for a quiet mark.
async function drawWatermark(ctx, cw, ch) {
  const img = await loadImage(logoDataUrl('#0a0a0a'))
  if (!img) return
  const h = Math.max(16, Math.round(Math.min(cw, ch) * 0.05))
  const w = Math.round(h * (LOGO_VIEWBOX.w / LOGO_VIEWBOX.h))
  const margin = Math.round(h * 0.9)
  ctx.save()
  ctx.globalAlpha = 0.72
  ctx.drawImage(img, margin, ch - margin - h, w, h)
  ctx.restore()
}

// Render the board onto an offscreen canvas. Images are always drawn; with
// includeText, notes and comments are drawn too (comments forced expanded).
// With watermark, the Palma logo is stamped in the bottom-left corner.
// Returns a data URL, or null if there's nothing drawable / the canvas tainted.
export async function renderBoard(
  items = [],
  {
    max = MAX,
    mime = 'image/jpeg',
    quality = 0.72,
    maxScale = 1,
    includeText = false,
    watermark = false,
    edges = [],
    theme = 'light',
  } = {}
) {
  const pal = THEME[theme] || THEME.light
  const drawable = items
    .filter(
      (it) =>
        (it.type === 'image' && it.src && !it.missing) ||
        (includeText &&
          (it.type === 'note' || it.type === 'comment') &&
          String(it.content || '').trim())
    )
    // comments (annotations) draw last so they sit on top, like on the board
    .sort(
      (a, b) =>
        (a.type === 'comment' ? 1 : 0) - (b.type === 'comment' ? 1 : 0) ||
        (a.zIndex || 0) - (b.zIndex || 0)
    )
  if (drawable.length === 0) return null

  // bounding box of all drawable items, in world coords
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const it of drawable) {
    minX = Math.min(minX, it.x)
    minY = Math.min(minY, it.y)
    maxX = Math.max(maxX, it.x + it.width)
    maxY = Math.max(maxY, it.y + it.height)
  }
  const pad = 24
  const bw = maxX - minX + pad * 2
  const bh = maxY - minY + pad * 2

  let scale = Math.min(max / bw, max / bh, maxScale)
  let cw = Math.max(1, Math.round(bw * scale))
  let ch = Math.max(1, Math.round(bh * scale))

  // Guard against Chromium's hard canvas limits (~16384px per side and a total
  // area cap). Past them the canvas silently yields a blank image, so scale back
  // to fit while keeping the aspect ratio.
  const over = Math.max(Math.max(cw, ch) / MAX_EDGE, Math.sqrt((cw * ch) / MAX_AREA), 1)
  if (over > 1) {
    scale /= over
    cw = Math.max(1, Math.round(bw * scale))
    ch = Math.max(1, Math.round(bh * scale))
  }

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, cw, ch)

  // Make sure the UI font is ready before drawing any text.
  if (includeText && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* fall back to system sans */
    }
  }

  for (const it of drawable) {
    const dx = (it.x - minX + pad) * scale
    const dy = (it.y - minY + pad) * scale
    const dw = it.width * scale
    const dh = it.height * scale
    if (it.type === 'image') {
      const img = await loadImage(it.src)
      if (!img) continue
      try {
        drawCover(ctx, img, dx, dy, dw, dh)
      } catch {
        /* tainted (cross-origin) image — skip it */
      }
    } else {
      drawTextCard(ctx, it, dx, dy, dw, dh, scale, theme)
    }
  }

  // Connectors on top of content so the arrows read clearly (lines run
  // edge-to-edge, so they never cover an item's interior).
  drawEdges(ctx, edges, items, minX, minY, pad, scale, theme)

  if (watermark) await drawWatermark(ctx, cw, ch)

  try {
    return canvas.toDataURL(mime, quality)
  } catch {
    return null // canvas tainted by a cross-origin draw
  }
}

// Small JPEG miniature for dashboard cards — images only.
export const captureBoard = (items = []) => renderBoard(items, { max: MAX })

// Lossless PNG for "Export board" — includes notes + comments and the connector
// arrows between items. `scale` (1 or 2) is the resolution multiplier: 2× yields
// a crisper, larger file; 1× keeps it small. Detail is still bounded by each
// source image's native pixels.
export const exportBoardImage = (items = [], edges = [], scale = 2) =>
  renderBoard(items, {
    max: scale >= 2 ? 5000 : 2500,
    mime: 'image/png',
    maxScale: scale,
    includeText: true,
    watermark: true,
    edges,
  })

// PDF: render the board to a JPEG and wrap it in a single PDF page sized exactly
// to the image. JPEG (not PNG) keeps the file an order of magnitude smaller —
// a board PDF should be a few MB, not 40+. Returns a data: URI, or null.
export async function boardToPdfDataUri(items = [], edges = [], scale = 2) {
  const jpeg = await renderBoard(items, {
    max: scale >= 2 ? 6000 : 3000,
    mime: 'image/jpeg',
    quality: 0.9,
    maxScale: scale,
    includeText: true,
    watermark: true,
    edges,
  })
  if (!jpeg) return null
  const img = await loadImage(jpeg)
  if (!img) return null
  const w = img.naturalWidth || 1
  const h = img.naturalHeight || 1
  const { jsPDF } = await import('jspdf') // lazy — only when exporting a PDF
  const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'px', format: [w, h] })
  pdf.addImage(jpeg, 'JPEG', 0, 0, w, h)
  return pdf.output('datauristring')
}
