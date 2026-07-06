// Terse, editorial formatting — matches the brand voice ("2d ago", not
// "2 days ago at 14:22").

export function relativeDate(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const m = 60_000
  const h = 60 * m
  const d = 24 * h
  if (diff < m) return 'just now'
  if (diff < h) return `${Math.floor(diff / m)}m ago`
  if (diff < d) return `${Math.floor(diff / h)}h ago`
  if (diff < 7 * d) return `${Math.floor(diff / d)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function shortDate(iso) {
  if (!iso) return ''
  return new Date(iso)
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toUpperCase()
}

// Deterministic warm-dark gradient seeded from a string — the fallback identity
// for a project that has no extracted palette yet.
export function seededGradient(seed = '') {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff
  const base = 24 + (h % 40) // warm hue band, browns/ambers/greens
  const a = `hsl(${base}, 22%, 16%)`
  const b = `hsl(${(base + 28) % 360}, 26%, 26%)`
  const c = `hsl(${(base + 50) % 360}, 18%, 11%)`
  return `linear-gradient(150deg, ${b} 0%, ${a} 48%, ${c} 100%)`
}

// Hand-picked thumbnail tints a user can assign to a project card, overriding the
// auto palette/seeded fallback. Rich two-stop gradients in the same warm-dark key
// as seededGradient so cards stay cohesive. `null` key = auto (no override).
export const THUMB_TINTS = [
  { key: 'graphite', label: 'Graphite', css: 'linear-gradient(150deg, #303030 0%, #101010 100%)' },
  { key: 'amber', label: 'Amber', css: 'linear-gradient(150deg, hsl(35,58%,44%) 0%, hsl(28,54%,22%) 100%)' },
  { key: 'terracotta', label: 'Terracotta', css: 'linear-gradient(150deg, hsl(16,54%,46%) 0%, hsl(14,50%,22%) 100%)' },
  { key: 'rose', label: 'Rose', css: 'linear-gradient(150deg, hsl(345,40%,48%) 0%, hsl(340,36%,24%) 100%)' },
  { key: 'lavender', label: 'Lavender', css: 'linear-gradient(150deg, hsl(268,34%,52%) 0%, hsl(266,32%,26%) 100%)' },
  { key: 'slate', label: 'Slate', css: 'linear-gradient(150deg, hsl(220,30%,46%) 0%, hsl(222,34%,22%) 100%)' },
  { key: 'sage', label: 'Sage', css: 'linear-gradient(150deg, hsl(150,26%,40%) 0%, hsl(155,30%,18%) 100%)' },
  { key: 'moss', label: 'Moss', css: 'linear-gradient(150deg, hsl(92,28%,40%) 0%, hsl(96,30%,17%) 100%)' },
]

// Resolve a tint key → CSS background, or null when unset/unknown (fall back to
// the auto identity).
export function thumbTint(key) {
  return THUMB_TINTS.find((t) => t.key === key)?.css || null
}
