import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

// Small right-click menu, positioned at the cursor (clamped to the viewport).
// Closes on any outside click, scroll, or Escape. `items` is a list of
// { label, onClick, danger? } or { separator: true }.
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onClose, { passive: true })
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onClose)
    }
  }, [onClose])

  // keep on-screen
  const left = Math.min(x, window.innerWidth - 180)
  const top = Math.min(y, window.innerHeight - (items.length * 30 + 12))

  return (
    <motion.div
      ref={ref}
      className="fixed z-[70] min-w-[156px] rounded-md py-1 bg-surface-3 border-[0.5px]"
      style={{ left, top, transformOrigin: 'top left', borderColor: 'var(--border-2)', boxShadow: 'var(--shadow-lifted)' }}
      initial={{ opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className="my-1 h-px bg-[var(--border)]" />
        // Icons inherit the row's text colour via currentColor — so Delete's
        // icon picks up the destructive tone for free. Regular weight, 16px.
        const Icon = it.icon
        return (
          <button
            key={i}
            onClick={() => {
              it.onClick()
              onClose()
            }}
            className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between gap-4 transition-colors hover:bg-[var(--sand-hover)] ${
              it.danger ? 'text-[var(--warning)]' : 'text-ink-2 hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-2">
              {Icon && <Icon size={16} weight="regular" />}
              {it.label}
            </span>
            {it.hint && <span className="text-[10px] text-ink-3">{it.hint}</span>}
          </button>
        )
      })}
    </motion.div>
  )
}
