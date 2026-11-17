import { useMemo, useState } from 'react'
import { BezierCurve, ArrowElbowRight, LineSegment, ArrowRight, ArrowsLeftRight, Minus, LineSegments, TextT, ArrowCounterClockwise, Trash } from '@phosphor-icons/react'
import { useCanvasStore } from '../../store/canvasStore.js'
import { connectorGeometry, pointAt, nearestT } from '../../utils/connectorPath.js'

// Connectors v2 — splines that leave each item square to a side, with a style
// (curve / elbow / straight), end caps, dashes, a draggable bend, labels that
// slide along the line, and reconnectable ends. Geometry is in canvas space and
// mapped to screen here so strokes stay a constant pixel weight at any zoom.
const hitItem = (p, exclude) =>
  useCanvasStore
    .getState()
    .items.filter((it) => it.id !== exclude && it.type !== 'comment' && p.x >= it.x && p.x <= it.x + it.width && p.y >= it.y && p.y <= it.y + it.height)
    .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))[0]

const toCanvas = (ev) => {
  const root = document.querySelector('[data-canvas-root]')
  const r = root.getBoundingClientRect()
  const { panX, panY, zoom } = useCanvasStore.getState()
  return { x: (ev.clientX - r.left - panX) / zoom, y: (ev.clientY - r.top - panY) / zoom }
}

