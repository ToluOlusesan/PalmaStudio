// Focus board + Process Brief rendering. The Dump Board image reuses
// captureBoard.renderBoard; the Focus board (zones + members) is drawn here onto
// an offscreen canvas. The Process Brief assembles a multi-page PDF (jsPDF).
import { zoneLayout, PAD } from './focusLayout.js'
import { zoneFill, zoneStroke } from '../store/focusStore.js'
import { renderBoard, logoDataUrl, LOGO_ASPECT } from './captureBoard.js'

const MAX_EDGE = 14000
const MAX_AREA = 130e6

// Theme palette for Process Brief renders (contact-sheet grid + PDF chrome).
const THEME = {
  light: { bg: '#fafaf8', card: '#ffffff', ink: '#0a0a0a', inkSoft: 'rgba(10,10,10,0.12)', inkText: 'rgba(10,10,10,0.82)' },
  dark: { bg: '#1e1e1e', card: '#262626', ink: '#f4f4f4', inkSoft: 'rgba(244,244,244,0.16)', inkText: 'rgba(244,244,244,0.85)' },
}

function loadImage(src) {
  return new Promise((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}
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
// Fit (never crop) — mirrors the on-screen zone member's object-contain so
// exported Focus pages show the same uncropped framing as the app.
function drawContain(ctx, img, dx, dy, dw, dh) {
  const ir = img.width / img.height
  const br = dw / dh
  let w = dw
  let h = dh
  if (ir > br) {
    h = dw / ir
  } else {
    w = dh * ir
  }
  const x = dx + (dw - w) / 2
  const y = dy + (dh - h) / 2
  ctx.drawImage(img, x, y, w, h)
}
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// Render a set of zones (+ their members) to a data URL. Used for the whole
// Focus board and, per-zone, for the Process Brief pages.
export async function renderFocusBoard(zones, placed, queue, { max = 2400, scale = 2, mime = 'image/png', quality = 0.92 } = {}) {
  if (!zones.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const z of zones) {
    minX = Math.min(minX, z.x)
    minY = Math.min(minY, z.y)
    maxX = Math.max(maxX, z.x + z.width)
    maxY = Math.max(maxY, z.y + z.height)
  }
  const pad = 48
  const bw = maxX - minX + pad * 2
  const bh = maxY - minY + pad * 2
  let s = Math.min(scale, max / bw, max / bh)
  s = Math.max(0.4, s)
  const over = Math.max(Math.max(bw * s, bh * s) / MAX_EDGE, Math.sqrt((bw * s * bh * s) / MAX_AREA), 1)
  if (over > 1) s /= over

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bw * s))
  canvas.height = Math.max(1, Math.round(bh * s))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fafaf8'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const ox = (x) => (x - minX + pad) * s
  const oy = (y) => (y - minY + pad) * s

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* system sans fallback */
    }
  }

  for (const z of zones) {
    roundRect(ctx, ox(z.x), oy(z.y), z.width * s, z.height * s, 12 * s)
    ctx.fillStyle = zoneFill(z.color, 0.1)
    ctx.fill()
    ctx.lineWidth = Math.max(1, 1.5 * s)
    ctx.strokeStyle = zoneStroke(z.color, 0.35)
    ctx.stroke()

    ctx.fillStyle = 'rgba(10,10,10,0.62)'
    ctx.font = `600 ${11 * s}px Inter, system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText((z.name || '').toUpperCase(), ox(z.x) + PAD * s, oy(z.y) + 15 * s)

    const members = placed.filter((p) => p.zoneId === z.id)
    const lay = zoneLayout(z, members.length)
    for (let i = 0; i < members.length; i++) {
      const entry = queue.find((q) => q.id === members[i].queueItemId)
      const cell = lay.cellAt(i)
      const cx = ox(z.x + cell.x)
      const cy = oy(z.y + cell.y)
      const cw = cell.w * s
      const ch = cell.h * s
      roundRect(ctx, cx, cy, cw, ch, 6 * s)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      if (entry && entry.src && (entry.type === 'image' || entry.type === 'video')) {
        const img = await loadImage(entry.src)
        if (img) {
          ctx.save()
          roundRect(ctx, cx, cy, cw, ch, 6 * s)
          ctx.clip()
          try {
            drawContain(ctx, img, cx, cy, cw, ch)
          } catch {
            /* tainted — leave the white cell */
          }
          ctx.restore()
        }
      } else if (entry && (entry.type === 'note' || entry.type === 'comment')) {
        ctx.fillStyle = 'rgba(10,10,10,0.8)'
        ctx.font = `${11 * s}px Inter, system-ui, sans-serif`
        ctx.textBaseline = 'top'
        const text = (entry.content || entry.label || '').slice(0, 120)
        ctx.fillText(text, cx + 6 * s, cy + 6 * s, cw - 12 * s)
      }
      ctx.lineWidth = Math.max(0.5, 0.5 * s)
      ctx.strokeStyle = 'rgba(10,10,10,0.12)'
      roundRect(ctx, cx, cy, cw, ch, 6 * s)
      ctx.stroke()
    }
  }

  try {
    return canvas.toDataURL(mime, quality)
  } catch {
    return null
  }
}

// Focus board as a single-page PDF sized exactly to the rendered image.
export async function focusBoardPdf(zones, placed, queue, scale = 2) {
  const img = await renderFocusBoard(zones, placed, queue, { max: scale >= 2 ? 4000 : 2500, mime: 'image/jpeg', quality: 0.92, scale })
  if (!img) return null
  const { jsPDF } = await import('jspdf')
  const im = await loadImage(img)
  const w = im?.naturalWidth || 1
  const h = im?.naturalHeight || 1
  const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'px', format: [w, h] })
  pdf.addImage(img, 'JPEG', 0, 0, w, h)
  return pdf.output('datauristring')
}

// A clean contact-sheet grid of a zone's members — used for the Process Brief's
// per-zone pages (tidier than rendering the literal zone box).
export async function renderMemberGrid(members, queue, { scale = 2, max = 2200, theme = 'light' } = {}) {
  const pal = THEME[theme] || THEME.light
  const items = members.map((m) => queue.find((q) => q.id === m.queueItemId)).filter(Boolean)
  if (!items.length) return null
  const n = items.length
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(n))))
  const rows = Math.ceil(n / cols)
  const CELL = 300
  const gap = 16
  const pad = 12
  const bw = cols * CELL + (cols - 1) * gap + pad * 2
  const bh = rows * CELL + (rows - 1) * gap + pad * 2
  let s = Math.min(scale, max / bw, max / bh)
  s = Math.max(0.4, s)
  const over = Math.max(Math.max(bw * s, bh * s) / MAX_EDGE, Math.sqrt((bw * s * bh * s) / MAX_AREA), 1)
  if (over > 1) s /= over

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bw * s))
  canvas.height = Math.max(1, Math.round(bh * s))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* system sans */
    }
  }
  for (let i = 0; i < items.length; i++) {
    const entry = items[i]
    const r = Math.floor(i / cols)
    const c = i % cols
    const x = (pad + c * (CELL + gap)) * s
    const y = (pad + r * (CELL + gap)) * s
    const w = CELL * s
    const h = CELL * s
    roundRect(ctx, x, y, w, h, 8 * s)
    ctx.fillStyle = pal.card
    ctx.fill()
    if (entry.src && (entry.type === 'image' || entry.type === 'video')) {
      const img = await loadImage(entry.src)
      if (img) {
        ctx.save()
        roundRect(ctx, x, y, w, h, 8 * s)
        ctx.clip()
        try {
          drawContain(ctx, img, x, y, w, h)
        } catch {
          /* tainted */
        }
        ctx.restore()
      }
    } else if (entry.type === 'note' || entry.type === 'comment') {
      ctx.fillStyle = pal.inkText
      ctx.font = `${14 * s}px Inter, system-ui, sans-serif`
      ctx.textBaseline = 'top'
      const words = (entry.content || entry.label || '').split(/\s+/)
      let line = ''
      let ty = y + 14 * s
      for (const wd of words) {
        const t = line ? line + ' ' + wd : wd
        if (ctx.measureText(t).width > w - 24 * s && line) {
          ctx.fillText(line, x + 12 * s, ty)
          line = wd
          ty += 18 * s
          if (ty > y + h - 18 * s) break
        } else line = t
      }
      if (ty <= y + h - 18 * s) ctx.fillText(line, x + 12 * s, ty)
    }
    ctx.lineWidth = Math.max(0.5, 0.75 * s)
    ctx.strokeStyle = pal.inkSoft
    roundRect(ctx, x, y, w, h, 8 * s)
    ctx.stroke()
  }
  try {
    return canvas.toDataURL('image/png', 0.92)
  } catch {
    return null
  }
}

// A small tile of random per-pixel noise at a low, constant alpha — the same
// "paper grain" idea as the app's .canvas-grain, rasterised once and tiled
// across every Process Brief page (painted right after the flat background, so
// content drawn afterward sits cleanly on top and grain only shows through the
// margins/whitespace — mirroring how the CSS grain sits under cards on-screen).
function grainTileDataUrl(size = 300) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255)
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 12 // subtle — texture, not noise
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}
function paintGrain(pdf, W, H, tile, tileSize = 300) {
  if (!tile) return
  for (let y = 0; y < H; y += tileSize) {
    for (let x = 0; x < W; x += tileSize) {
      pdf.addImage(tile, 'PNG', x, y, Math.min(tileSize, W - x), Math.min(tileSize, H - y))
    }
  }
}

// Scratchpad content is stored as rich-text HTML (see Scratchpad.jsx). Convert
// it to plain text for the Notes page without needing the element in a live
// layout tree: block-level closes and <br> become newlines, <li> gets a bullet,
// remaining tags are stripped, then a detached <textarea> decodes HTML entities
// (a safe, script-free trick — setting innerHTML on a textarea never executes
// markup, and reading .value gives back decoded plain text).
function htmlToPlainText(html) {
  if (!html) return ''
  const s = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '•  ')
    .replace(/<[^>]+>/g, '')
  const ta = document.createElement('textarea')
  ta.innerHTML = s
  return ta.value.replace(/\n{3,}/g, '\n\n').trim()
}

// Rasterise the Palma mark to a PNG data URL (jsPDF can't place SVG directly).
async function logoPng(fill, hPx = 96) {
  const img = await loadImage(logoDataUrl(fill))
  if (!img) return null
  const w = Math.max(1, Math.round(hPx * LOGO_ASPECT))
  const h = Math.max(1, Math.round(hPx))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d').drawImage(img, 0, 0, w, h)
  return c.toDataURL('image/png')
}

// A4-landscape Process Brief: Cover → Dump Board → one page per zone → Notes
// (Scratchpad) → a closing "Powered by Palma" page. Every page — including the
// cover — shares the same paper-textured background and footer bar (logo +
// caption), so the document reads as one cohesive object rather than a stack of
// mismatched pages. `theme` ('light' | 'dark') recolours the whole brief; the
// Palma mark and grain texture both adapt.
export async function processBriefPdf({
  projectName,
  direction,
  dumpItems = [],
  dumpEdges = [],
  zones = [],
  placed = [],
  queue = [],
  notes = [],
  scratchpad = '',
  theme = 'light',
}) {
  const dark = theme === 'dark'
  const { jsPDF } = await import('jspdf')
  // Landscape reads more like a board/presentation than a printed document, and
  // the wider page fits a Dump Board render or a zone's contact-sheet grid with
  // far less letterboxing than portrait did.
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 48
  let pageNum = 1
  const INK = dark ? 244 : 0 // jsPDF single-value grayscale (0–255)
  const INK_SOFT = dark ? 180 : 130
  const RULE = dark ? 90 : 210

  const [logo, grain] = await Promise.all([logoPng(dark ? '#f4f4f4' : '#0a0a0a', 120), Promise.resolve(grainTileDataUrl())])
  const logoH = 13
  const logoW = logoH * LOGO_ASPECT
  const [r, g, b] = dark ? [30, 30, 30] : [250, 250, 248]

  // Page background + paper grain — call right after every new page, cover
  // included, so no page is ever the flat, un-textured odd one out.
  const paper = () => {
    pdf.setFillColor(r, g, b)
    pdf.rect(0, 0, W, H, 'F')
    paintGrain(pdf, W, H, grain)
  }
  const eyebrow = (text, num) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(INK)
    pdf.text((text || '').toUpperCase(), M, M + 2, { charSpace: 1.8 })
    if (num != null) pdf.text(String(num), W - M, M + 2, { align: 'right' })
    pdf.setDrawColor(RULE)
    pdf.setLineWidth(0.5)
    pdf.line(M, M + 12, W - M, M + 12)
  }
  // Every page's closing bar: a short caption, left, and the Palma mark, right —
  // the one element every page shares, which is what makes the document cohere.
  const footer = (text) => {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(INK_SOFT)
    pdf.text(text || '', M, H - M + 6)
    if (logo) pdf.addImage(logo, 'PNG', W - M - logoW, H - M - logoH + 3, logoW, logoH)
  }
  // Centre an image within the content area (below the eyebrow, above the footer).
  const placeCentered = async (dataUrl) => {
    if (!dataUrl) return
    const img = await loadImage(dataUrl)
    if (!img) return
    const top = M + 28
    const boxW = W - 2 * M
    const boxH = H - top - M - 18
    const rr = Math.min(boxW / img.width, boxH / img.height, 1.5)
    const w = img.width * rr
    const h = img.height * rr
    pdf.addImage(dataUrl, 'PNG', M + (boxW - w) / 2, top + (boxH - h) / 2, w, h)
  }
  // Anchor an image at the TOP of a box instead of centring it, returning the y
  // just below it — used on zone pages so pinned comments get a guaranteed slot
  // beneath the grid rather than competing with it for the same centred space.
  const placeTop = async (dataUrl, top, boxW, boxH) => {
    if (!dataUrl) return top
    const img = await loadImage(dataUrl)
    if (!img) return top
    const rr = Math.min(boxW / img.width, boxH / img.height, 1.5)
    const w = img.width * rr
    const h = img.height * rr
    pdf.addImage(dataUrl, 'PNG', M + (boxW - w) / 2, top, w, h)
    return top + h
  }
  // A zone's pinned comments, listed below its reference grid — each as a short
  // annotation with a small rule marking it (echoing the app's comment pin).
  // Gracefully truncates with a "+N more" line rather than drawing off the page.
  const drawZoneComments = (comments, startY, boxW, maxY) => {
    let y = startY
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(INK)
    pdf.text('NOTES', M, y, { charSpace: 1.5 })
    y += 16
    for (let i = 0; i < comments.length; i++) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      const lines = pdf.splitTextToSize(comments[i].content.trim(), boxW - 16)
      const blockH = lines.length * 13 + 10
      if (y + blockH > maxY) {
        const remaining = comments.length - i
        pdf.setFont('helvetica', 'italic')
        pdf.setFontSize(9)
        pdf.setTextColor(INK_SOFT)
        pdf.text(`+ ${remaining} more comment${remaining === 1 ? '' : 's'}`, M, y + 10)
        return y + 20
      }
      pdf.setDrawColor(RULE)
      pdf.setLineWidth(2)
      pdf.line(M, y + 3, M, y + blockH - 6)
      pdf.setTextColor(INK_SOFT)
      pdf.text(lines, M + 10, y + 4)
      y += blockH
    }
    return y
  }

  // --- Cover — same paper + footer bar as every other page, unlike before. ---
  paper()
  if (logo) pdf.addImage(logo, 'PNG', M, M + 6, 22 * LOGO_ASPECT, 22)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.setTextColor(INK)
  pdf.text('PROCESS BRIEF', M, M + 48, { charSpace: 2 })
  pdf.setFont('times', 'bold')
  pdf.setFontSize(40)
  pdf.setTextColor(INK)
  const titleLines = pdf.splitTextToSize(projectName || 'Untitled', W - 2 * M)
  const titleY = H * 0.4
  pdf.text(titleLines, M, titleY)
  let cy = titleY + titleLines.length * 42 + 6
  pdf.setDrawColor(INK)
  pdf.setLineWidth(1)
  pdf.line(M, cy, M + 64, cy)
  cy += 28
  if (direction) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(13)
    pdf.setTextColor(INK_SOFT)
    pdf.text(pdf.splitTextToSize(direction, W - 2 * M), M, cy)
  }
  footer(`Created on: ${new Date().toLocaleDateString()}`)

  // --- The Dump ---
  const dumpImg = await renderBoard(dumpItems, { max: 2400, mime: 'image/png', maxScale: 2, includeText: true, edges: dumpEdges, theme })
  pdf.addPage()
  paper()
  pageNum++
  eyebrow('Dump Board', pageNum)
  await placeCentered(dumpImg)
  footer('All references collected')

  // --- One page per zone (contact-sheet grid, then its pinned comments) ---
  for (const z of zones) {
    const members = placed.filter((p) => p.zoneId === z.id)
    const comments = notes.filter((n) => n.type === 'comment' && n.zoneId === z.id && n.content?.trim())
    if (!members.length && !comments.length) continue
    pdf.addPage()
    paper()
    pageNum++
    eyebrow(z.name || 'Zone', pageNum)

    const top = M + 28
    const boxW = W - 2 * M
    const boxH = H - top - M - 18
    const maxY = H - M - 18
    let cursorY = top
    if (members.length) {
      // Leave room below the grid for comments when the zone has any, rather
      // than letting the grid claim the whole page and centre itself over them.
      const gridBoxH = comments.length ? boxH * 0.6 : boxH
      cursorY = (await placeTop(await renderMemberGrid(members, queue, { theme }), top, boxW, gridBoxH)) + 20
    }
    if (comments.length) drawZoneComments(comments, cursorY, boxW, maxY)

    const parts = []
    if (members.length) parts.push(`${members.length} reference${members.length === 1 ? '' : 's'}`)
    if (comments.length) parts.push(`${comments.length} comment${comments.length === 1 ? '' : 's'}`)
    footer(parts.join(' · '))
  }

  // --- Notes (the project's Scratchpad, if it has anything written) ---
  const notesText = htmlToPlainText(scratchpad)
  if (notesText) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    const bodyW = W - 2 * M
    const lineH = 15.5
    const lines = pdf.splitTextToSize(notesText, bodyW)
    let i = 0
    while (i < lines.length) {
      pdf.addPage()
      paper()
      pageNum++
      eyebrow('Notes', pageNum) // sets bold 8.5 for the header — reset below before the body
      const top = M + 28
      const maxLines = Math.floor((H - top - M - 18) / lineH)
      const slice = lines.slice(i, i + maxLines)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      pdf.setTextColor(INK)
      pdf.text(slice, M, top + 10, { lineHeightFactor: lineH / 11 })
      i += maxLines
      footer('From the Scratchpad')
    }
  }

  // --- Closing page ---
  pdf.addPage()
  paper()
  const closingLogoH = 46
  const closingGap = 20
  const closingText = 'POWERED BY PALMA'
  const closingSize = 9
  const closingSpace = 2 // pt of tracking between characters (see below)
  pdf.setFont('times', 'bold') // the brand serif, matching the cover title
  pdf.setFontSize(closingSize)
  // jsPDF's `align: 'center'` does not account for a custom `charSpace` when
  // centring, so the two together silently push the text off true centre —
  // that's what produced the off-centre closing page. Measure the tracked
  // width ourselves and place the text with an explicit x instead.
  const closingTextW = pdf.getTextWidth(closingText) + closingSpace * (closingText.length - 1)
  const logoW2 = closingLogoH * LOGO_ASPECT
  const blockH = closingLogoH + closingGap + closingSize
  const blockTop = H / 2 - blockH / 2
  if (logo) pdf.addImage(logo, 'PNG', (W - logoW2) / 2, blockTop, logoW2, closingLogoH)
  pdf.setTextColor(INK_SOFT)
  pdf.text(closingText, (W - closingTextW) / 2, blockTop + closingLogoH + closingGap, { charSpace: closingSpace })

  return pdf.output('datauristring')
}
