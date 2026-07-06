// One-off generator: takes the uploaded mark (public/favicon.svg) and emits the
// full Oasis logoset from a single source of truth so the path data stays exact.
//   → src/components/Logo.jsx   (fill: currentColor — parent sets the colour)
//   → src/assets/logo.svg       (cream fill, dark/primary variant)
//   → public/favicon.svg        (cream fill so it reads on dark browser tabs)
import { readFileSync, writeFileSync } from 'node:fs'

const ACCENT = '#E8E2D8'
const src = readFileSync('public/favicon.svg', 'utf8')

const viewBox = (src.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 1072.85 860.96'
const ds = [...src.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1])
if (!ds.length) throw new Error('no <path d> found in source svg')

const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number)
const ratio = vbW / vbH

const paths = (fill) =>
  ds.map((d) => `<path fill="${fill}" d="${d}" />`).join('\n    ')

// --- src/assets/logo.svg (cream) ---
writeFileSync(
  'src/assets/logo.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
    ${paths(ACCENT)}
</svg>\n`
)

// --- public/favicon.svg (cream, so it shows on dark tabs) ---
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
    ${paths(ACCENT)}
</svg>\n`
)

// --- src/components/Logo.jsx (currentColor) ---
const h = 20
const w = Math.round(h * ratio)
const jsx = `// The Oasis mark — line-drawn island (palms flanking a peak over water).
// Fill inherits via currentColor so the dark variant (#E8E2D8) is set by the
// parent. Never recoloured, skewed, or shadowed (brand rule). Default size is
// the 26x20 sidebar lockup; preserveAspectRatio keeps the art undistorted.
export default function Logo({ width = ${w}, height = ${h}, className = '', style }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="${viewBox}"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
    ${ds.map((d) => `  <path d="${d}" />`).join('\n    ')}
    </svg>
  )
}
`
writeFileSync('src/components/Logo.jsx', jsx)

console.log(`logoset regenerated · viewBox ${viewBox} · ${ds.length} paths · sidebar ${w}x${h}`)
