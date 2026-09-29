import { seededColor, thumbTint } from '../utils/format.js'

// Transparent board images sit on theme paper. Empty projects get a quiet cover
// with one small colour marker, rather than a large, arbitrary colour block.
export default function Thumb({ project, className = '', style, compact = false }) {
  const { thumbnail, palette, id, name, thumbColor } = project
  const marker = thumbTint(thumbColor) || palette?.[0] || seededColor(id || name)

  if (thumbnail) {
    return (
      <div className={`w-full h-full overflow-hidden ${className}`} style={{ background: 'var(--surface-canvas)', ...style }}>
        <img src={thumbnail} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div
      className={`w-full h-full grid place-items-center relative text-ink-3 ${className}`}
      style={{ background: 'var(--surface-canvas)', ...style }}
      aria-hidden="true"
    >
      <span className={`${compact ? 'text-[11px]' : 'text-[38px]'} font-light leading-none select-none opacity-50`}>
        {(name || 'U').trim().charAt(0).toUpperCase()}
      </span>
      <span
        className={`absolute ${compact ? 'bottom-[3px] left-[3px] right-[3px] h-[2px]' : 'bottom-4 left-4 w-7 h-[3px]'} rounded-full`}
        style={{ background: marker }}
      />
    </div>
  )
}
