import { motion } from 'framer-motion'
import { CaretRight, Check, X, ImageBroken } from '@phosphor-icons/react'
import { useFocusStore } from '../../store/focusStore.js'

// The Queue — a shelf of references promoted from the Dump Board. Drag a card
// onto a zone to place it. Placed cards stay here (dimmed, checked) for re-use.
// Header carries a faint amber wash to read as a holding area, not neutral chrome.
export default function QueuePanel({ onClose }) {
  const queue = useFocusStore((s) => s.queue)
  const placed = useFocusStore((s) => s.placed)
  const removeFromQueue = useFocusStore((s) => s.removeFromQueue)

  const isPlaced = (id) => placed.some((p) => p.queueItemId === id)

  return (
    <motion.aside
      className="shrink-0 w-[240px] h-full flex flex-col bg-surface border-l-[0.5px] overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
      initial={{ x: 240, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 240, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0, 0, 1] }}
    >
      <div
        className="h-10 shrink-0 flex items-center justify-between px-3 border-b-[0.5px]"
        style={{ borderColor: 'var(--border)', background: 'hsla(38, 70%, 60%, 0.06)' }}
      >
        <span className="text-[10px] uppercase tracking-[0.12em] text-ink-2">Queue</span>
        <button
          onClick={onClose}
          title="Collapse"
          aria-label="Collapse queue"
          className="grid place-items-center w-6 h-6 rounded-md text-ink-3 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors"
        >
          <CaretRight size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
        {queue.length === 0 ? (
          <p className="text-[12px] text-ink-3 font-light leading-relaxed text-center px-2 mt-8">
            Send references from the Dump Board to begin.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {queue.map((q) => {
              const placedAlready = isPlaced(q.id)
              const missing = (q.type === 'image' || q.type === 'video') && !q.src
              return (
                <div
                  key={q.id}
                  draggable={!missing}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-palma-queue', q.id)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className={`group relative rounded-[8px] overflow-hidden border-[0.5px] transition-opacity ${
                    missing ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                  } ${placedAlready ? 'opacity-55' : 'opacity-100'}`}
                  style={{ borderColor: 'var(--border-2)', background: 'var(--surface-2)' }}
                  title={missing ? 'Source missing' : placedAlready ? 'Placed — drag to add again' : 'Drag onto a zone'}
                >
                  <div className="aspect-[4/3] w-full bg-surface">
                    {missing ? (
                      <div className="w-full h-full grid place-items-center">
                        <ImageBroken size={20} className="text-ink-3" />
                      </div>
                    ) : q.type === 'image' ? (
                      <img src={q.src} alt={q.label} draggable={false} loading="lazy" decoding="async" className="w-full h-full object-cover pointer-events-none" />
                    ) : q.type === 'video' ? (
                      <video src={q.src} muted preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                    ) : (
                      <div className="w-full h-full p-2 text-[11px] leading-[1.45] text-ink-2 overflow-hidden">
                        {q.content || q.label || 'Note'}
                      </div>
                    )}
                  </div>

                  {placedAlready && (
                    <span
                      className="absolute top-1 left-1 grid place-items-center w-4 h-4 rounded-full"
                      style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                      title="Placed"
                    >
                      <Check size={9} weight="bold" />
                    </span>
                  )}
                  {missing && (
                    <span className="absolute top-1 left-1 text-[8px] uppercase tracking-wide px-1 py-0.5 rounded bg-[rgba(10,10,10,0.06)] text-ink-3">
                      missing
                    </span>
                  )}

                  <button
                    onClick={() => removeFromQueue(q.id)}
                    aria-label="Remove from queue"
                    className="absolute top-1 right-1 grid place-items-center w-4 h-4 rounded-full bg-[rgba(10,10,10,0.7)] text-white/85 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={9} weight="bold" />
                  </button>

                  {(q.label || q.type) && (
                    <div className="px-2 py-1 text-[10px] text-ink-3 truncate border-t-[0.5px]" style={{ borderColor: 'var(--border)' }}>
                      {q.label || q.type}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.aside>
  )
}