// Drag helper: fires onMove after a 3px threshold (pushing one undo entry
// first when `history`), and onClick when the pointer never travelled.
function track(ev, { onMove, onEnd, onClick, history = true }) {
  const sx = ev.clientX
  const sy = ev.clientY
  let live = false
  const move = (mv) => {
    if (!live) {
      if (Math.hypot(mv.clientX - sx, mv.clientY - sy) < 3) return
      live = true
      if (history) useCanvasStore.getState().pushHistory()
    }
    onMove(mv)
  }
  const up = (uv) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    if (live) onEnd?.(uv)
    else onClick?.(uv)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

export default function Connectors({ edges, itemById, panX, panY, zoom, selectedEdgeId, linking, editingEdge, setEditingEdge }) {
  // Subscribed here, not in DumpBoard, so hovering re-renders only the lines.
  const hoverItemId = useCanvasStore((s) => (s.edges.length ? s.hoverItemId : null))
  const selectEdge = useCanvasStore((s) => s.selectEdge)
  const updateEdge = useCanvasStore((s) => s.updateEdge)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  const setEdgeLabel = useCanvasStore((s) => s.setEdgeLabel)
  // In-flight endpoint drag: { edgeId, end: 'from'|'to', x, y } (canvas coords).
  const [reconnect, setReconnect] = useState(null)

  const S = (p) => ({ x: panX + p.x * zoom, y: panY + p.y * zoom })

  const geo = useMemo(() => {
    const m = new Map()
    for (const e of edges) {
      let a = itemById.get(e.from)
      let b = itemById.get(e.to)
      let edge = e
      if (reconnect?.edgeId === e.id) {
        const free = { x: reconnect.x, y: reconnect.y }
        if (reconnect.end === 'to') b = free
        else [a, b] = [b, free]
        edge = { ...e, fromSide: undefined, toSide: undefined }
      }
      if (!a || !b) continue
      m.set(e.id, connectorGeometry(a, b, edge))
    }
    return m
  }, [edges, itemById, reconnect])

  // Drag the line itself to bend it: the bend is the cursor's offset from the
  // chord midpoint along the chord's perpendicular. One undo step.
  const startBend = (ev, e) => {
    if (ev.button !== 0) return
    ev.stopPropagation()
    selectEdge(e.id)
    const g = geo.get(e.id)
    if (!g) return
    const { p1, p2 } = g
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
    const px = -(p2.y - p1.y) / len
    const py = (p2.x - p1.x) / len
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    track(ev, {
      onMove: (mv) => {
        const c = toCanvas(mv)
        let bend = Math.round((c.x - mid.x) * px + (c.y - mid.y) * py)
        if (Math.abs(bend) < 10 / zoom) bend = 0 // easy to snap back straight
        updateEdge(e.id, { bend }, { history: false })
      },
    })
  }

  const startReconnect = (ev, e, end) => {
    ev.stopPropagation()
    ev.preventDefault()
    setReconnect({ edgeId: e.id, end, ...toCanvas(ev) })
    const other = end === 'to' ? e.from : e.to
    track(ev, {
      history: false,
      onMove: (mv) => setReconnect({ edgeId: e.id, end, ...toCanvas(mv) }),
      onEnd: (uv) => {
        setReconnect(null)
        const hit = hitItem(toCanvas(uv), other)
        if (hit && hit.id !== e[end]) updateEdge(e.id, { [end]: hit.id, fromSide: undefined, toSide: undefined })
      },
      onClick: () => setReconnect(null),
    })
  }

  const startLabelSlide = (ev, e) => {
    ev.stopPropagation()
    selectEdge(e.id)
    const g = geo.get(e.id)
    if (!g) return
    track(ev, {
      onMove: (mv) => {
        const t = nearestT(g.points, toCanvas(mv))
        updateEdge(e.id, { labelT: Math.min(0.92, Math.max(0.08, t)) }, { history: false })
      },
      onClick: () => setEditingEdge(e.id),
    })
  }

  const path = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${panX + x * zoom} ${panY + y * zoom}`)
  const selected = edges.find((e) => e.id === selectedEdgeId)
  const selGeo = selected && geo.get(selected.id)

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-[1] overflow-visible">
        <defs>
          {['ink', 'sel'].map((k) => (
            <g key={k}>
              <marker id={`pc-arrow-${k}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                <path d="M1.5,1.5 L8.5,5 L1.5,8.5" fill="none" stroke={k === 'sel' ? 'var(--accent)' : 'var(--connector)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
              <marker id={`pc-dot-${k}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="userSpaceOnUse">
                <circle cx="5" cy="5" r="4" fill={k === 'sel' ? 'var(--accent)' : 'var(--connector)'} />
              </marker>
            </g>
          ))}
        </defs>
        {edges.map((e) => {
          const g = geo.get(e.id)
          if (!g) return null
          const sel = selectedEdgeId === e.id
          const lit = sel || (hoverItemId && (e.from === hoverItemId || e.to === hoverItemId))
          const k = sel ? 'sel' : 'ink'
          const cap = (c) => (c === 'arrow' ? `url(#pc-arrow-${k})` : c === 'dot' ? `url(#pc-dot-${k})` : undefined)
          const d = path(g.d)
          return (
            <g key={e.id}>
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: 'stroke', cursor: sel ? 'grab' : 'pointer' }}
                onPointerDown={(ev) => startBend(ev, e)}
                onMouseDown={(ev) => ev.stopPropagation()}
                onDoubleClick={(ev) => {
                  ev.stopPropagation()
                  setEditingEdge(e.id)
                }}
              />
              <path
                d={d}
                pathLength={e.fresh ? 1 : undefined}
                className={e.fresh ? 'connector-draw' : undefined}
                fill="none"
                stroke={sel ? 'var(--accent)' : 'var(--connector)'}
                strokeWidth={lit ? 2 : 1.5}
                strokeLinecap="round"
                strokeDasharray={e.dashed && !e.fresh ? '6 5' : undefined}
                markerEnd={cap(e.endCap ?? 'arrow')}
                markerStart={cap(e.startCap)}
                style={{ pointerEvents: 'none', transition: 'stroke-width 120ms, opacity 150ms', opacity: lit || !hoverItemId ? 1 : 0.5 }}
              />
            </g>
          )
        })}
        {linking &&
          (() => {
            const a = itemById.get(linking.fromId)
            if (!a) return null
            const target = hitItem(linking, linking.fromId)
            const g = connectorGeometry(a, target || { x: linking.x, y: linking.y })
            return (
              <g>
                {target && (
                  <rect
                    x={panX + (target.x - 4) * zoom}
                    y={panY + (target.y - 4) * zoom}
                    width={(target.width + 8) * zoom}
                    height={(target.height + 8) * zoom}
                    rx={8}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                  />
                )}
                <path d={path(g.d)} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round" markerEnd="url(#pc-arrow-sel)" />
              </g>
            )
          })()}
      </svg>

      <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
        {/* Labels — sit on the line, slide along it, click to edit. */}
        {edges.map((e) => {
          const g = geo.get(e.id)
          if (!g) return null
          const editing = editingEdge === e.id
          if (!e.label && !editing) return null
          const p = S(pointAt(g.points, e.labelT ?? 0.5))
          return (
            <div key={e.id} className="absolute pointer-events-auto" style={{ left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }} onMouseDown={(ev) => ev.stopPropagation()}>
              {editing ? (
                <input
                  autoFocus
                  defaultValue={e.label}
                  placeholder="Label"
                  onBlur={(ev) => {
                    setEdgeLabel(e.id, ev.target.value)
                    setEditingEdge(null)
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault()
                      ev.currentTarget.blur()
                    } else if (ev.key === 'Escape') setEditingEdge(null)
                  }}
                  className="h-6 w-[140px] rounded-md bg-surface border-[0.5px] border-[var(--border-2)] px-2 text-[11px] text-ink text-center outline-none"
                />
              ) : (
                <div
                  onPointerDown={(ev) => startLabelSlide(ev, e)}
                  title="Drag to slide · click to edit"
                  className="max-w-[180px] truncate px-2 py-[3px] rounded-md bg-surface border-[0.5px] text-[11px] text-ink leading-none cursor-grab select-none"
                  style={{ borderColor: selectedEdgeId === e.id ? 'var(--accent)' : 'var(--border-2)' }}
                >
                  {e.label}
                </div>
              )}
            </div>
          )
        })}

        {/* Selected connector: reconnectable ends + style bar. */}
        {selected && selGeo && !reconnect && (
          <>
            {[
              ['from', selGeo.p1],
              ['to', selGeo.p2],
            ].map(([end, p]) => {
              const s = S(p)
              return (
                <div
                  key={end}
                  onPointerDown={(ev) => startReconnect(ev, selected, end)}
                  onMouseDown={(ev) => ev.stopPropagation()}
                  title="Drag to reconnect"
                  className="absolute pointer-events-auto w-3 h-3 rounded-full cursor-crosshair"
                  style={{ left: s.x, top: s.y, transform: 'translate(-50%, -50%)', background: 'var(--surface)', border: '1.5px solid var(--accent)' }}
                />
              )
            })}
            <EdgeBar edge={selected} at={{ x: S(pointAt(selGeo.points, 0.5)).x, y: S({ x: 0, y: Math.min(...selGeo.points.map((q) => q.y)) }).y }} updateEdge={updateEdge} removeEdge={removeEdge} onLabel={() => setEditingEdge(selected.id)} />
          </>
        )}
      </div>
    </>
  )
}

