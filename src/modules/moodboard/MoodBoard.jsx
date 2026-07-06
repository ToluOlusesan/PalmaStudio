import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { CaretLeft } from '@phosphor-icons/react'
import { useFocusStore } from '../../store/focusStore.js'
import FocusBoard from './FocusBoard.jsx'
import QueuePanel from './QueuePanel.jsx'

// Focus — a curated board built from references promoted off the Dump Board.
// Layout: a pinned Direction bar above, then the zones canvas with a collapsible
// Queue rail on the right. Nothing is uploaded here; the canvas is fed only by
// the Queue (see FocusBoard — no upload affordances). Same paper theme as the
// Dump Board — no dimming or tint override.
export default function MoodBoard() {
  const [queueOpen, setQueueOpen] = useState(true)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <DirectionBar />
      <div className="flex-1 min-h-0 flex">
        <FocusBoard />
        <AnimatePresence initial={false}>
          {queueOpen && <QueuePanel key="queue" onClose={() => setQueueOpen(false)} />}
        </AnimatePresence>
        {!queueOpen && (
          <button
            onClick={() => setQueueOpen(true)}
            title="Open queue"
            aria-label="Open queue"
            className="shrink-0 w-9 h-full flex flex-col items-center gap-2.5 pt-3 bg-surface border-l-[0.5px] text-ink-2 hover:text-ink"
            style={{ borderColor: 'var(--border)' }}
          >
            <CaretLeft size={14} />
            <span className="text-[10px] uppercase tracking-[0.12em]" style={{ writingMode: 'vertical-rl' }}>
              Queue
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

// Direction statement — a pinned bar above the canvas (chrome, not a canvas
// item). Optional; feeds the Process Brief header when set.
function DirectionBar() {
  const direction = useFocusStore((s) => s.direction)
  const setDirection = useFocusStore((s) => s.setDirection)
  const persist = useFocusStore((s) => s.persist)
  return (
    <div
      className="shrink-0 min-h-[48px] flex items-center gap-4 px-5 py-2 border-b-[0.5px]"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-modal)' }}
    >
      <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3 shrink-0">Direction</span>
      <input
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        onBlur={persist}
        placeholder="What is this project?"
        spellCheck="false"
        className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-3 placeholder:font-light outline-none"
      />
    </div>
  )
}
