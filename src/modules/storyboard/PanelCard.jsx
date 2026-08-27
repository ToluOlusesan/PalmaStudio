import { memo, useEffect, useRef, useState } from 'react'
import { ImageBroken, Copy, Trash, ArrowsOutCardinal } from '@phosphor-icons/react'
import { useStoryboardStore } from '../../store/storyboardStore.js'
import { cropStyle, panelPicture, panelCropFrom } from '../../utils/cropGeometry.js'

// One shot in the sequence: a fixed-aspect frame, its number, and the three
// things a motion board actually has to say — what happens, how the camera
// moves, how long it holds.
//
// The frame is a fixed shape, so putting a picture in it is a framing decision
// rather than a fit: it lands centre-cover and Ctrl-drag slides it, Ctrl-wheel
// scales it. That reuses the Dump Board's crop model wholesale, with the one
// difference that a panel's crop is stored as fractions of its box (the box
// resizes with the board's own settings — see utils/cropGeometry).
function PanelCard({ panel, index, box, isDropBefore, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const updatePanel = useStoryboardStore((s) => s.updatePanel)
  const commit = useStoryboardStore((s) => s.commit)
  const deletePanel = useStoryboardStore((s) => s.deletePanel)
  const duplicatePanel = useStoryboardStore((s) => s.duplicatePanel)
  const frameRef = useRef(null)

  // Three distinct states: a picture, a source that has gone missing (it had a
  // label, so it was filled once), or a deliberately empty blocked-out panel.
  const hasSrc = !!panel.src
  const lostSource = !hasSrc && !!panel.label
  const number = String(index + 1).padStart(2, '0')

  // The picture's intrinsic size, learned from the <img> itself. Held in state
  // rather than read off the DOM on demand: the framing maths needs the real
  // aspect ratio, and on the first render there is no element to ask. Guessing
  // the frame's own dimensions there would compute a cover fit for the wrong
  // shape and — since the picture is positioned absolutely, not object-fit —
  // draw it visibly stretched until some unrelated re-render corrected it.
  const [nat, setNat] = useState(null)
  useEffect(() => setNat(null), [panel.src])

  // Framing is stored dimensionless (scale + focal point) so it survives the
  // board switching panel size or aspect — see utils/cropGeometry.
  const writeCrop = (px) => {
    if (!nat) return
    updatePanel(panel.id, { crop: panelCropFrom(px, box.w, box.h, nat.w, nat.h) })
  }

  // Ctrl-drag inside the frame slides the picture within it.
  const startReframe = (e) => {
    if (!panel.src || !nat || !(e.ctrlKey || e.metaKey) || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const start = panelPicture(panel, box.w, box.h, nat.w, nat.h)
    const move = (ev) => {
      writeCrop({ ...start, x: start.x + (ev.clientX - e.clientX), y: start.y + (ev.clientY - e.clientY) })
    }
    const up = () => {
      commit()
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Ctrl-wheel over the frame scales the picture inside it, anchored on the
  // frame's centre. A bare wheel is left alone so the strip still scrolls.
  //
  // Bound natively with passive:false rather than via React's onWheel: React 18
  // registers wheel listeners passively at the root, so preventDefault() from a
  // synthetic handler is ignored — the picture would scale AND Chromium would
  // page-zoom the whole app underneath it.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!panel.src || !nat || !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const cur = panelPicture(panel, box.w, box.h, nat.w, nat.h)
      const k = Math.exp(-e.deltaY * 0.0015)
      // Keep the frame's centre pointing at the same part of the picture.
      const cx = box.w / 2
      const cy = box.h / 2
      writeCrop({ w: cur.w * k, h: cur.h * k, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k })
      commit()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // Until the size is known the picture is drawn with plain object-fit: cover,
  // which is exactly what an unframed panel looks like anyway — so there's no
  // distorted first paint and, for most panels, no visible change on load.
  const picture = panel.src && nat ? panelPicture(panel, box.w, box.h, nat.w, nat.h) : null

  return (
    <div
      className="relative shrink-0"
      style={{ width: box.w }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Insertion caret — where the dragged panel will land. */}
      {isDropBefore && (
        <span
          className="absolute -left-2 top-0 bottom-0 w-[2px] rounded-full pointer-events-none"
          style={{ background: 'var(--accent)' }}
        />
      )}

      <div className="group flex flex-col gap-1.5">
        {/* The frame. draggable lives here, not on the whole card, so the text
            fields below stay selectable. */}
        <div
          ref={frameRef}
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onMouseDown={startReframe}
          title={panel.src ? 'Drag to reorder · Ctrl-drag to reframe · Ctrl-wheel to zoom' : 'Drag to reorder'}
          className="relative overflow-hidden rounded-[4px] bg-surface-2 cursor-grab active:cursor-grabbing"
          style={{ width: box.w, height: box.h, border: '0.5px solid var(--border-2)' }}
        >
          {panel.src ? (
            <img
              src={panel.src}
              alt={panel.label}
              draggable={false}
              decoding="async"
              onLoad={(e) => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              className={
                picture ? 'pointer-events-none select-none' : 'w-full h-full object-cover pointer-events-none select-none'
              }
              style={picture ? cropStyle(picture) : undefined}
            />
          ) : lostSource ? (
            <div className="w-full h-full grid place-items-center bg-surface text-center px-2">
              <div>
                <ImageBroken size={20} className="text-ink-3 mx-auto mb-1" />
                <div className="text-[9px] text-ink-3 break-all leading-tight">{panel.label}</div>
              </div>
            </div>
          ) : (
            <div
              className="w-full h-full grid place-items-center"
              style={{
                background:
                  'repeating-linear-gradient(45deg, var(--sand) 0 6px, transparent 6px 12px)',
              }}
            >
              <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">Empty</span>
            </div>
          )}

          {/* Shot number — always on, because a storyboard without numbers
              isn't one. */}
          <span
            className="absolute top-1 left-1 px-1.5 py-[1px] rounded text-[10px] font-medium tabular-nums pointer-events-none"
            style={{ background: 'rgba(10,10,10,0.66)', color: '#f5f5f5' }}
          >
            {number}
          </span>

          {/* Per-panel actions, on hover. */}
          <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <PanelBtn label="Duplicate" onClick={() => duplicatePanel(panel.id)}>
              <Copy size={12} />
            </PanelBtn>
            <PanelBtn label="Delete panel" onClick={() => deletePanel(panel.id)}>
              <Trash size={12} />
            </PanelBtn>
          </div>

          {panel.src && (
            <span
              className="absolute bottom-1 right-1 grid place-items-center w-5 h-5 rounded text-[#f5f5f5] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ background: 'rgba(10,10,10,0.6)' }}
              title="Ctrl-drag to reframe"
            >
              <ArrowsOutCardinal size={12} />
            </span>
          )}
        </div>

        {/* Action · Camera · Duration */}
        <div className="flex flex-col gap-0.5 px-0.5">
          <Field
            value={panel.action}
            onChange={(v) => updatePanel(panel.id, { action: v })}
            onCommit={commit}
            placeholder="Action…"
            className="font-medium"
          />
          <Field
            value={panel.camera}
            onChange={(v) => updatePanel(panel.id, { camera: v })}
            onCommit={commit}
            placeholder="Camera…"
            className="text-ink-2"
          />
          <div className="flex items-center gap-1 pt-0.5">
            <input
              type="number"
              min="0"
              step="0.5"
              value={panel.duration}
              onChange={(e) => updatePanel(panel.id, { duration: Math.max(0, Number(e.target.value) || 0) })}
              onBlur={commit}
              className="w-11 bg-transparent text-[11px] tabular-nums text-ink-2 text-right"
            />
            <span className="text-[10px] text-ink-3">s</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Defined at module scope on purpose: a component declared inside PanelCard
// would be a NEW type on every render, so React would unmount the live input on
// each keystroke and the field would lose focus after one character.
function Field({ value, onChange, onCommit, placeholder, className = '' }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      placeholder={placeholder}
      spellCheck="false"
      className={`w-full bg-transparent text-[11px] leading-[1.5] text-ink placeholder:text-ink-3 ${className}`}
    />
  )
}

function PanelBtn({ label, onClick, children }) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid place-items-center w-5 h-5 rounded text-[#f5f5f5] transition-colors"
      style={{ background: 'rgba(10,10,10,0.6)' }}
    >
      {children}
    </button>
  )
}

// Memoised: reordering re-renders the strip, but only the panels whose data
// actually changed need to repaint their picture.
export default memo(PanelCard)
