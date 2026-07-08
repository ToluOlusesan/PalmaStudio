import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Minus, ArrowsIn, X, ImageBroken, Rows, Columns, GridFour, NotePencil, ChatCircle, Export } from '@phosphor-icons/react'
import { useFocusStore, ZONE_COLORS, zoneFill, zoneStroke } from '../../store/focusStore.js'
import { useSettingsStore } from '../../store/settingsStore.js'
import { zoneLayout, ZONE_LAYOUTS } from '../../utils/focusLayout.js'

const LAYOUT_ICONS = { grid: GridFour, horizontal: Rows, vertical: Columns }

const ZOOM_MIN = 0.25
const ZOOM_MAX = 4
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// The Focus canvas: tinted Zone containers that hold and arrange the references
// dropped into them. Populated only by dropping items from the Queue.
export default function FocusBoard({ onOpenExport }) {
  const panX = useFocusStore((s) => s.panX)
  const panY = useFocusStore((s) => s.panY)
  const zoom = useFocusStore((s) => s.zoom)
  const zones = useFocusStore((s) => s.zones)
  const placed = useFocusStore((s) => s.placed)
  const queue = useFocusStore((s) => s.queue)
  const notes = useFocusStore((s) => s.notes)
  const setView = useFocusStore((s) => s.setView)
  const commitView = useFocusStore((s) => s.commitView)
  const addZone = useFocusStore((s) => s.addZone)
  const addNote = useFocusStore((s) => s.addNote)
  const addZoneComment = useFocusStore((s) => s.addZoneComment)
  const placeItem = useFocusStore((s) => s.placeItem)
  const moveMember = useFocusStore((s) => s.moveMember)

  const canvasRef = useRef(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [dragOverZone, setDragOverZone] = useState(null)
  const [liftZone, setLiftZone] = useState(null) // zone floated above others while a member drags out of it
  const [resizingZone, setResizingZone] = useState(null) // members track 1:1 (no transition) while its zone resizes

  const queueById = useCallback((id) => queue.find((q) => q.id === id), [queue])

  const toWorld = useCallback((cx, cy) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const s = useFocusStore.getState()
    return { x: (cx - rect.left - s.panX) / s.zoom, y: (cy - rect.top - s.panY) / s.zoom }
  }, [])

  // World-space centre of the visible canvas — where toolbar-added notes land.
  const centreOfViewport = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 80, y: 80 }
    return toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [toWorld])

  const zoneAt = (wx, wy) => {
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i]
      if (wx >= z.x && wx <= z.x + z.width && wy >= z.y && wy <= z.y + z.height) return z.id
    }
    return null
  }

  // A dragged member dropped at `world` → which zone + which slot.
  const memberDropTarget = (world) => {
    const zid = zoneAt(world.x, world.y)
    if (!zid) return null
    const z = zones.find((zz) => zz.id === zid)
    const count = placed.filter((p) => p.zoneId === zid).length
    return { zoneId: zid, index: zoneLayout(z, count).indexAt(world.x, world.y) }
  }
  const onMemberDrop = (placedId, world) => {
    const t = memberDropTarget(world)
    if (t) moveMember(placedId, t.zoneId, t.index) // else: snap back to its cell
  }

  // Space toggles pan affordance (ignored while editing a field).
  useEffect(() => {
    const editable = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    const down = (e) => {
      if (e.code === 'Space' && !editable(document.activeElement)) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const up = (e) => e.code === 'Space' && setSpaceDown(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Wheel: ctrl/pinch → zoom anchored at cursor; otherwise pan. 1:1, no easing.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const s = useFocusStore.getState()
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const next = clamp(s.zoom * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX)
        const wx = (sx - s.panX) / s.zoom
        const wy = (sy - s.panY) / s.zoom
        setView(sx - wx * next, sy - wy * next, next)
      } else {
        setView(s.panX - e.deltaX, s.panY - e.deltaY, s.zoom)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setView])

  const panMode = spaceDown
  const onBgMouseDown = (e) => {
    if (!(spaceDown || e.button === 1)) return
    e.preventDefault()
    setIsPanning(true)
    const start = { x: e.clientX, y: e.clientY }
    const o = useFocusStore.getState()
    const move = (ev) => setView(o.panX + (ev.clientX - start.x), o.panY + (ev.clientY - start.y), o.zoom)
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setIsPanning(false)
      commitView()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const zoomTo = (next) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const s = useFocusStore.getState()
    const cx = rect ? rect.width / 2 : 0
    const cy = rect ? rect.height / 2 : 0
    const nz = clamp(next, ZOOM_MIN, ZOOM_MAX)
    const wx = (cx - s.panX) / s.zoom
    const wy = (cy - s.panY) / s.zoom
    setView(cx - wx * nz, cy - wy * nz, nz)
    commitView()
  }
  const resetView = () => {
    setView(0, 0, 1)
    commitView()
  }

  // Drop a Queue card → add it as a member of whatever zone it's over.
  const onDragOver = (e) => {
    if (!Array.from(e.dataTransfer.types).includes('application/x-palma-queue')) return
    e.preventDefault()
    const p = toWorld(e.clientX, e.clientY)
    setDragOverZone(zoneAt(p.x, p.y))
  }
  const onDrop = (e) => {
    const qid = e.dataTransfer.getData('application/x-palma-queue')
    setDragOverZone(null)
    if (!qid) return
    e.preventDefault()
    const p = toWorld(e.clientX, e.clientY)
    const zid = zoneAt(p.x, p.y)
    if (zid) placeItem(qid, zid) // the zone's grid fits it into place
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* All surfaces are token-based, so they follow the app theme and the
          Focus dim automatically — no per-element theming here. */}
      <div
        className="h-11 shrink-0 flex items-center justify-between px-3 border-b-[0.5px]"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div data-tut="focus-toolbar" className="flex items-center gap-1.5">
          <button
            onClick={addZone}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] border-[0.5px] border-transparent transition-colors text-ink-2 hover:bg-surface-3 hover:text-ink"
          >
            <Plus size={15} weight="bold" /> Add Zone
          </button>
          <button
            onClick={() => addNote(centreOfViewport())}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] border-[0.5px] border-transparent transition-colors text-ink-2 hover:bg-surface-3 hover:text-ink"
          >
            <NotePencil size={15} weight="bold" /> Add Note
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-ink-3">
            {zones.length} {zones.length === 1 ? 'zone' : 'zones'}
            <span className="opacity-40">·</span>
            {placed.length} placed
          </div>
          <span className="w-px h-5 bg-[var(--border)]" />
          <button
            onClick={() => onOpenExport?.()}
            title="Export"
            aria-label="Export"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] border-[0.5px] border-transparent transition-colors text-ink-2 hover:bg-surface-3 hover:text-ink"
          >
            <Export size={15} style={{ color: '#6366F1' }} /> Export
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        onMouseDown={onBgMouseDown}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOverZone(null)}
        onDrop={onDrop}
        className="canvas-grain relative flex-1 overflow-hidden transition-colors duration-300"
        style={{
          backgroundColor: 'var(--surface-canvas)',
          backgroundImage: `radial-gradient(circle, var(--grid-dot) 1px, transparent 1px)`,
          // Rounded to a whole pixel — see the matching comment in DumpBoard.jsx.
          backgroundSize: `${Math.round(22 * zoom)}px ${Math.round(22 * zoom)}px`,
          backgroundPosition: `${panX % Math.round(22 * zoom)}px ${panY % Math.round(22 * zoom)}px`,
          cursor: panMode ? (isPanning ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <div
          className="absolute top-0 left-0 w-full h-full"
          style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: '0 0', willChange: 'transform', zIndex: 1 }}
          onDoubleClick={(e) => {
            // Only when the double-click lands on the bare canvas — not on a zone,
            // note, or comment (those sit in child layers and handle their own).
            if (e.target !== e.currentTarget || panMode) return
            addNote(toWorld(e.clientX, e.clientY))
          }}
        >
          {zones.map((z) => {
            const members = placed.filter((p) => p.zoneId === z.id)
            const lay = zoneLayout(z, members.length)
            return (
              <Zone key={z.id} zone={z} dragOver={dragOverZone === z.id} lifted={liftZone === z.id} panMode={panMode} count={members.length} onResizeState={setResizingZone} onAddComment={() => addZoneComment(z.id)}>
                {members.map((m, i) => {
                  const entry = queueById(m.queueItemId)
                  if (!entry) return null
                  return <Member key={m.id} placed={m} entry={entry} cell={lay.cellAt(i)} panMode={panMode} toWorld={toWorld} onDrop={onMemberDrop} onLift={setLiftZone} instant={resizingZone === z.id} />
                })}
              </Zone>
            )
          })}

          {/* Freestanding notes — like a Dump Board note, not tied to any zone. */}
          {notes
            .filter((n) => n.type === 'note')
            .map((n) => (
              <FocusNote key={n.id} note={n} panMode={panMode} />
            ))}

          {/* Comments pinned to a zone — position tracks the zone automatically
              (offset-based), so it rides along when the zone moves or resizes. */}
          {notes
            .filter((n) => n.type === 'comment')
            .map((n) => {
              const zone = zones.find((z) => z.id === n.zoneId)
              if (!zone) return null
              return <ZoneComment key={n.id} note={n} zone={zone} panMode={panMode} />
            })}
        </div>

        {placed.length === 0 && zones.length > 0 && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-[12px] font-light text-ink-3">Drag references from the Queue into a zone →</div>
          </div>
        )}

        <div className="pop-in glass-bar absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 rounded-full px-1.5 py-1" onMouseDown={(e) => e.stopPropagation()}>
          <ZBtn icon={Minus} label="Zoom out" onClick={() => zoomTo(zoom - 0.2)} disabled={zoom <= ZOOM_MIN} />
          <button onClick={resetView} className="px-2.5 h-8 min-w-[56px] text-[13px] font-medium tabular-nums text-ink rounded-full hover:bg-[var(--sand-hover)] transition-colors">
            {Math.round(zoom * 100)}%
          </button>
          <ZBtn icon={Plus} label="Zoom in" onClick={() => zoomTo(zoom + 0.2)} disabled={zoom >= ZOOM_MAX} />
          <span className="w-px h-5 mx-1 bg-[var(--border-2)]" />
          <ZBtn icon={ArrowsIn} label="Reset view" onClick={resetView} />
        </div>
      </div>
    </div>
  )
}

