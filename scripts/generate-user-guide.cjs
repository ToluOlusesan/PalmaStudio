// Generates Palma-User-Guide.pdf at the repo root.
// Run: node scripts/generate-user-guide.cjs
//
// Standalone (no Electron/browser) — uses jsPDF's Node build directly, with
// DM Serif Display / Inter / JetBrains Mono embedded as real vector fonts
// (converted once from the @fontsource woff files into scripts/fonts/*.ttf
// via fonttools, since jsPDF's addFont needs ttf, not woff).
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { jsPDF } = require('jspdf/dist/jspdf.node.js')

const ROOT = path.join(__dirname, '..')
const FONT_DIR = path.join(__dirname, 'fonts')
const OUT_PATH = path.join(ROOT, 'Palma-User-Guide.pdf')

const VERSION = require(path.join(ROOT, 'package.json')).version
const GENERATED = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

// ---------------------------------------------------------------- palette --
const PAPER = [250, 250, 248]
const INK = 10
const INK_SOFT = 120
const INK_FAINT = 165
const RULE = 205
const CARD_BG = [242, 242, 239]

// ------------------------------------------------------------------ setup --
const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
const W = pdf.internal.pageSize.getWidth()
const H = pdf.internal.pageSize.getHeight()
const M = 54

function loadFont(file, name, style) {
  const b64 = fs.readFileSync(path.join(FONT_DIR, file)).toString('base64')
  pdf.addFileToVFS(file, b64)
  pdf.addFont(file, name, style)
}
loadFont('DMSerifDisplay-Regular.ttf', 'DMSerif', 'normal')
loadFont('DMSerifDisplay-Italic.ttf', 'DMSerif', 'italic')
loadFont('Inter-Regular.ttf', 'Inter', 'normal')
loadFont('Inter-Bold.ttf', 'Inter', 'bold')
loadFont('Inter-Italic.ttf', 'Inter', 'italic')
loadFont('JetBrainsMono-Regular.ttf', 'Mono', 'normal')

