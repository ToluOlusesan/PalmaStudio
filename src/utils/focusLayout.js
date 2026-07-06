// Shared Focus zone-grid geometry. Used by the Focus canvas (FocusBoard) and the
// export renderer so a zone's members lay out identically on screen and in PDFs.
export const HEADER_H = 30
export const PAD = 12
export const GAP = 8
export const CELL_MIN = 104

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Lay `count` members out to fit the zone, honouring the zone's layout mode:
//   grid       → up to 2 columns, left-to-right (row-major)
//   horizontal → up to 3 columns, left-to-right
//   vertical   → up to 2 columns, top-to-bottom (column-major)
// Column count is also capped by the zone's width; cell height is capped so
// members never overshoot a short zone.
export const ZONE_LAYOUTS = ['grid', 'horizontal', 'vertical']
export function zoneLayout(zone, count) {
  const mode = zone.layout || 'grid'
  const modeCols = mode === 'horizontal' ? 3 : 2
  const colMajor = mode === 'vertical'
  const innerW = Math.max(CELL_MIN, zone.width - PAD * 2)
  const fitCols = Math.max(1, Math.floor((innerW + GAP) / (CELL_MIN + GAP)))
  const cols = Math.max(1, Math.min(modeCols, fitCols, Math.max(count, 1)))
  const cellW = (innerW - (cols - 1) * GAP) / cols
  const rows = Math.max(1, Math.ceil(count / cols))
  const innerH = Math.max(48, zone.height - HEADER_H - PAD)
  const cellH = Math.max(40, Math.min(cellW, (innerH - (rows - 1) * GAP) / rows))
  return {
    cols,
    rows,
    cellW,
    cellH,
    // Zone-relative cell rect.
    cellAt: (i) => {
      const c = colMajor ? Math.floor(i / rows) : i % cols
      const r = colMajor ? i % rows : Math.floor(i / cols)
      return { x: PAD + c * (cellW + GAP), y: HEADER_H + r * (cellH + GAP), w: cellW, h: cellH }
    },
    // World-space hit test (cursor → member slot index, respecting fill order).
    indexAt: (wx, wy) => {
      const c = clamp(Math.floor((wx - zone.x - PAD) / (cellW + GAP)), 0, cols - 1)
      const r = Math.max(0, Math.floor((wy - zone.y - HEADER_H) / (cellH + GAP)))
      const idx = colMajor ? c * rows + r : r * cols + c
      return Math.max(0, Math.min(count, idx))
    },
  }
}
