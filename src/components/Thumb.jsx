import { seededGradient } from '../utils/format.js'

// A project's visual identity at a glance: a captured snapshot of its Dump Board
// (data URL) wins, then a gradient built from the extracted palette, then a
// deterministic seeded gradient. Palette colours stack as soft bands so even an
// empty project reads as "its own" surface, not a placeholder. (The per-project
// tint colour lives on the sidebar chip, not here — this always shows the real
// board snapshot when there is one.)
export default function Thumb({ project, className = '', style }) {
  const { thumbnail, palette, id, name } = project

  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt=""
        className={`w-full h-full object-cover ${className}`}
        style={style}
      />
    )
  }

  let background
  if (palette && palette.length >= 2) {
    const stops = palette
      .slice(0, 4)
      .map((c, i, arr) => `${c} ${(i / (arr.length - 1)) * 100}%`)
      .join(', ')
    background = `linear-gradient(150deg, ${stops})`
  } else {
    background = seededGradient(id || name)
  }

  return (
    <div
      className={`w-full h-full ${className}`}
      style={{ background, ...style }}
      aria-hidden="true"
    />
  )
}
