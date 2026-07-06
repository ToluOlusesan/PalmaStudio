import { useRef, useCallback } from 'react'

// Custom media scrubber — replaces the browser's default <input type=range>,
// which renders inconsistently and reads as foreign on the warm-dark surface.
// Played portion + handle use ink (not the cream accent, which stays reserved
// for the view's one primary action). Pointer-captured drag = smooth scrub.
export default function Scrubber({ value = 0, max = 0, onChange, className = '' }) {
  const ref = useRef(null)
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const pct = `${frac * 100}%`

  const setFromX = useCallback(
    (clientX) => {
      const el = ref.current
      if (!el || max <= 0) return
      const r = el.getBoundingClientRect()
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
      onChange?.(f * max)
    },
    [max, onChange]
  )

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setFromX(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) setFromX(e.clientX)
      }}
      className={`group relative h-4 flex items-center cursor-pointer select-none touch-none ${className}`}
    >
      {/* unfilled track */}
      <div
        className="absolute left-0 right-0 h-[3px] rounded-full"
        style={{ background: 'var(--border-2)' }}
      />
      {/* played portion */}
      <div
        className="absolute left-0 h-[3px] rounded-full"
        style={{ width: pct, background: 'var(--ink)' }}
      />
      {/* handle */}
      <div
        className="absolute -translate-x-1/2 w-[11px] h-[11px] rounded-full transition-transform duration-100 group-hover:scale-110"
        style={{
          left: pct,
          background: 'var(--ink)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }}
      />
    </div>
  )
}