function ZBtn({ icon: Icon, label, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} className="grid place-items-center w-8 h-8 rounded-full text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
      <Icon size={16} weight="regular" />
    </button>
  )
}

// A tinted zone container. Drag anywhere on the body to move it; rename/recolour/
// delete from the header; resize from the corner. Members render inside it.
function Zone({ zone, dragOver, lifted, panMode, count, onResizeState, onAddComment, children }) {
  const updateZone = useFocusStore((s) => s.updateZone)
  const commitZones = useFocusStore((s) => s.commitZones)
  const deleteZone = useFocusStore((s) => s.deleteZone)
  const dark = useSettingsStore((s) => s.darkMode)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)

  // On the pitch-black dark canvas the zones read as "lit": richer tints and a
  // soft coloured glow. In light mode they sit flat on paper. Chrome uses ink
  // tokens so it stays legible either way.
  const fillA = dark ? (dragOver ? 0.28 : 0.2) : dragOver ? 0.16 : 0.1
  const strokeA = dark ? (dragOver ? 0.95 : 0.62) : dragOver ? 0.7 : 0.3
  const nameText = 'text-ink-2 hover:text-ink'
  const chromeText = 'text-ink-3 hover:text-ink'
  const hintText = 'text-ink-3'

  const startMove = (e) => {
    if (panMode || e.button !== 0) return
    e.stopPropagation()
    const start = { x: e.clientX, y: e.clientY, zx: zone.x, zy: zone.y }
    const zoomNow = useFocusStore.getState().zoom
    const move = (ev) => {
      updateZone(zone.id, { x: Math.round(start.zx + (ev.clientX - start.x) / zoomNow), y: Math.round(start.zy + (ev.clientY - start.y) / zoomNow) })
      useFocusStore.getState().separateZones(zone.id) // zones shove each other aside, never overlap
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      commitZones()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const startResize = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY, w: zone.width, h: zone.height }
    const zoomNow = useFocusStore.getState().zoom
    onResizeState?.(zone.id) // members track the zone 1:1 (no reflow lag) while resizing
    const move = (ev) => {
      updateZone(zone.id, { width: Math.max(160, Math.round(start.w + (ev.clientX - start.x) / zoomNow)), height: Math.max(120, Math.round(start.h + (ev.clientY - start.y) / zoomNow)) })
      useFocusStore.getState().separateZones(zone.id) // grow into a neighbour → it moves aside
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      onResizeState?.(null)
      commitZones()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const remove = () => {
    if (count > 0 && !window.confirm(`Delete "${zone.name}"? Its ${count} reference${count === 1 ? '' : 's'} return to the Queue.`)) return
    deleteZone(zone.id)
  }
  const mode = zone.layout || 'grid'
  const LayoutIcon = LAYOUT_ICONS[mode] || LAYOUT_ICONS.grid
  const cycleLayout = () => {
    const next = ZONE_LAYOUTS[(ZONE_LAYOUTS.indexOf(mode) + 1) % ZONE_LAYOUTS.length]
    updateZone(zone.id, { layout: next })
    commitZones()
  }

  return (
    <div
      onMouseDown={startMove}
      className="group/zone absolute rounded-[12px]"
      style={{
        left: zone.x,
        top: zone.y,
        width: zone.width,
        height: zone.height,
        background: zoneFill(zone.color, fillA, dark),
        border: `1.5px solid ${zoneStroke(zone.color, strokeA, dark)}`,
        boxShadow: dark ? `0 0 26px -2px ${zoneStroke(zone.color, 0.4, true)}` : 'none',
        transition: 'border-color 150ms ease-out, background 150ms ease-out, box-shadow 300ms ease-out',
        cursor: panMode ? 'inherit' : 'grab',
        zIndex: lifted ? 500 : 0,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-7 flex items-center justify-between px-2 rounded-t-[12px]">
        {editing ? (
          <input
            autoFocus
            defaultValue={zone.name}
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              updateZone(zone.id, { name: e.target.value.trim() || zone.name })
              commitZones()
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') setEditing(false)
            }}
            className="h-5 w-[150px] bg-[var(--surface-modal)] border-[0.5px] border-[var(--border-2)] rounded px-1.5 text-[11px] uppercase tracking-[0.08em] text-ink outline-none"
          />
        ) : (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setEditing(true)}
            className={`text-[11px] uppercase tracking-[0.08em] ${nameText} truncate max-w-[70%] transition-colors`}
            title="Rename zone"
          >
            {zone.name}
          </button>
        )}

        <div className="relative flex items-center gap-1.5">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={cycleLayout}
            title={`Layout: ${mode} — click to change`}
            className={`grid place-items-center w-4 h-4 rounded transition-colors ${chromeText}`}
          >
            <LayoutIcon size={13} />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onAddComment}
            title="Pin a comment to this zone"
            className={`grid place-items-center w-4 h-4 rounded transition-colors ${chromeText}`}
          >
            <ChatCircle size={13} />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setPicking((v) => !v)}
            title="Zone colour"
            className="w-3.5 h-3.5 rounded-full border-[0.5px] border-[var(--border-2)]"
            style={{ background: zoneStroke(zone.color, 0.9) }}
          />
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={remove}
            title="Delete zone"
            className={`grid place-items-center w-4 h-4 rounded opacity-0 group-hover/zone:opacity-100 transition-opacity ${chromeText}`}
          >
            <X size={11} weight="bold" />
          </button>

          {picking && (
            <div
              className="pop-in absolute top-5 right-0 z-[60] flex flex-wrap gap-1.5 p-2 rounded-md bg-[var(--surface-modal)] border-[0.5px] w-[120px]"
              style={{ borderColor: 'var(--border-2)', boxShadow: 'var(--shadow-lifted)' }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {ZONE_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => {
                    updateZone(zone.id, { color: c.name })
                    commitZones()
                    setPicking(false)
                  }}
                  title={c.name}
                  className="w-5 h-5 rounded-full border-[0.5px] border-[var(--border-2)] transition-transform hover:scale-110"
                  style={{ background: zoneStroke(c.name, 0.9), outline: c.name === zone.color ? '2px solid var(--ink)' : 'none', outlineOffset: '1px' }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Empty hint inside the zone */}
      {count === 0 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none px-3">
          <span className={`text-[10px] text-center leading-relaxed ${hintText}`}>Drop references here</span>
        </div>
      )}

      {children}

      {!panMode && (
        <div
          onMouseDown={startResize}
          className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-[4px] opacity-60 group-hover/zone:opacity-100 transition-opacity"
          style={{ background: zoneStroke(zone.color, 0.85), border: '1.5px solid var(--surface-canvas)', cursor: 'nwse-resize' }}
        />
      )}
    </div>
  )
}

