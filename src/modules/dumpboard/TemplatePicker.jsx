import { useEffect, useRef } from 'react'
import { BOARD_TEMPLATES } from '../../utils/boardTemplates.js'
import { GROUP_COLORS } from '../../store/canvasStore.js'

// Popover above the tool dock listing board templates. Each row carries a tiny
// schematic of its frames so the structure reads before it lands.
export default function TemplatePicker({ onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const down = (e) => {
      // The dock's Templates button toggles us itself; closing here too would
      // make its click reopen the picker.
      if (!ref.current?.contains(e.target) && !e.target.closest?.('[aria-label="Templates"]')) onClose()
    }
    const key = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="pop-in glass-bar absolute bottom-[92px] left-1/2 -translate-x-1/2 z-40 w-[320px] rounded-[14px] p-1.5"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="px-2.5 pt-1.5 pb-2 text-[11px] text-ink-3">Start from a template</div>
      {BOARD_TEMPLATES.map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(t)}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-[10px] text-left transition-colors hover:bg-[var(--sand-hover)]"
        >
          <Schematic tpl={t} />
          <span className="min-w-0">
            <span className="block text-[13px] text-ink font-medium leading-tight">{t.name}</span>
            <span className="block text-[11px] text-ink-3 leading-tight mt-0.5 truncate">{t.blurb}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function Schematic({ tpl }) {
  const rows = Math.ceil(tpl.frames.length / tpl.cols)
  return (
    <span
      className="shrink-0 grid gap-[3px] w-[44px] h-[32px] p-[3px] rounded-md"
      style={{ gridTemplateColumns: `repeat(${tpl.cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, background: 'var(--surface-2)' }}
    >
      {tpl.frames.map((_, i) => (
        <span key={i} className="rounded-[2px]" style={{ background: `color-mix(in srgb, ${GROUP_COLORS[i % GROUP_COLORS.length]} 55%, transparent)` }} />
      ))}
    </span>
  )
}