function EdgeBar({ edge, at, updateEdge, removeEdge, onLabel }) {
  const style = edge.style || 'curve'
  const end = edge.endCap ?? 'arrow'
  const caps = end === 'arrow' && edge.startCap === 'arrow' ? 'both' : end === 'arrow' ? 'end' : 'none'
  const setCaps = (c) => updateEdge(edge.id, { endCap: c === 'none' ? 'none' : 'arrow', startCap: c === 'both' ? 'arrow' : undefined })
  return (
    <div className="absolute pointer-events-auto" style={{ left: at.x, top: at.y - 22, transform: 'translate(-50%, -100%)' }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="pop-in glass-bar flex items-center gap-0.5 rounded-lg px-1 py-1">
        <B icon={BezierCurve} label="Curved" on={style === 'curve'} onClick={() => updateEdge(edge.id, { style: 'curve' })} />
        <B icon={ArrowElbowRight} label="Elbow" on={style === 'elbow'} onClick={() => updateEdge(edge.id, { style: 'elbow' })} />
        <B icon={LineSegment} label="Straight" on={style === 'straight'} onClick={() => updateEdge(edge.id, { style: 'straight' })} />
        <Sep />
        <B icon={ArrowRight} label="Arrow at end" on={caps === 'end'} onClick={() => setCaps('end')} />
        <B icon={ArrowsLeftRight} label="Arrows both ends" on={caps === 'both'} onClick={() => setCaps('both')} />
        <B icon={Minus} label="No arrows" on={caps === 'none'} onClick={() => setCaps('none')} />
        <Sep />
        <B icon={LineSegments} label="Dashed" on={!!edge.dashed} onClick={() => updateEdge(edge.id, { dashed: !edge.dashed })} />
        <B icon={TextT} label="Label" onClick={onLabel} />
        {!!edge.bend && <B icon={ArrowCounterClockwise} label="Reset bend" onClick={() => updateEdge(edge.id, { bend: 0 })} />}
        <Sep />
        <B icon={Trash} label="Delete connector" onClick={() => removeEdge(edge.id)} />
      </div>
    </div>
  )
}

function B({ icon: Icon, label, on, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`grid place-items-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--sand-hover)] ${on ? 'bg-[var(--sand-hover)] text-ink' : 'text-ink-2 hover:text-ink'}`}
    >
      <Icon size={16} />
    </button>
  )
}
const Sep = () => <div className="w-px h-4 mx-0.5" style={{ background: 'var(--border-2)' }} />
