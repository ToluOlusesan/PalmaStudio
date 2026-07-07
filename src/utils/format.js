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

// Deterministic warm-dark solid seeded from a string — the fallback identity for
// a project that has no extracted palette yet. Flat fill (no gradient).
export function seededColor(seed = '') {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff
  const base = 24 + (h % 40) // warm hue band, browns/ambers/greens
  return `hsl(${base}, 22%, 20%)`
}

// Hand-picked thumbnail tints a user can assign to a project card, overriding the
// auto palette/seeded fallback. Flat solid fills in the same warm-dark key as
// seededColor so cards stay cohesive. `null` key = auto (no override).
export const THUMB_TINTS = [
  { key: 'graphite', label: 'Graphite', css: '#262626' },
  { key: 'amber', label: 'Amber', css: 'hsl(32,55%,40%)' },
  { key: 'terracotta', label: 'Terracotta', css: 'hsl(15,52%,42%)' },
  { key: 'rose', label: 'Rose', css: 'hsl(343,38%,42%)' },
  { key: 'lavender', label: 'Lavender', css: 'hsl(267,33%,46%)' },
  { key: 'slate', label: 'Slate', css: 'hsl(221,32%,40%)' },
  { key: 'sage', label: 'Sage', css: 'hsl(152,28%,34%)' },
  { key: 'moss', label: 'Moss', css: 'hsl(94,29%,32%)' },
]

// Resolve a tint key → CSS background, or null when unset/unknown (fall back to
// the auto identity).
export function thumbTint(key) {
  return THUMB_TINTS.find((t) => t.key === key)?.css || null
}