// A reference inside a zone, positioned by the zone's grid. Grab to rearrange
// within the zone or drag onto another zone; the layout reflows smoothly.
function Member({ placed, entry, cell, panMode, toWorld, onDrop, onLift, instant }) {
  const unplaceItem = useFocusStore((s) => s.unplaceItem)
  const [drag, setDrag] = useState(null) // {dx, dy} world-space offset while dragging

  const start = (e) => {
    if (panMode || e.button !== 0) return
    e.stopPropagation()
    const sx = e.clientX
    const sy = e.clientY
    const zoomNow = useFocusStore.getState().zoom
    let moved = false
    const move = (ev) => {
      if (!moved) onLift?.(placed.zoneId) // float this zone above the others
      moved = true
      setDrag({ dx: (ev.clientX - sx) / zoomNow, dy: (ev.clientY - sy) / zoomNow })
    }
    const up = (ev) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDrag(null)
      onLift?.(null)
      if (moved) onDrop(placed.id, toWorld(ev.clientX, ev.clientY))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const missing = (entry.type === 'image' || entry.type === 'video') && !entry.src

  return (
    <div
      onMouseDown={start}
      className="group/m absolute"
      style={{
        left: cell.x,
        top: cell.y,
        width: cell.w,
        height: cell.h,
        transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : 'none',
        zIndex: drag ? 1000 : 10,
        cursor: panMode ? 'inherit' : drag ? 'grabbing' : 'grab',
        // No reflow transition while dragging or while the zone is being resized
        // (so members track the zone edge 1:1 instead of lagging/cutting through).
        transition: drag || instant ? 'none' : 'left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease',
      }}
    >
      <div
        className="w-full h-full rounded-[6px] overflow-hidden relative bg-surface-2"
        style={{ border: '0.5px solid var(--border-2)', boxShadow: drag ? 'var(--shadow-lifted)' : 'var(--shadow-soft)' }}
      >
        {missing ? (
          <div className="w-full h-full grid place-items-center bg-surface">
            <ImageBroken size={18} className="text-ink-3" />
          </div>
        ) : entry.type === 'image' ? (
          // object-contain (not cover): the auto-grid cell still packs tidily,
          // but the image is never cropped — it letterboxes at its real aspect
          // ratio so no detail is hidden.
          <img src={entry.src} alt={entry.label} draggable={false} decoding="async" className="w-full h-full object-contain pointer-events-none select-none" />
        ) : entry.type === 'video' ? (
          <video src={entry.src} muted preload="metadata" className="w-full h-full object-contain pointer-events-none" />
        ) : (
          <div className="w-full h-full p-2 text-[11px] leading-[1.45] text-ink overflow-hidden">{entry.content || entry.label}</div>
        )}
      </div>

      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => unplaceItem(placed.id)}
        title="Remove from zone (back to Queue)"
        className="absolute -top-2 -right-2 grid place-items-center w-5 h-5 rounded-full bg-[var(--surface-modal)] border-[0.5px] text-ink-3 hover:text-ink opacity-0 group-hover/m:opacity-100 transition-opacity"
        style={{ borderColor: 'var(--border-2)', boxShadow: 'var(--shadow-soft)' }}
      >
        <X size={11} weight="bold" />
      </button>
    </div>
  )
}

