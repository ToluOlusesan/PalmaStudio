import { seededColor } from '../utils/format.js'

// A project's visual identity at a glance: a captured snapshot of its Dump Board
// (data URL) wins, then the first extracted palette colour as a flat fill, then a
// deterministic seeded colour. Solid fills only — no gradients — so an empty
// project reads as "its own" surface, not a placeholder. (The per-project tint
// colour lives on the sidebar chip, not here — this always shows the real board
// snapshot when there is one.)
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

  // Flat fill: the first extracted palette colour when we have one, else a
  // deterministic seeded colour.
  const background = palette?.[0] || seededColor(id || name)

  return (
    <div
      className={`w-full h-full ${className}`}
      style={{ background, ...style }}
      aria-hidden="true"
    />
  )
}
