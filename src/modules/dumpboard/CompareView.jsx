import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowsLeftRight } from '@phosphor-icons/react'
import { useCanvasStore } from '../../store/canvasStore.js'
import { extractVibePalette } from '../../utils/colourExtract.js'

// Side-by-side direction review: two frames shown as clean, equal columns with
// their palettes, so A and B are judged on the same footing rather than on
// where they happen to sit on the board. Either side can switch frames.
const loadImage = (src) =>
  new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })

const readingOrder = (arr) => [...arr].sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x))

export default function CompareView({ leftId, rightId, onClose }) {
  const items = useCanvasStore((s) => s.items)
  const [ids, setIds] = useState([leftId, rightId])

  const frames = useMemo(() => {
    const m = new Map()
    for (const it of items) {
      if (!it.groupId) continue
      if (!m.has(it.groupId)) m.set(it.groupId, { id: it.groupId, name: it.groupName || 'Untitled frame', color: it.groupColor, members: [] })
      m.get(it.groupId).members.push(it)
    }
    return m
  }, [items])

  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const options = [...frames.values()]
  // Portalled to <body>: inside the board, the canvas layers' stacking
  // contexts paint over it. Full-window (below the title bar) suits review.
  return createPortal(
    <div className="compare-in fixed inset-x-0 bottom-0 top-8 z-[200] flex flex-col" style={{ background: 'var(--bg)' }} onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b-[0.5px]" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[13px] text-ink font-medium">Compare directions</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setIds(([a, b]) => [b, a])} title="Swap sides" className="grid place-items-center w-8 h-8 rounded-md text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors">
            <ArrowsLeftRight size={16} />
          </button>
          <button onClick={onClose} title="Close (Esc)" className="grid place-items-center w-8 h-8 rounded-md text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-2">
        {ids.map((id, side) => (
          <Column
            key={side}
            frame={frames.get(id)}
            options={options}
            onPick={(next) => setIds((cur) => cur.map((v, i) => (i === side ? next : v)))}
            divider={side === 0}
          />
        ))}
      </div>
    </div>,
    document.body
  )
}

function Column({ frame, options, onPick, divider }) {
  const members = useMemo(() => readingOrder((frame?.members || []).filter((m) => !m.placeholder)), [frame])
  const images = members.filter((m) => (m.type === 'image' || m.type === 'gif') && m.src && !m.missing)
  const notes = members.filter((m) => (m.type === 'note' || m.type === 'comment') && m.content?.trim())
  const [palette, setPalette] = useState([])
  const srcKey = images.map((m) => m.src).join('|')

  useEffect(() => {
    let dead = false
    if (!images.length) return setPalette([])
    Promise.all(images.slice(0, 24).map((m) => loadImage(m.src))).then((imgs) => {
      if (!dead) setPalette(extractVibePalette(imgs.filter(Boolean), 6))
    })
    return () => {
      dead = true
    }
  }, [srcKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-0 flex flex-col" style={divider ? { borderRight: '0.5px solid var(--border)' } : undefined}>
      <div className="shrink-0 px-6 pt-5 pb-4 flex items-center gap-3">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: frame?.color || 'var(--border-2)' }} />
        <select
          value={frame?.id || ''}
          onChange={(e) => onPick(e.target.value)}
          className="min-w-0 bg-transparent text-[18px] font-medium text-ink outline-none cursor-pointer truncate"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-ink-3 tabular-nums shrink-0">{images.length} {images.length === 1 ? 'ref' : 'refs'}</span>
      </div>
      {palette.length > 0 && (
        <div className="shrink-0 px-6 pb-4 flex gap-1.5">
          {palette.map((c) => (
            <div key={c} className="flex-1 h-8 rounded-md" style={{ background: c }} title={c} />
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-8">
        {images.length === 0 && notes.length === 0 && <div className="text-[13px] text-ink-3 pt-8 text-center">Nothing in this frame yet.</div>}
        <div style={{ columnCount: images.length > 4 ? 3 : 2, columnGap: 10 }}>
          {images.map((m) => (
            <img key={m.id} src={m.src} alt={m.label || ''} className="w-full mb-2.5 rounded-md block" style={{ breakInside: 'avoid' }} draggable={false} />
          ))}
        </div>
        {notes.length > 0 && (
          <div className="mt-4 space-y-2">
            {notes.map((n) => (
              <p key={n.id} className="text-[13px] leading-relaxed text-ink-2 whitespace-pre-wrap border-l-2 pl-3" style={{ borderColor: frame?.color || 'var(--border-2)' }}>
                {n.content}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