// A freestanding note on the Focus canvas — not tied to any zone. Drag the body
// to move, corner handle to resize, double-click to edit. Mirrors the Dump
// Board note's interaction model.
function FocusNote({ note, panMode }) {
  const updateNote = useFocusStore((s) => s.updateNote)
  const commitNotes = useFocusStore((s) => s.commitNotes)
  const deleteNote = useFocusStore((s) => s.deleteNote)
  const [editing, setEditing] = useState(!note.content)
  const [drag, setDrag] = useState(false)

  const startMove = (e) => {
    if (panMode || e.button !== 0 || editing) return
    e.stopPropagation()
    const start = { x: e.clientX, y: e.clientY, nx: note.x, ny: note.y }
    const zoomNow = useFocusStore.getState().zoom
    let moved = false
    const move = (ev) => {
      if (!moved && (Math.abs(ev.clientX - start.x) > 2 || Math.abs(ev.clientY - start.y) > 2)) {
        moved = true
        setDrag(true)
      }
      if (!moved) return
      updateNote(note.id, {
        x: Math.round(start.nx + (ev.clientX - start.x) / zoomNow),
        y: Math.round(start.ny + (ev.clientY - start.y) / zoomNow),
      })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDrag(false)
      if (moved) commitNotes()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const startResize = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY, w: note.width, h: note.height }
    const zoomNow = useFocusStore.getState().zoom
    const move = (ev) =>
      updateNote(note.id, {
        width: Math.max(120, Math.round(start.w + (ev.clientX - start.x) / zoomNow)),
        height: Math.max(80, Math.round(start.h + (ev.clientY - start.y) / zoomNow)),
      })
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      commitNotes()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      onMouseDown={startMove}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      className="group/note absolute rounded-[8px] bg-surface-2"
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        border: '0.5px solid var(--border-2)',
        boxShadow: drag ? 'var(--shadow-lifted)' : 'var(--shadow-soft)',
        cursor: panMode ? 'inherit' : editing ? 'text' : drag ? 'grabbing' : 'grab',
        zIndex: drag ? 900 : 8,
      }}
    >
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => deleteNote(note.id)}
        title="Delete note"
        className="absolute -top-2 -right-2 z-10 grid place-items-center w-5 h-5 rounded-full bg-[var(--surface-modal)] border-[0.5px] text-ink-3 hover:text-ink opacity-0 group-hover/note:opacity-100 transition-opacity"
        style={{ borderColor: 'var(--border-2)', boxShadow: 'var(--shadow-soft)' }}
      >
        <X size={11} weight="bold" />
      </button>

      <div className="w-full h-full p-3">
        {editing ? (
          <textarea
            autoFocus
            defaultValue={note.content}
            placeholder="Note…"
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              updateNote(note.id, { content: e.target.value })
              commitNotes()
              setEditing(false)
            }}
            className="w-full h-full resize-none bg-transparent text-[13px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
          />
        ) : (
          <div className="w-full h-full overflow-hidden text-[13px] leading-[1.6] text-ink whitespace-pre-wrap">
            {note.content || <span className="text-ink-3 font-light">Double-click to write…</span>}
          </div>
        )}
      </div>

      {!panMode && !editing && (
        <div
          onMouseDown={startResize}
          className="absolute -right-1 -bottom-1 w-3 h-3 rounded-[3px] opacity-0 group-hover/note:opacity-100 transition-opacity"
          style={{ background: 'var(--accent)', border: '1px solid var(--bg)', cursor: 'nwse-resize' }}
        />
      )}
    </div>
  )
}

