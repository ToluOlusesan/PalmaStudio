// Manual dominant-colour sampling. No color-thief dependency — we down-sample
// onto a tiny canvas, bucket colours, and return the most populous. Swatches
// carry their pixel population (`n`) so callers can aggregate across many images
// by weight rather than by exact hex (which rarely matches between images).

// `step` controls how aggressively near-shades merge before averaging: smaller
// step = finer bins = more distinct colours kept; larger step = coarser bins =
// fewer, more averaged colours. (Default 16 ≈ the original 4-bit quantisation.)
export function extractSwatches(imgEl, count = 6, step = 16) {
  try {
    const w = 24
    const h = 24
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    ctx.drawImage(imgEl, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)

    const buckets = new Map()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue
      // quantise each channel by `step` so near-shades fall in the same bin
      const key = `${Math.floor(data[i] / step)}-${Math.floor(data[i + 1] / step)}-${Math.floor(data[i + 2] / step)}`
      const e = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 }
      e.r += data[i]
      e.g += data[i + 1]
      e.b += data[i + 2]
      e.n += 1
      buckets.set(key, e)
    }

    return [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, count)
      .map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n, hex: rgbToHex(e.r / e.n, e.g / e.n, e.b / e.n) }))
  } catch {
    return []
  }
}

// Convenience: just the hex strings (used where a single image's palette is enough).
export function extractPalette(imgEl, count = 4) {
  return extractSwatches(imgEl, count).map((s) => s.hex)
}

export function rgbToHex(r, g, b) {
  const h = (n) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// Merge palettes, keeping existing colours first (so Color-Pick picks survive a
// later snapshot) and appending new ones, de-duping by coarse bin to avoid
// near-duplicate accumulation. Capped so it can't grow unbounded.
export function mergePalette(existing = [], incoming = [], max = 12) {
  const binOf = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    return `${Math.round(((n >> 16) & 255) / 28)}-${Math.round(((n >> 8) & 255) / 28)}-${Math.round((n & 255) / 28)}`
  }
  const seen = new Set()
  const out = []
  for (const hex of [...existing, ...incoming]) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) continue
    const b = binOf(hex)
    if (seen.has(b)) continue
    seen.add(b)
    out.push(hex)
    if (out.length >= max) break
  }
  return out
}

// A pleasant warm-dark default when nothing has been dropped yet.
export const FALLBACK_PALETTE = ['#2a2620', '#4a3f33', '#7a6a55', '#b9a98c']
