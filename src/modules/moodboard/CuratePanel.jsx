import { useMemo, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, Check } from '@phosphor-icons/react'
import { useSessionStore } from '../../store/sessionStore.js'
import { useCanvasStore } from '../../store/canvasStore.js'
import { snapToGrid } from '../../utils/canvasUtils.js'

// Left reference rail of the Focus area. Click a ref to curate it: instead
// of a bare appearance, the thumbnail flies from the rail onto the canvas and
// lands exactly where the real item will mount. Provenance is tracked by
// sourceId so a ref is never curated twice.
const TILE_W = 200

// Screen-space FLIP clone. We deliberately DON'T use Framer's `layoutId`
// shared-element transition: the canvas item renders inside a
// `translate(pan) scale(zoom)` layer, so layoutId (which measures in screen
// space) would land at the wrong place/scale whenever zoom ≠ 1. Instead we
// compute the target screen rect ourselves from pan/zoom and animate a
// position:fixed clone between two plain screen rects.
export default function CuratePanel({ onClose }) {
  const session = useSessionStore((s) => s.session)
  const items = useCanvasStore((s) => s.items)
  const addItem = useCanvasStore((s) => s.addItem)
  const cascade = useRef(0)

  const [fly, setFly] = useState(null) // active clone: { src, type, from, to, x, y, w, h }
  const [flyingId, setFlyingId] = useState(null) // sidebar id hidden during flight

  const sources = useMemo(
    () =>
      (session?.modules?.dumpboard?.items || []).filter(
        (it) => (it.type === 'image' || it.type === 'video') && it.src && !it.missing
      ),
    [session]
  )
  const alreadyIn = useMemo(
    () => new Set(items.map((it) => it.sourceId).filter(Boolean)),
    [items]
  )

  const curate = useCallback(
    (src, thumbEl) => {
      if (!thumbEl || fly || alreadyIn.has(src.id)) return
      const canvasEl = document.querySelector('[data-canvas-root]')
      if (!canvasEl) return

      const from = thumbEl.getBoundingClientRect()
      const canvasRect = canvasEl.getBoundingClientRect()
      const { panX, panY, zoom } = useCanvasStore.getState()

      // Final canvas-space size + position. Land near the viewport centre with a
      // small cascade so successive picks don't stack perfectly.
      const ratio = src.width && src.height ? src.height / src.width : 1.25
      const w = TILE_W
      const h = Math.round(TILE_W * ratio)
      const k = cascade.current++
      const cx = (canvasRect.width / 2 - panX) / zoom
      const cy = (canvasRect.height / 2 - panY) / zoom
      const x = snapToGrid(Math.round(cx - w / 2 + (k % 5) * 24))
      const y = snapToGrid(Math.round(cy - h / 2 + (k % 5) * 24))

      // Where that canvas point sits on screen right now (matches how CanvasItem
      // renders: left:x inside the translate(pan) scale(zoom) layer).
      const to = {
        left: canvasRect.left + panX + x * zoom,
        top: canvasRect.top + panY + y * zoom,
        width: w * zoom,
        height: h * zoom,
      }

      setFlyingId(src.id)
      setFly({
        src: src.src,
        type: src.type,
        from: { left: from.left, top: from.top, width: from.width, height: from.height },
        to,
        item: { x, y, w, h, src },
      })
    },
    [fly, alreadyIn]
  )

  // On landing: mount the real item at its canvas coords and drop the clone in
  // the same commit. The real item appears at opacity 1 — the clone did the work.
  const onLanded = useCallback(() => {
    if (!fly) return
    const { x, y, w, h, src } = fly.item
    addItem({
      type: src.type,
      src: src.src,
      path: src.path,
      label: src.label,
      sourceId: src.id,
      x,
      y,
      width: w,
      height: h,
      missing: false,
      ...(src.type === 'video' ? { pinnedFrames: [], sequences: [] } : {}),
    })
    setFly(null)
    setFlyingId(null)
  }, [fly, addItem])

  return (
    <motion.aside
      className="w-[272px] shrink-0 flex flex-col bg-surface border-r-[0.5px] h-full"
      style={{ borderColor: 'var(--border)' }}
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -16, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="h-11 shrink-0 flex items-center justify-between px-4 border-b-[0.5px]">
        <span className="font-serif text-[15px] text-ink leading-none">Curate</span>
        <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors -mr-1 p-1">
          <X size={14} />
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="flex-1 grid place-items-center px-5 text-center">
          <p className="text-[12px] text-ink-3 font-light leading-relaxed">
            Nothing to curate yet. Drop images or video on the Dump Board first — the
            strongest references move here.
          </p>
        </div>
      ) : (
        <>
          <p className="px-4 pt-3 pb-2 text-[11px] text-ink-3 leading-snug">
            Click a reference to curate it onto the canvas — or drag it to the Anchors panel to pin it.
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 grid grid-cols-2 gap-2.5 content-start">
            {sources.map((src) => {
              const here = alreadyIn.has(src.id)
              return (
                <button
                  key={src.id}
                  disabled={here}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/x-palma-ref',
                      JSON.stringify({ id: src.id, src: src.src, label: src.label || '' })
                    )
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={(e) => curate(src, e.currentTarget)}
                  className="group relative aspect-square rounded-[6px] overflow-hidden border-[0.5px] disabled:cursor-default hover:border-[var(--border-2)] transition-[border-color,opacity] cursor-grab active:cursor-grabbing"
                  style={{
                    borderColor: 'var(--border)',
                    // Curated refs dim back so the rail reads as "what's left to pull".
                    opacity: flyingId === src.id ? 0 : here ? 0.45 : undefined,
                  }}
                >
                  {src.type === 'image' ? (
                    <img src={src.src} alt={src.label} draggable={false} className="w-full h-full object-cover" />
                  ) : (
                    <video src={src.src} muted draggable={false} className="w-full h-full object-cover" />
                  )}
                  {/* Quiet check (no text badge) marks an already-curated ref. */}
                  {here && (
                    <span className="absolute top-1 right-1 grid place-items-center w-4 h-4 rounded-full bg-[rgba(10,10,10,0.65)] text-white/85">
                      <Check size={10} weight="bold" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* The flying clone — fixed, above canvas and rails. Spring to the target
          screen rect; opacity fades out only in the last 15% of the flight. */}
      {fly && (
        <motion.div
          className="fixed z-[200] pointer-events-none rounded-[6px] overflow-hidden"
          initial={{ ...fly.from, opacity: 1 }}
          animate={{
            left: fly.to.left,
            top: fly.to.top,
            width: fly.to.width,
            height: fly.to.height,
            opacity: [1, 1, 0],
          }}
          transition={{
            default: { type: 'spring', stiffness: 280, damping: 24 },
            opacity: { duration: 0.4, times: [0, 0.85, 1] },
          }}
          onAnimationComplete={onLanded}
          style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.5)', border: '0.5px solid var(--border-2)' }}
        >
          {fly.type === 'image' ? (
            <img src={fly.src} alt="" className="w-full h-full object-cover" />
          ) : (
            <video src={fly.src} muted className="w-full h-full object-cover" />
          )}
        </motion.div>
      )}
    </motion.aside>
  )
}