// -------------------------------------------------------------------- logo --
const LOGO_VIEWBOX = { w: 1072.85, h: 860.96 }
const LOGO_PATHS = [
  'm917.93,344.39c-13.59,25.56-27.04,48.06-37.83,71.78-18.23,40.07-30.34,82.03-31.41,126.49-.09,3.69,1.44,8.93,4.11,10.95,56.42,42.71,117.73,75.42,187.73,89.82,6.94,1.43,13.96,2.45,20.97,3.52,6.3.97,12.04,3.01,11.19,10.68-.82,7.38-6.78,9.4-13.08,8.54-16.16-2.2-32.52-3.82-48.3-7.72-65.49-16.19-122.75-48.97-176.08-89.28-61.55-46.53-114.73-101.8-166.07-159.02-19.14-21.34-38.64-42.35-58.21-63.3-5.24-5.61-11.02-10.82-17.08-15.54-15.98-12.46-31.59-13.06-47.21.02-13.18,11.03-25.11,23.63-37.01,36.09-34.47,36.12-67.42,73.79-103.19,108.56-94.39,91.78-202.52,161.76-329.23,200.83-14.11,4.35-28.66,7.3-43.08,10.58-6.47,1.47-13.03.96-14.66-7.03-1.6-7.86,3.92-10.66,10.58-12.28,95.8-23.27,181.65-67.43,260.95-125.07,3.44-2.5,5.71-8.53,6.05-13.09,4.55-61.5-3.13-121.82-18.43-181.33-12.16-47.32-29.5-92.71-51.31-136.4-1.36-2.72-2.89-5.37-4.65-8.63-21.96,12.19-39.52,28.83-54.74,47.99-25.76,32.42-43.14,68.7-49.66,109.92-.46,2.92-3.83,5.38-5.85,8.06-1.88-2.52-4.76-4.78-5.48-7.6-8.93-35.2-1.13-67.86,16.37-98.59,16.7-29.32,41.3-50.24,71.73-64.48,3.28-1.54,6.59-3.03,11.8-5.43-20.83-5.11-39.94-6.18-59.24-5.02-53.11,3.2-99.24,22.66-138.07,59.25-2.14,2.01-5.66,2.55-8.54,3.78-.26-3.37-1.72-7.21-.59-10.02,11.52-28.77,32.36-49.33,59.27-63.55,45.45-24.01,92.11-20.23,138.95-4.19,2.87.98,5.71,2.08,8.53,3.12.38-.87.9-1.57.75-1.77-29.85-40.52-66.29-72.26-116.57-84.08-14.54-3.42-29.9-3.27-44.83-5.15-3.25-.41-6.28-2.48-9.42-3.78,2.47-2.66,4.44-6.49,7.5-7.79,44.6-19.01,98.07-8.44,132.58,28.45,16.43,17.56,29.27,38.46,43.15,57.05,1.56-9.29,3.09-20.97,5.54-32.44,7.36-34.46,21.68-65.46,47.17-90.45C294.66,15.62,320.29,2.59,350.81.18c3.05-.24,6.25-.32,9.2.34,1.76.39,4.12,2.15,4.47,3.69.36,1.58-1.06,3.93-2.33,5.41-1.13,1.31-3.07,2.01-4.74,2.77-52.77,23.8-85.82,65.83-108.03,117.59-5.66,13.2-9.69,27.1-14.46,40.68.69.47,1.39.94,2.08,1.41,3.76-3.25,7.45-6.6,11.29-9.75,29.99-24.62,63.48-41.49,102.76-44.04,32.54-2.11,63.12,4.79,90.45,23.46,1.78,1.22,3.95,2.19,5.16,3.85,2.71,3.68,4.92,7.73,7.33,11.63-4.5,0-9.32,1.11-13.44-.13-68.59-20.73-132.66-10.07-193.2,28.99,3.02,0,6.03-.07,9.05.01,47.83,1.27,90.05,15.51,119.7,55.27,8.46,11.34,13.41,25.38,19.25,38.51,1.1,2.48-1.2,6.48-1.94,9.77-2.68-1.67-6.07-2.77-7.95-5.09-35.22-43.43-80.78-69.62-135.01-81.48-2.95-.64-6.02-.72-10.6-1.24,57.22,96.41,85.85,199.68,88.14,312.22,4.04-3.08,6.89-5.1,9.57-7.33,48.53-40.34,91.47-86.22,133-133.55,15.25-17.38,30.25-35.05,46.55-51.4,37.36-37.45,70.17-37.62,106.69.67,28.71,30.09,54.74,62.72,83.33,92.94,33.66,35.57,68.76,69.78,103.32,104.49,3.4,3.42,7.38,6.27,12.25,10.35,10.94-71.77,38.35-134.82,83.88-192.27-10.73-2.36-20.05-5.06-29.56-6.39-33.32-4.64-65.08.74-95.09,16.07-1.1.56-2.17,1.49-3.31,1.59-3.04.26-6.11.17-9.17.21.68-3.07.31-7.26,2.2-9.01,9.66-8.89,18.85-19.07,30.13-25.27,33.2-18.26,66.58-13.35,99.19,3.06,2.18,1.1,4.33,2.28,8.55,4.5-2.01-5.32-3.26-8.91-4.72-12.42-9.64-23.1-23.53-43.2-42.35-59.82-14.51-12.81-31.1-20.79-50.57-22.73-3.19-.32-6.15-2.93-9.21-4.47,2.51-2.7,4.51-6.64,7.6-7.92,23.78-9.78,46.06-6.25,65.92,9.79,26.27,21.22,38.81,50.26,45.21,82.51.39,1.98.72,3.98,1.27,7,6.65-8.77,12.21-16.78,18.44-24.21,30.22-36.03,70.59-48.42,112.62-34.16,5.1,1.73,9.08,6.76,13.57,10.25-5.03,1.22-10.08,3.54-15.1,3.5-46.6-.37-83.13,20.66-115.76,53.07,13.06-.75,24.92-2.41,36.68-1.92,37.32,1.57,69.11,14.74,90.91,46.68,3.6,5.28,6.36,11.3,8.52,17.33.93,2.59-.66,6.08-1.1,9.16-2.7-.94-5.89-1.27-8.02-2.94-6.77-5.32-12.79-11.65-19.74-16.7-29.97-21.77-63.67-33.27-100.59-35.5-1.84-.11-3.7-.15-5.54-.09-.48.02-.93.56-2.11,1.32,4.18,3.34,8.3,6.33,12.09,9.71,28.75,25.64,42.44,56.86,35.09,95.74-.4,2.1-.65,4.48-1.82,6.14-1.6,2.27-4.01,3.96-6.08,5.9-1.6-2.32-4.38-4.52-4.64-6.99-3.32-31.89-16.53-59.72-34.77-85.45-4.57-6.44-10.04-12.25-17.39-21.13Z',
  'm355.07,704.91c-70.95,2.33-139.05,16.95-205.53,40.28-3.77,1.32-7.57,3.05-11.47,3.4-2.9.26-5.98-1.39-8.98-2.19,1.35-3.05,1.87-7.58,4.2-8.9,9.36-5.3,19.07-10.1,29.02-14.19,80.85-33.16,165.01-44.28,251.84-37.32,67.69,5.43,132.79,23.37,197.99,40.85,70.15,18.82,140.79,33.76,214.17,30.8,47.5-1.91,93.52-10.89,138.67-25.21,2.35-.74,4.76-2.03,7.08-1.91,2.41.13,5.9,1.06,6.8,2.75.95,1.79.28,5.96-1.24,7.25-4.18,3.53-8.95,6.56-13.89,8.95-44.65,21.59-92.34,29.84-141.43,31.72-69.77,2.67-137.2-11.22-204.36-28.09-55.54-13.94-111.19-27.74-167.35-38.78-31.25-6.14-63.63-6.49-95.51-9.45Z',
  'm575.09,468.99c15.04,1.3,27.82,8.93,30.84,24.63,6.33,32.9,29.07,45.83,57.96,53.05,8.96,2.24,17.87,4.66,26.8,7.02,21.36,5.64,40.65,15.4,59.16,27.49,19.78,12.93,40.64,24.18,60.88,36.42,2.8,1.69,4.73,4.84,7.06,7.32-3.47.99-7.51,3.65-10.31,2.69-16.25-5.55-33.62-9.67-47.98-18.53-31.49-19.43-65.1-31.6-101.14-38.73-12.2-2.42-24.12-7.4-35.46-12.73-17.88-8.42-29.6-22.7-34.91-41.97-.82-2.96-1.83-5.89-2.94-8.75-3.57-9.21-8.64-12.15-18.05-8.68-8.02,2.95-15.6,7.21-23.11,11.38-25.82,14.35-50.74,30.61-77.49,42.88-21.88,10.03-45.85,15.58-69.02,22.69-4.59,1.41-9.79,1.27-14.68,1.12-2.05-.06-4.04-2-6.06-3.09,1.32-2.17,2.48-4.48,4.05-6.46.67-.84,2.16-1.1,3.34-1.46,47.06-14.47,88.45-39.97,129.43-66.34,12.92-8.32,26.23-16.13,39.87-23.18,6.65-3.44,14.48-4.59,21.77-6.78Z',
  'm640.65,813.72c30.84,1.96,60.19,8.98,89.47,16.55,35.37,9.15,71.26,14.35,107.88,13.68,1.54-.03,3.25-.37,4.58.18,2.06.84,3.86,2.32,5.77,3.53-1.54,1.98-2.72,5.15-4.67,5.73-7.95,2.34-16.05,4.48-24.24,5.6-34.46,4.73-68.36.54-101.58-8.57-41.5-11.38-83.11-20.81-126.63-17.35-2.6.21-5.43-2.51-8.15-3.87,2.27-2.17,4.26-5.74,6.87-6.28,16.82-3.44,33.78-6.22,50.69-9.21Z',
].map((d) => `<path d="${d}"/>`).join('')
const LOGO_ASPECT = LOGO_VIEWBOX.w / LOGO_VIEWBOX.h