// A comment pinned to a zone. Position is an OFFSET from the zone's top-left
// (see focusStore.addZoneComment), so it automatically rides along when the
// zone moves or resizes — no extra bookkeeping needed. Collapsed → a small pin
// (click expands it, drag repositions it); expanded → a small card you type
// into, auto-minimising on blur if it has content, or dropping itself if empty.
const COMMENT_PIN = 26
function ZoneComment({ note, zone, panMode }) {
  const updateNote = useFocusStore((s) => s.updateNote)
  const commitNotes = useFocusStore((s) => s.commitNotes)
  const deleteNote = useFocusStore((s) => s.deleteNote)
  const rootRef = useRef(null)
  const [drag, setDrag] = useState(false)

  const collapsed = note.collapsed
  const w = collapsed ? COMMENT_PIN : note.width
  const h = collapsed ? COMMENT_PIN : note.height

  // Close on outside click while expanded — minimise if it has text, else drop
  // the empty annotation. Matches the Dump Board comment's behaviour.
  useEffect(() => {
    if (collapsed) return
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return
      const ta = rootRef.current?.querySelector('textarea')
      const v = (ta ? ta.value : note.content || '').trim()
      if (v) updateNote(note.id, { content: v, collapsed: true })
      else deleteNote(note.id)
      commitNotes()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [collapsed, note.id, note.content, updateNote, deleteNote, commitNotes])

  const startMove = (e) => {
    if (panMode || e.button !== 0) return
    e.stopPropagation()
    const start = { x: e.clientX, y: e.clientY, nx: note.x, ny: note.y }
    const zoomNow = useFocusStore.getState().zoom
    let moved = false
    const move = (ev) => {
      if (!moved && (Math.abs(ev.clientX - start.x) > 2 || Math.abs(ev.clientY - start.y) > 2)) {
        moved = true
        setDrag(true)
      }
      if (!moved) return
      updateNote(note.id, {
        x: Math.round(start.nx + (ev.clientX - start.x) / zoomNow),
        y: Math.round(start.ny + (ev.clientY - start.y) / zoomNow),
      })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDrag(false)
      if (moved) commitNotes()
      else if (collapsed) updateNote(note.id, { collapsed: false }) // click (no drag) expands
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      ref={rootRef}
      onMouseDown={startMove}
      className="absolute rounded-[6px] overflow-hidden"
      style={{
        left: zone.x + note.x,
        top: zone.y + note.y,
        width: w,
        height: h,
        background: 'var(--surface-2)',
        border: '0.5px solid var(--border-2)',
        boxShadow: drag ? 'var(--shadow-lifted)' : 'var(--shadow-soft)',
        cursor: panMode ? 'inherit' : collapsed ? 'pointer' : drag ? 'grabbing' : 'grab',
        zIndex: drag ? 900 : 12,
      }}
    >
      {collapsed ? (
        <div
          className="w-full h-full grid place-items-center"
          style={{ background: '#8A8F98', color: '#0a0a0a' }}
          title={note.content || 'Comment'}
        >
          <ChatCircle size={13} weight="fill" />
        </div>
      ) : (
        <div className="w-full h-full flex flex-col" style={{ borderLeft: '3px solid #8A8F98' }}>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              updateNote(note.id, { collapsed: true })
              commitNotes()
            }}
            title="Minimise"
            className="absolute top-1 right-1 z-10 grid place-items-center w-5 h-5 rounded text-ink-3 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors"
          >
            <Minus size={12} />
          </button>
          <textarea
            autoFocus={!note.content}
            defaultValue={note.content}
            placeholder="Comment…"
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = e.target.value.trim()
              updateNote(note.id, { content: v, collapsed: !!v })
              commitNotes()
            }}
            className="flex-1 min-h-0 w-full resize-none bg-transparent p-2.5 pl-3 pr-6 text-[12px] leading-[1.55] text-ink outline-none placeholder:text-ink-3"
          />
        </div>
      )}
    </div>
  )
}
