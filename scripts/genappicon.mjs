// Builds a 1024² app-icon source from the Oasis/Palma mark: a monochrome rounded
// tile (neutral near-black) with the near-white island centred. Output feeds
// `tauri icon`, which derives the full platform set (.ico, .icns, png sizes).
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const mark = readFileSync('public/favicon.svg', 'utf8')
const viewBox = (mark.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 1072.85 860.96'
const ds = [...mark.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1])
const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number)

const SIZE = 1024
const target = SIZE * 0.66 // mark width on the tile
const scale = target / vbW
const tx = (SIZE - vbW * scale) / 2
const ty = (SIZE - vbH * scale) / 2

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1f1f1f"/>
      <stop offset="1" stop-color="#0a0a0a"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="224" fill="url(#bg)"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})" fill="#f5f5f5">
    ${ds.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
</svg>`

const out = 'src-tauri/icons/source.png'
writeFileSync('src-tauri/icons/source.svg', svg)
await sharp(Buffer.from(svg)).resize(SIZE, SIZE).png().toFile(out)
console.log(`wrote ${out} (${SIZE}x${SIZE})`)