async function logoPng(fillHex, hPx) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_VIEWBOX.w} ${LOGO_VIEWBOX.h}" fill="${fillHex}">${LOGO_PATHS}</svg>`
  const wPx = Math.max(1, Math.round(hPx * LOGO_ASPECT))
  const buf = await sharp(Buffer.from(svg)).resize(wPx, Math.round(hPx)).png().toBuffer()
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, w: wPx, h: Math.round(hPx) }
}

// ------------------------------------------------------------------ grain --
async function grainTile(size = 300) {
  const raw = Buffer.alloc(size * size * 4)
  for (let i = 0; i < raw.length; i += 4) {
    const v = Math.floor(Math.random() * 255)
    raw[i] = v; raw[i + 1] = v; raw[i + 2] = v; raw[i + 3] = 12
  }
  const buf = await sharp(raw, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
  return `data:image/png;base64,${buf.toString('base64')}`
}

function paintGrain(tile, tileSize = 300) {
  for (let y = 0; y < H; y += tileSize) {
    for (let x = 0; x < W; x += tileSize) {
      pdf.addImage(tile, 'PNG', x, y, Math.min(tileSize, W - x), Math.min(tileSize, H - y))
    }
  }
}

// --------------------------------------------------------------- chrome ----
let grain, logoDark
let pageNum = 2 // cover (unnumbered) + Contents (02) already used

function paper() {
  pdf.setFillColor(...PAPER)
  pdf.rect(0, 0, W, H, 'F')
  paintGrain(grain)
}

function eyebrow(text, num) {
  pdf.setFont('Inter', 'bold')
  pdf.setFontSize(8.5)
  pdf.setTextColor(INK)
  pdf.text(text.toUpperCase(), M, M + 2, { charSpace: 1.6 })
  if (num != null) {
    pdf.text(String(num).padStart(2, '0'), W - M, M + 2, { align: 'right' })
  }
  pdf.setDrawColor(RULE)
  pdf.setLineWidth(0.5)
  pdf.line(M, M + 12, W - M, M + 12)
}

function footer(caption) {
  pdf.setFont('Inter', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(INK_FAINT)
  pdf.text(caption || '', M, H - M + 8)
  const logoH = 13
  const logoW = logoH * LOGO_ASPECT
  pdf.addImage(logoDark, 'PNG', W - M - logoW, H - M - logoH + 5, logoW, logoH)
}

function newPage(label, caption) {
  pdf.addPage()
  paper()
  pageNum += 1
  eyebrow(label, pageNum)
  footer(caption)
}

// ------------------------------------------------------------ text runs ----
// Minimal inline markup: **bold**, `code` (monospace pill), _italic_.
function tokenizeRuns(str) {
  const runs = []
  const re = /\*\*(.+?)\*\*|`(.+?)`|_(.+?)_/g
  let last = 0, m
  while ((m = re.exec(str))) {
    if (m.index > last) runs.push({ text: str.slice(last, m.index), style: 'normal' })
    if (m[1] != null) runs.push({ text: m[1], style: 'bold' })
    else if (m[2] != null) runs.push({ text: m[2], style: 'code' })
    else if (m[3] != null) runs.push({ text: m[3], style: 'italic' })
    last = re.lastIndex
  }
  if (last < str.length) runs.push({ text: str.slice(last), style: 'normal' })
  return runs
}

function styleFont(style) {
  if (style === 'bold') return ['Inter', 'bold']
  if (style === 'italic') return ['Inter', 'italic']
  if (style === 'code') return ['Mono', 'normal']
  return ['Inter', 'normal']
}

// Word-wraps a run-annotated paragraph to `maxWidth`, drawing it at (x, y),
// returning the y just below the last line. Code spans get a soft pill.
function richParagraph(str, x, y, maxWidth, { size = 10.5, lineHeight = 16, color = INK } = {}) {
  const runs = tokenizeRuns(str)
  const words = []
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/).filter((p) => p.length)
    for (const p of parts) words.push({ text: p, style: run.style, isSpace: /^\s+$/.test(p) })
  }
  const [spF, spS] = styleFont('normal')
  pdf.setFont(spF, spS); pdf.setFontSize(size)
  const spaceW = pdf.getTextWidth(' ')

  let lines = [[]]
  let lineW = 0
  for (const w of words) {
    if (w.isSpace) {
      if (lineW > 0) { lines[lines.length - 1].push(w); lineW += spaceW }
      continue
    }
    const [f, s] = styleFont(w.style)
    pdf.setFont(f, s); pdf.setFontSize(w.style === 'code' ? size - 1 : size)
    const ww = pdf.getTextWidth(w.text) + (w.style === 'code' ? 8 : 0)
    if (lineW + ww > maxWidth && lineW > 0) {
      while (lines[lines.length - 1].length && lines[lines.length - 1][lines[lines.length - 1].length - 1].isSpace) {
        lines[lines.length - 1].pop()
      }
      lines.push([])
      lineW = 0
    }
    lines[lines.length - 1].push({ ...w, width: ww })
    lineW += ww
  }

  let cy = y
  for (const line of lines) {
    let cx = x
    for (const w of line) {
      if (w.isSpace) { cx += spaceW; continue }
      const [f, s] = styleFont(w.style)
      const fsz = w.style === 'code' ? size - 1 : size
      pdf.setFont(f, s); pdf.setFontSize(fsz)
      if (w.style === 'code') {
        pdf.setFillColor(...CARD_BG)
        pdf.roundedRect(cx, cy - fsz + 1, w.width, fsz + 4, 2, 2, 'F')
        pdf.setTextColor(70)
        pdf.text(w.text, cx + 4, cy + 2)
      } else {
        pdf.setTextColor(color)
        pdf.text(w.text, cx, cy + 2)
      }
      cx += w.width
    }
    cy += lineHeight
  }
  return cy
}

