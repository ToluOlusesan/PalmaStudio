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

// A board-level colour impression, drawn automatically from all placed Focus
// images. Each image has equal weight, regardless of its pixel dimensions; the
// chosen colours stay distinct in perceptual (OKLab) space so averaging unlike
// hues cannot collapse the whole board into one muddy colour.
export function extractVibePalette(images, count = 5) {
  const candidates = []
  for (const image of images) {
    const swatches = extractSwatches(image, 14, 24)
    const total = swatches.reduce((sum, swatch) => sum + swatch.n, 0)
    if (!total) continue
    for (const swatch of swatches) {
      candidates.push({ ...swatch, weight: swatch.n / total, lab: toOklab(swatch) })
    }
  }
  if (!candidates.length) return []

  const distance = (a, b) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const centers = [candidates.reduce((best, c) => c.weight > best.weight ? c : best).lab]
  while (centers.length < Math.min(count, candidates.length)) {
    const next = candidates.reduce((best, c) => {
      const nearest = Math.min(...centers.map((center) => distance(c.lab, center)))
      const score = c.weight * nearest
      return score > best.score ? { score, lab: c.lab } : best
    }, { score: 0, lab: null })
    if (!next.lab || next.score < 0.00002) break
    centers.push(next.lab)
  }

  // A few weighted passes settle the palette around the references. We keep
  // the final displayed RGB from real source swatches near each cluster's
  // centre, avoiding invented desaturated blends between distant colours.
  for (let pass = 0; pass < 5; pass++) {
    const groups = centers.map(() => ({ l: 0, a: 0, b: 0, weight: 0 }))
    for (const c of candidates) {
      const index = centers.reduce((best, center, i) =>
        distance(c.lab, center) < distance(c.lab, centers[best]) ? i : best, 0)
      const group = groups[index]
      group.l += c.lab[0] * c.weight
      group.a += c.lab[1] * c.weight
      group.b += c.lab[2] * c.weight
      group.weight += c.weight
    }
    groups.forEach((group, i) => {
      if (group.weight) centers[i] = [group.l / group.weight, group.a / group.weight, group.b / group.weight]
    })
  }

  const groups = centers.map((lab) => ({ lab, weight: 0, closest: null, distance: Infinity }))
  for (const c of candidates) {
    const index = centers.reduce((best, center, i) =>
      distance(c.lab, center) < distance(c.lab, centers[best]) ? i : best, 0)
    const group = groups[index]
    group.weight += c.weight
    const d = distance(c.lab, group.lab)
    if (d < group.distance) {
      group.closest = c.hex
      group.distance = d
    }
  }
  return groups.filter((group) => group.closest)
    .sort((a, b) => b.weight - a.weight)
    .map((group) => group.closest)
}

function toOklab({ r, g, b }) {
  const linear = (channel) => {
    const x = channel / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  const R = linear(r), G = linear(g), B = linear(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
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