function heading(text, y) {
  pdf.setFont('DMSerif', 'normal')
  pdf.setFontSize(27)
  pdf.setTextColor(INK)
  pdf.text(text, M, y)
  return y
}

function dek(text, y, maxWidth) {
  pdf.setFont('DMSerif', 'italic')
  pdf.setFontSize(14.5)
  pdf.setTextColor(40)
  const lines = pdf.splitTextToSize(text, maxWidth)
  pdf.text(lines, M, y)
  return y + lines.length * 20
}

function subhead(text, y) {
  pdf.setFont('Inter', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(INK)
  pdf.text(text, M, y)
  return y + 18
}

function bulletList(items, x, y, maxWidth, { lineHeight = 15, gap = 8 } = {}) {
  let cy = y
  for (const item of items) {
    pdf.setFont('Inter', 'normal'); pdf.setFontSize(10.5); pdf.setTextColor(INK)
    pdf.text('•', x, cy + 2)
    cy = richParagraph(item, x + 13, cy, maxWidth - 13, { lineHeight })
    cy += gap
  }
  return cy
}

function calloutBox(title, body, x, y, w) {
  pdf.setFont('Inter', 'normal'); pdf.setFontSize(10)
  const bodyLines = pdf.splitTextToSize(`${title} ${body}`, w - 32)
  const h = bodyLines.length * 15 + 26
  pdf.setFillColor(...CARD_BG)
  pdf.roundedRect(x, y, w, h, 3, 3, 'F')
  pdf.setFillColor(INK)
  pdf.rect(x, y, 2.5, h, 'F')
  richParagraph(`**${title}** ${body}`, x + 16, y + 20, w - 32, { lineHeight: 15 })
  return y + h
}

function hr(y) {
  pdf.setDrawColor(RULE); pdf.setLineWidth(0.75)
  pdf.line(M, y, W - M, y)
}

// -------------------------------------------------------------- keys ui ----
function keyPill(text, x, y) {
  pdf.setFont('Mono', 'normal'); pdf.setFontSize(9)
  const tw = pdf.getTextWidth(text)
  const w = tw + 12, h = 15
  pdf.setDrawColor(RULE); pdf.setLineWidth(0.75); pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(x, y - 11, w, h, 3, 3, 'FD')
  pdf.setTextColor(50)
  pdf.text(text, x + 6, y)
  return w
}

function keyCombo(comboStr, x, y) {
  const parts = comboStr.split(' · ')
  let cx = x
  for (let i = 0; i < parts.length; i++) {
    cx += keyPill(parts[i], cx, y)
    if (i < parts.length - 1) {
      pdf.setFont('Inter', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(INK_SOFT)
      pdf.text('·', cx + 5, y)
      cx += 14
    }
  }
}

// ==================================================================== =====
// Build the document
// ==================================================================== =====
async function build() {
  grain = await grainTile()
  logoDark = (await logoPng('#0a0a0a', 200)).dataUrl

  // ---------------------------------------------------------------- cover --
  paper()
  const lg = await logoPng('#0a0a0a', 22)
  pdf.addImage(lg.dataUrl, 'PNG', M, M + 6, lg.w, lg.h)

  pdf.setFont('Inter', 'bold'); pdf.setFontSize(9); pdf.setTextColor(INK)
  pdf.text('USER GUIDE', M, H * 0.62, { charSpace: 2 })

  pdf.setFont('DMSerif', 'normal'); pdf.setFontSize(64); pdf.setTextColor(INK)
  pdf.text('Palma', M, H * 0.62 + 56)

  pdf.setFont('DMSerif', 'italic'); pdf.setFontSize(15); pdf.setTextColor(40)
  const sub = pdf.splitTextToSize(
    'A local-first creative suite for gathering, arranging, and focusing visual references — from first inbox drop to a client-ready brief.',
    W - 2 * M - 60
  )
  pdf.text(sub, M, H * 0.62 + 90)

  const ruleY = H * 0.62 + 90 + sub.length * 20 + 14
  pdf.setDrawColor(INK); pdf.setLineWidth(1)
  pdf.line(M, ruleY, M + 64, ruleY)

  pdf.setFont('Inter', 'normal'); pdf.setFontSize(10); pdf.setTextColor(INK_SOFT)
  pdf.text(`Version ${VERSION}  ·  Guide generated ${GENERATED}`, M, ruleY + 26)

  footer('Palma — User Guide')

  // -------------------------------------------------------------- contents --
  pdf.addPage(); paper()
  eyebrow('Contents', 2)
  heading("What's inside", M + 60)
  footer('Contents')

  const toc = [
    ['01', 'What is Palma', '03'],
    ['02', 'Projects & the Dashboard', '04'],
    ['03', 'The Dump Board', '05'],
    ['04', 'Notes, comments & connectors', '06'],
    ['05', 'Keyboard shortcuts', '07'],
    ['06', 'Focus — zones & curation', '08'],
    ['07', 'Scratchpad', '09'],
    ['08', 'Library', '10'],
    ['09', 'Exporting & the Process Brief', '11'],
    ['10', 'The Palma Clipper (coming soon)', '12'],
    ['11', 'Appearance — light & dark', '13'],
    ['12', 'Tips for a clean workflow', '14'],
  ]
  let ty = M + 96
  for (const [num, title, page] of toc) {
    pdf.setFont('Inter', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(INK_SOFT)
    pdf.text(num, M, ty)
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(12.5); pdf.setTextColor(INK)
    pdf.text(title, M + 22, ty)
    pdf.setFont('Inter', 'normal'); pdf.setFontSize(11); pdf.setTextColor(INK_SOFT)
    pdf.text(page, W - M, ty, { align: 'right' })
    pdf.setDrawColor(230); pdf.setLineWidth(0.5)
    pdf.line(M, ty + 10, W - M, ty + 10)
    ty += 33
  }

  const CW = W - 2 * M

  // ------------------------------------------------------------ 01 intro ----
  newPage('01 — Introduction', 'What is Palma')
  let y = heading('What is Palma', M + 60)
  y = dek("Palma is a quiet place to collect what you find, arrange what matters, and hand off what's ready — without the file struggling to look like software.", y + 26, CW)
  y += 14
  y = richParagraph(
    "Most reference tools try to impress you. Palma tries to get out of the way. The whole app reads like paper: a soft near-white canvas, ink-dark text, a faint grain texture under everything. There's exactly one accent colour (near-black), and colour is reserved for the few places it actually carries meaning — group frames, Focus zone tints, comment markers.",
    M, y, CW, { lineHeight: 16 }
  )
  y += 12
  y = richParagraph('Underneath that restraint is a real working structure, built around three connected spaces:', M, y, CW, { lineHeight: 16 })
  y += 10
  y = bulletList([
    '**Dump Board** — the inbox. Drop anything here: images, videos, screenshots, links, sticky notes. Nothing is precious yet.',
    '**Focus** — the curation layer. Pull the references that matter into tinted zones, arrange them, annotate them, and write a Direction statement for the project.',
    '**Scratchpad** — a ruled notebook page per project, for the thinking that doesn\'t belong on the canvas.',
  ], M, y, CW)
  y += 4
  y = richParagraph(
    "Everything lives inside a **project** — a self-contained folder on disk. Projects don't talk to each other except when you explicitly move or copy something between them, so a client's work never bleeds into another's.",
    M, y, CW, { lineHeight: 16 }
  )
  y += 16
  calloutBox('Local-first, by design.', 'Palma writes your work straight to a project folder on your machine as you go — not to a server. Open the folder in Explorer/Finder any time; the assets are real files, not opaque app data.', M, y, CW)

  // ---------------------------------------------------------- 02 projects ----
  newPage('02 — Getting started', 'Projects & the Dashboard')
  y = heading('Projects & the Dashboard', M + 60)
  y += 26
  y = richParagraph("The Dashboard is where every project lives as a card — a snapshot of its Dump Board, a name, and a last-opened date. It's the front door of the app.", M, y, CW, { lineHeight: 16 })
  y += 16

  y = subhead('Creating a project', y)
  y = richParagraph('Click **New project** in the sidebar (or on the Dashboard). Give it a name and, on desktop, a folder — Palma scaffolds an `assets/` folder inside it and writes a `palma.json` session file that holds the project\'s structure. That file is the single source of truth for everything you build.', M, y, CW, { lineHeight: 16 })
  y += 18

  y = subhead('The Inbox project', y)
  y = richParagraph('Palma keeps one special project called **Inbox** as a landing zone. Once the **Palma Clipper** browser extension ships _(coming soon)_, images you save while no project is open will land here automatically; open any project first and the clip goes straight to that project\'s Dump Board instead.', M, y, CW, { lineHeight: 16 })
  y += 18

  y = subhead('Recoloring a project', y)
  y = richParagraph("Right-click a project card's `…` menu to pick a colour swatch. That colour becomes the project's identity chip in the sidebar's Recent list — the dashboard card itself always shows a real snapshot of the board, never a flat colour, so you can recognise a project at a glance.", M, y, CW, { lineHeight: 16 })
  y += 14
  const swatches = ['#17171a', '#a9772e', '#a2512f', '#93304f', '#6a3f8f', '#3d5a78']
  const swW = 58, swH = 58, swGap = 12
  swatches.forEach((hex, i) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
    pdf.setFillColor(r, g, b)
    pdf.roundedRect(M + i * (swW + swGap), y, swW, swH, 5, 5, 'F')
  })
  y += swH + 22

  y = subhead('The Library', y)
  richParagraph('The Library tab (sidebar) is a flat, searchable grid of every asset across every project — useful when you remember an image but not which board it\'s on.', M, y, CW, { lineHeight: 16 })

  // -------------------------------------------------------------- 03 dump ----
  newPage('03 — The Dump Board', 'The Dump Board')
  y = heading('The Dump Board', M + 60)
  y = dek('An infinite, dot-gridded canvas — the creative inbox. Messy on purpose.', y + 26, CW)
  y += 14
  y = richParagraph("Everything starts here. There's no \"wrong\" way to use the Dump Board — drop things in, move them around, group what belongs together, and don't worry about tidiness until you actually need it.", M, y, CW, { lineHeight: 16 })
  y += 16

  y = subhead('Getting things onto the board', y)
  y = bulletList([
    '**Drag & drop** — images or videos from your file manager or a browser window.',
    '**Paste** — a copied screenshot, an image from another app, a URL, or plain text. Palma figures out what you pasted: images become image cards, a direct image link becomes an image reference, anything else becomes a note.',
    '**The toolbar** — Photo/Video buttons open a native file picker.',
    '**The Palma Clipper** _(coming soon)_ — right-click any image on the web and save it straight to the open project (see section 10).',
  ], M, y, CW, { gap: 6 })
  y += 8

  y = subhead('Moving around', y)
  const moves = [
    ['Pan', 'Hold Space and drag, or middle-mouse drag'],
    ['Zoom', 'Scroll, trackpad pinch, or the on-screen zoom control'],
    ['Select', 'Click an item; Shift-click to add to the selection'],
    ['Marquee select', 'Drag on empty canvas to box-select everything inside'],
    ['Reset view', 'Click the zoom percentage, bottom-centre'],
  ]
  for (const [action, how] of moves) {
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(10); pdf.setTextColor(INK)
    pdf.text(action, M, y)
    pdf.setFont('Inter', 'normal'); pdf.setFontSize(10); pdf.setTextColor(70)
    pdf.text(how, M + 130, y)
    y += 16
  }
  y += 10

  y = subhead('Organising', y)
  y = richParagraph('Select two or more items and a floating toolbar appears above the selection: align (left/centre/right, top/middle/bottom), distribute evenly, group, or lock. A **group** gets its own coloured frame and can be renamed, dragged as one unit, or dissolved later. **Tidy** (canvas toolbar) packs everything into neat rows in one click — with a single-step undo if you don\'t like the result.', M, y, CW, { lineHeight: 16 })
  y += 14
  calloutBox('Grid Snap is always on.', 'Every item settles onto a 24px grid as you drop or release it, so boards stay crisp without you fighting alignment by eye.', M, y, CW)

  // --------------------------------------------------------- 04 annotation --
  newPage('04 — Annotation', 'Notes, comments & connectors')
  y = heading('Notes, comments & connectors', M + 60)
  y += 26

  y = subhead('Notes', y)
  y = richParagraph('**Double-click anywhere on empty canvas** to drop a sticky note — type immediately, click away to save. Notes take a soft paper tint from a small colour palette that appears on hover, so you can colour-code by hand (a blocker note, an idea, a client quote). Note text itself stays a fixed dark ink regardless of theme — like a real sticky note, its ink doesn\'t change colour under different light, even in dark mode.', M, y, CW, { lineHeight: 16 })
  y += 18

  y = subhead('Comments', y)
  y = richParagraph('A comment is an annotation **pinned to a specific image** — drag a comment onto a picture and it rides along wherever that image moves. Collapsed, it\'s a small coloured pin; click to expand into a text card, and it re-minimises automatically once you click away (an empty comment just disappears — no clutter).', M, y, CW, { lineHeight: 16 })
  y += 18

  y = subhead('Connectors', y)
  y = richParagraph('Drag from the small dot at the top of any item to another item to draw an arrow between them — useful for showing a before/after, a sequence, or a causal relationship. Double-click a connector to label it; click to select and delete it with `Delete`.', M, y, CW, { lineHeight: 16 })
  y += 18

  y = subhead('Copy & paste — inside Palma and out', y)
  richParagraph('`Ctrl C` copies the selection to Palma\'s own clipboard _and_ mirrors it to your system clipboard — a single image copies as real image bytes (paste it into Photoshop, Discord, anywhere), a mixed selection copies as text. `Ctrl V` is one smart paste: an image on your system clipboard always pastes as an image; otherwise Palma prefers your last in-app copy (so groups, positions and disk references come back intact) and falls back to turning outside text or a link into a note or image.', M, y, CW, { lineHeight: 16 })

  // ------------------------------------------------------- 05 shortcuts -----
  newPage('05 — Reference', 'Keyboard shortcuts')
  y = heading('Keyboard shortcuts', M + 60)
  y += 20
  richParagraph('Press `?` on the Dump Board any time to bring this list up in-app.', M, y, CW, { lineHeight: 16 })
  y += 26

  const shortcuts = [
    ['Select / add to selection', 'Click · Shift-click'],
    ['Marquee select', 'Drag on empty canvas'],
    ['Select all', 'Ctrl A'],
    ['Copy · Paste · Duplicate', 'Ctrl C · Ctrl V · Ctrl D'],
    ['Paste image / text / URL from clipboard', 'Ctrl V'],
    ['Group · Ungroup', 'Ctrl G · Ctrl Shift G'],
    ['Lock · Unlock', 'Ctrl L'],
    ['Send to Focus', 'Ctrl F'],
    ['Connect items', 'Drag the top link dot'],
    ['Delete selection', 'Del · Backspace'],
    ['Nudge (fine with Shift)', 'Arrow keys'],
    ['Undo · Redo', 'Ctrl Z · Ctrl Shift Z'],
    ['Pan', 'Space-drag · middle-drag'],
    ['Zoom', 'Ctrl-scroll · pinch · +/−'],
    ['Add note', 'Double-click empty canvas'],
    ['Deselect', 'Esc'],
    ['This shortcut sheet, in-app', '?'],
  ]
  const keyLikeCols = new Set(['Select all', 'Copy · Paste · Duplicate', 'Group · Ungroup', 'Lock · Unlock', 'Send to Focus', 'Delete selection', 'Undo · Redo', 'Deselect', 'This shortcut sheet, in-app'])
  pdf.setFont('Inter', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(INK_SOFT)
  pdf.text('ACTION', M, y, { charSpace: 1 })
  pdf.text('SHORTCUT', M + 260, y, { charSpace: 1 })
  y += 8
  hr(y); y += 18
  for (const [action, how] of shortcuts) {
    pdf.setFont('Inter', 'normal'); pdf.setFontSize(10); pdf.setTextColor(INK)
    pdf.text(action, M, y)
    if (keyLikeCols.has(action)) {
      keyCombo(how, M + 260, y)
    } else {
      pdf.setTextColor(70)
      pdf.text(how, M + 260, y)
    }
    y += 20
    pdf.setDrawColor(238); pdf.setLineWidth(0.5)
    pdf.line(M, y - 8, W - M, y - 8)
  }
  y += 10
  calloutBox('On macOS,', 'use **Cmd** wherever this guide shows `Ctrl`.', M, y, CW)

  // ------------------------------------------------------------- 06 focus ---
  newPage('06 — Curation', 'Focus — zones & curation')
  y = heading('Focus — zones & curation', M + 60)
  y = dek("Where the Dump Board is deliberately messy, Focus is where a project's actual point of view gets built.", y + 26, CW)
  y += 14

  y = subhead('Sending references to Focus', y)
  y = richParagraph('On the Dump Board, right-click any item (or select several) and choose **Send to Focus**, or press `Ctrl F`. It\'s promoted into Focus\'s **Queue** — a rail of candidates on the right of the Focus board — without leaving the original. Items already sent show a small dot in their corner.', M, y, CW, { lineHeight: 16 })
  y += 18

  y = subhead('Zones', y)
  y = richParagraph('A **zone** is a tinted container you drag references into from the Queue. Rename it, recolour it, resize it, and cycle its layout mode — **grid**, **horizontal**, or **vertical** — via the icon in its header. Zones auto-pack their members into a tidy grid, and images are never cropped to fit — they show at their real proportions, letterboxed if needed, so no detail gets hidden.', M, y, CW, { lineHeight: 16 })
  y += 18

  y = subhead('Notes & pinned comments', y)
  y = richParagraph('The **Add Note** button in the Focus toolbar drops a freestanding note anywhere on the canvas — the same drag/resize/edit behaviour as a Dump Board note. Each zone\'s header also has a small comment icon: click it to pin a comment directly to that zone. A pinned comment automatically follows the zone wherever it\'s moved or resized — and travels into the Process Brief too (see section 09), listed right below that zone\'s page.', M, y, CW, { lineHeight: 16 })
  y += 18

  y = subhead('The Direction statement', y)
  y = richParagraph("The bar above the canvas holds a single line describing what the project is _for_. It's optional, but it becomes the opening line of the Process Brief cover page — the one place in Palma that reads like a sentence instead of a board.", M, y, CW, { lineHeight: 16 })
  y += 14
  calloutBox('The Queue keeps count.', 'A checkmark shows which references are already placed in a zone; anything left un-checked is still waiting to be used.', M, y, CW)

  // -------------------------------------------------------- 07 scratchpad --
  newPage('07 — Writing', 'Scratchpad')
  y = heading('Scratchpad', M + 60)
  y += 26
  y = richParagraph("Every project gets one Scratchpad — a single ruled page for the thinking that doesn't belong pinned to a board: brief notes, a client quote, a stray idea, a to-do list.", M, y, CW, { lineHeight: 16 })
  y += 12
  y = richParagraph("It's a real lightweight rich-text editor — bold, italic, strikethrough, inline code, quotes, and lists — formatted with the toolbar at the top, not typed markdown. Content saves automatically as you type.", M, y, CW, { lineHeight: 16 })
  y += 18

  y = subhead('The paper quirk', y)
  y = richParagraph('The page carries faint blue ruled lines and a pink margin rule, like a real notebook — list numbers and bullets sit in that margin gutter rather than beside the text, exactly like handwriting in a lined notebook. It\'s a small detail, but it\'s the clearest place the "paper, not software" idea shows up.', M, y, CW, { lineHeight: 16 })
  y += 16
  calloutBox('Scratchpad content travels.', 'Anything written here is pulled automatically into the Process Brief\'s Notes section on export — see section 09.', M, y, CW)

  // ------------------------------------------------------------ 08 library --
  newPage('08 — Reference', 'Library')
  y = heading('Library', M + 60)
  y += 26
  y = richParagraph('The Library is a flat grid of every image and video across every project in Palma — a fast way to find something you remember but can\'t place. Click a thumbnail to open it full-size; a broken reference shows as a clearly labelled placeholder rather than a silent gap, so you always know when a source file has moved or been deleted on disk.', M, y, CW, { lineHeight: 16 })
  y += 12
  richParagraph('Because Palma persists images by their real disk path (or, for pasted/web content, a stable embedded copy), an asset should keep showing up here reliably across restarts — even if you later reorganise the project\'s board.', M, y, CW, { lineHeight: 16 })

  // --------------------------------------------------------- 09 exporting --
  newPage('09 — Sharing your work', 'Exporting & the Process Brief')
  y = heading('Exporting & the Process Brief', M + 60)
  y += 26
  y = richParagraph('The **Export** button (top-right, inside a project) offers three things:', M, y, CW, { lineHeight: 16 })
  y += 10
  y = bulletList([
    '**Dump Board** — a full canvas snapshot as PNG or PDF, at 1× or 2× resolution.',
    '**Focus Board** — the zones and their contents, same format choices.',
    '**Process Brief** — a complete, multi-page **landscape** PDF document: a cover with your project name and Direction statement, the Dump Board, one page per Focus zone — its reference grid followed by any comments pinned to that zone (with a "+N more" fallback if there isn\'t room for all of them; a zone with only comments and no images yet still gets a page) — a **Notes** page pulled straight from the Scratchpad, and a closing page. Every page shares the same paper-textured background and a consistent footer, so it reads as one designed document rather than a stack of screenshots.',
  ], M, y, CW, { gap: 8 })
  y += 8
  calloutBox('Light or dark.', 'The Process Brief can be exported in either the light paper theme or a soft dark theme — pick whichever suits how it\'ll be viewed or printed.', M, y, CW)
  y += 90
  richParagraph('This is the artifact built for sharing outside Palma — with a client, a teammate, or for your own archive — everything the project stands for, collected into one file.', M, y, CW, { lineHeight: 16 })

  // ------------------------------------------------------------ 10 clipper --
  newPage('10 — Collecting from the web', 'The Palma Clipper')
  y = heading('The Palma Clipper', M + 60)
  y += 26
  y = calloutBox('Coming soon.', 'The Palma Clipper is on the way and not available yet. This section previews how it will work so you know what to expect — the right-click "Save image to Palma" option will arrive in a future update.', M, y, CW)
  y += 18
  y = richParagraph('The Palma Clipper will be a small browser extension (Chrome, Edge, Brave, Arc, and Firefox) that adds a right-click **"Save image to Palma"** option on any image on the web.', M, y, CW, { lineHeight: 16 })
  y += 12
  const steps = [
    'Make sure Palma is running — the extension talks to a small local server it hosts on your machine.',
    'Right-click any image on a page and choose **Save image to Palma**.',
    "It downloads straight into the open project's Dump Board — or the Inbox project if nothing's open.",
  ]
  steps.forEach((s, i) => {
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(INK)
    pdf.text(`${i + 1}.`, M, y + 2)
    y = richParagraph(s, M + 18, y, CW - 18, { lineHeight: 16 })
    y += 8
  })
  y += 8
  richParagraph("The extension only ever talks to Palma on your own computer — it never sends anything to a remote server, and it's rejected by the local server if the request doesn't come from the extension itself.", M, y, CW, { lineHeight: 16 })

  // --------------------------------------------------------- 11 appearance --
  newPage('11 — Appearance', 'Light & dark')
  y = heading('Light & dark', M + 60)
  y += 26
  y = richParagraph("Palma defaults to a light paper theme. A **sun/moon switch** at the bottom of the sidebar, just above **New project**, switches the whole app — sidebar, tabs, canvases, everything — into a soft dark theme. The icon always shows what you'll switch _to_, not the current state: a moon while in light mode (click for dark), a sun while in dark mode (click for light) — two distinct icons, not one mark changing weight.", M, y, CW, { lineHeight: 16 })
  y += 12
  y = richParagraph("It's a deliberate, sticky choice: switching it doesn't reset when you navigate between projects or boards, and it's remembered the next time you open Palma.", M, y, CW, { lineHeight: 16 })
  y += 12
  richParagraph('Dark mode keeps the same paper grain texture and the same restrained, single-accent palette — it\'s a change of lighting, not a different app.', M, y, CW, { lineHeight: 16 })

  // -------------------------------------------------------------- 12 tips --
  newPage('12 — Workflow', 'Tips for a clean workflow')
  y = heading('Tips for a clean workflow', M + 60)
  y += 30
  const tips = [
    ['Let the Dump Board stay messy', "Resist tidying as you go — the Dump Board's whole job is to hold everything without judgement. Curation happens in Focus, deliberately, once you actually know what the project needs."],
    ["Use groups for anything you'll move together", "A moodboard cluster, a before/after pair, a set of colour swatches — group them once so you're never re-selecting the same five items by hand."],
    ['Write the Direction early', "Even a rough one-line Direction statement in Focus gives every zone you build afterward a reason to exist — and it's the first thing a reader sees in the Process Brief."],
    ['Pin comments instead of relying on memory', "A note pinned to the exact image it's about survives far longer than a mental note — and it travels with the image if you move it."],
    ['Export a Process Brief before a review', "It's the fastest way to hand someone the whole story of a project — the raw material, the curated direction, and your own notes — in one file they can open anywhere."],
  ]
  for (const [title, body] of tips) {
    const bodyLines = pdf.splitTextToSize(body, CW - 32)
    const boxH = bodyLines.length * 15 + 34
    pdf.setDrawColor(224); pdf.setLineWidth(0.75); pdf.setFillColor(255, 255, 255)
    pdf.roundedRect(M, y, CW, boxH, 4, 4, 'FD')
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(10); pdf.setTextColor(INK)
    pdf.text(title.toUpperCase(), M + 16, y + 20, { charSpace: 0.6 })
    richParagraph(body, M + 16, y + 38, CW - 32, { lineHeight: 15 })
    y += boxH + 14
  }

  // -------------------------------------------------------------- closing --
  pdf.addPage(); paper()
  const closingLogo = await logoPng('#0a0a0a', 60)
  const closingText = 'POWERED BY PALMA'
  const closingSpace = 2.2
  pdf.setFont('Inter', 'bold'); pdf.setFontSize(10); pdf.setTextColor(INK_SOFT)
  const closingTextW = pdf.getTextWidth(closingText) + closingSpace * (closingText.length - 1)
  const blockTop = H / 2 - 60
  pdf.addImage(closingLogo.dataUrl, 'PNG', (W - closingLogo.w) / 2, blockTop, closingLogo.w, closingLogo.h)
  pdf.text(closingText, (W - closingTextW) / 2, blockTop + closingLogo.h + 28, { charSpace: closingSpace })

  fs.writeFileSync(OUT_PATH, Buffer.from(pdf.output('arraybuffer')))
  console.log('Wrote', OUT_PATH)
}

build().catch((err) => { console.error(err); process.exit(1) })
