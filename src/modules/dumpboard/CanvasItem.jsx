import { memo, useState, useEffect, useRef } from 'react'
import { ImageBroken, ChatCircle, Minus, Lock } from '@phosphor-icons/react'
import { useCanvasStore } from '../../store/canvasStore.js'
import { useFocusStore } from '../../store/focusStore.js'
import { snapToGrid } from '../../utils/canvasUtils.js'
import Badge from '../../components/Badge.jsx'
import CanvasVideo from './CanvasVideo.jsx'

const TIDY_EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
const PIN = 30 // collapsed-comment pin size

// A single absolutely-positioned canvas item (image / video / note / comment).
// Drag moves it (screen delta ÷ zoom); a corner handle resizes. While the
// canvas is in pan mode the item yields so the canvas can pan. `animating`
// turns on the 300ms positional transition used by Tidy / Breathe. A collapsed
// comment renders as a small pin and expands on click.
function CanvasItem({ item, selected, panMode, animating, onContextMenu }) {
  const updateItem = useCanvasStore((s) => s.updateItem)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const select = useCanvasStore((s) => s.select)

  // Whether this item has been promoted to Focus (shows a corner dot), and a
  // transient flag that plays the ink-stamp pulse when it's sent.
  const sent = useFocusStore((s) => s.queue.some((q) => q.sourceItemId === item.id))
  const stamping = useFocusStore((s) => s.stampingId === item.id)

  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)

  const isComment = item.type === 'comment'
  const collapsed = isComment && item.collapsed
  const boxW = collapsed ? PIN : item.width
  const boxH = collapsed ? PIN : item.height

  // Smoothly grow/shrink the box when a comment toggles between its pin and its
  // card. Enabled only briefly around the toggle so a live resize-drag never
  // gets the lagging transition.
  const [sizeAnim, setSizeAnim] = useState(false)
  const prevCollapsed = useRef(collapsed)
  useEffect(() => {
    if (prevCollapsed.current === collapsed) return
    prevCollapsed.current = collapsed
    setSizeAnim(true)
    const t = setTimeout(() => setSizeAnim(false), 220)
    return () => clearTimeout(t)
  }, [collapsed])

  const startDrag = (e) => {
    if (panMode || e.button !== 0 || editing) return
    e.stopPropagation()
    const store = useCanvasStore.getState()

    // Selection: shift toggles; clicking an unselected item selects just it.
    // Clicking an item that's already part of a multi-selection keeps the whole
    // group so the drag moves them together.
    if (e.shiftKey) select(item.id, true)
    else if (!store.selectedIds.includes(item.id)) select(item.id, false)

    // Locked items can be selected (to unlock) but never dragged.
    if (item.locked) return

    const sel = useCanvasStore.getState().selectedIds
    const baseIds = sel.includes(item.id) && sel.length ? sel : [item.id]
    // Comments pinned to a dragged image follow it (move together).
    const allItems = useCanvasStore.getState().items
    const followers = allItems
      .filter(
        (it) =>
          it.type === 'comment' && it.anchorId && baseIds.includes(it.anchorId) && !baseIds.includes(it.id)
      )
      .map((it) => it.id)
    // Locked members of the selection stay put even while the rest drags.
    const ids = [...baseIds, ...followers].filter((id) => {
      const it = allItems.find((i) => i.id === id)
      return it && !it.locked
    })
    if (!ids.length) return
    bringToFront(item.id)

    const { zoom, items } = useCanvasStore.getState()
    const starts = new Map(
      ids.map((id) => {
        const it = items.find((i) => i.id === id)
        return [id, { x: it.x, y: it.y }]
      })
    )
    setDragging(true)

    let moved = false
    const move = (ev) => {
      const dx = (ev.clientX - e.clientX) / zoom
      const dy = (ev.clientY - e.clientY) / zoom
      if (!moved && (Math.abs(ev.clientX - e.clientX) > 2 || Math.abs(ev.clientY - e.clientY) > 2)) {
        moved = true
        useCanvasStore.getState().pushHistory() // one undo entry for the whole drag
        useCanvasStore.getState().setDraggingItems(true) // hide overlays during drag
      }
      if (!moved) return
      useCanvasStore.getState().applyPositions(
        ids.map((id) => {
          const st = starts.get(id)
          return { id, x: Math.round(st.x + dx), y: Math.round(st.y + dy) }
        })
      )
      // Live drop-target highlight: which existing group the grabbed item is over.
      if (item.type !== 'comment') {
        const st = starts.get(item.id)
        const cx = Math.round(st.x + dx) + item.width / 2
        const cy = Math.round(st.y + dy) + item.height / 2
        const store = useCanvasStore.getState()
        store.setDropTarget(store.groupAt(cx, cy, item.groupId))
      }
    }
    const up = () => {
      setDragging(false)
      useCanvasStore.getState().setDropTarget(null)
      useCanvasStore.getState().setDraggingItems(false)
      if (moved) {
        // Grid Snap: settle every dragged item's origin onto the 24px grid.
        const cur = useCanvasStore.getState().items
        useCanvasStore.getState().applyPositions(
          ids.map((id) => {
            const it = cur.find((i) => i.id === id)
            return { id, x: snapToGrid(it.x), y: snapToGrid(it.y) }
          })
        )
        // If the grabbed item is a comment, (re)anchor it to whatever image its
        // centre now sits over — or detach it if it's over empty canvas.
        if (isComment) {
          const after = useCanvasStore.getState().items
          const c = after.find((i) => i.id === item.id)
          if (c) {
            const cw = c.collapsed ? PIN : c.width
            const ch = c.collapsed ? PIN : c.height
            const cx = c.x + cw / 2
            const cy = c.y + ch / 2
            const over = after
              .filter((i) => i.type === 'image' && !i.missing)
              .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
              .find((i) => cx >= i.x && cx <= i.x + i.width && cy >= i.y && cy <= i.y + i.height)
            updateItem(item.id, { anchorId: over ? over.id : null })
          }
        } else {
          // Drop-into-group: if the grabbed item landed over another group's
          // frame, add the whole dragged set (sans comments) to that group. Rides
          // on the drag's single undo entry. Dragging one group onto another
          // merges them; dropping a lone item adds it.
          const after = useCanvasStore.getState().items
          const me = after.find((i) => i.id === item.id)
          if (me) {
            const cx = me.x + me.width / 2
            const cy = me.y + me.height / 2
            const target = useCanvasStore.getState().groupAt(cx, cy, me.groupId)
            if (target) {
              const joinIds = ids.filter((id) => {
                const it = after.find((i) => i.id === id)
                return it && it.type !== 'comment'
              })
              useCanvasStore.getState().addToGroup(joinIds, target)
            }
          }
        }
      } else if (isComment && item.collapsed) {
        // A click (no drag) on a collapsed comment expands it.
        updateItem(item.id, { collapsed: false })
      }
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const startResize = (e) => {
    e.stopPropagation()
    e.preventDefault()
    bringToFront(item.id)
    const { zoom } = useCanvasStore.getState()
    const start = { x: e.clientX, y: e.clientY, w: item.width, h: item.height, zoom }
    let pushed = false
    const move = (ev) => {
      if (!pushed) {
        pushed = true
        useCanvasStore.getState().pushHistory() // one undo entry for the resize
      }
      updateItem(item.id, {
        width: Math.max(60, Math.round(start.w + (ev.clientX - start.x) / start.zoom)),
        height: Math.max(48, Math.round(start.h + (ev.clientY - start.y) / start.zoom)),
      })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Drag from the link handle to another item to connect them. The moving end
  // follows the cursor (in canvas coords); on release over an item we add an edge.
  const startLink = (e) => {
    if (panMode) return
    e.stopPropagation()
    e.preventDefault()
    const root = document.querySelector('[data-canvas-root]')
    if (!root) return
    const rect = root.getBoundingClientRect()
    const toCanvas = (cx, cy) => {
      const { panX, panY, zoom } = useCanvasStore.getState()
      return { x: (cx - rect.left - panX) / zoom, y: (cy - rect.top - panY) / zoom }
    }
    const fromId = item.id
    const setLinking = useCanvasStore.getState().setLinking
    const p0 = toCanvas(e.clientX, e.clientY)
    setLinking({ fromId, x: p0.x, y: p0.y })
    const move = (ev) => {
      const p = toCanvas(ev.clientX, ev.clientY)
      setLinking({ fromId, x: p.x, y: p.y })
    }
    const up = (ev) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      const p = toCanvas(ev.clientX, ev.clientY)
      const hit = useCanvasStore
        .getState()
        .items.filter(
          (it) =>
            it.id !== fromId &&
            it.type !== 'comment' &&
            p.x >= it.x &&
            p.x <= it.x + it.width &&
            p.y >= it.y &&
            p.y <= it.y + it.height
        )
        .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))[0]
      if (hit) useCanvasStore.getState().addEdge(fromId, hit.id)
      setLinking(null)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      role="group"
      tabIndex={0}
      onMouseDown={startDrag}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e, item)
      }}
      className="absolute group outline-none"
      style={{
        left: item.x,
        top: item.y,
        width: boxW,
        height: boxH,
        // Comments (annotations) always sit above content — otherwise bringing an
        // image to front when you click/drag it would hide a pinned comment.
        zIndex: isComment ? 100000 + (item.zIndex || 0) : item.zIndex,
        cursor: panMode ? 'inherit' : dragging ? 'grabbing' : 'grab',
        transform: dragging ? 'scale(1.02)' : 'none',
        transition: dragging
          ? 'none'
          : animating
            ? `left 300ms ${TIDY_EASE}, top 300ms ${TIDY_EASE}`
            : sizeAnim
              ? `width 200ms ${TIDY_EASE}, height 200ms ${TIDY_EASE}, transform 80ms ease`
              : 'transform 80ms ease',
      }}
    >
      <div
        className={`card-in w-full h-full overflow-hidden relative bg-surface-2 ${
          stamping ? 'sending-to-focus' : ''
        } ${selected || dragging ? '' : 'card-rest'} ${collapsed ? 'rounded-full' : 'rounded-[6px]'}`}
        style={{
          border: '0.5px solid var(--border-2)',
          // Selected/dragging take an explicit shadow (ring + lift). At rest the
          // `card-rest` class owns the shadow so it can lift smoothly on hover.
          ...(selected || dragging
            ? {
                boxShadow:
                  (selected ? '0 0 0 1.5px var(--accent), ' : '') +
                  (dragging ? 'var(--shadow-lifted)' : 'var(--shadow-soft)'),
              }
            : {}),
        }}
      >
        {item.missing ? (
          <MissingItem item={item} />
        ) : item.type === 'image' ? (
          <img
            src={item.src}
            alt={item.label}
            draggable={false}
            decoding="async"
            className="w-full h-full object-cover pointer-events-none select-none"
          />
        ) : item.type === 'video' ? (
          <CanvasVideo item={item} />
        ) : item.type === 'comment' ? (
          <CommentItem
            item={item}
            collapsed={collapsed}
            editing={editing}
            setEditing={setEditing}
            updateItem={updateItem}
          />
        ) : (
          <NoteItem
            item={item}
            editing={editing}
            setEditing={setEditing}
            updateItem={updateItem}
          />
        )}

        {/* filename label overlay (not on notes). Hover-only to keep the board
            quiet. Videos label at the TOP so the bottom control bar stays clear;
            images label at the bottom. */}
        {item.type !== 'note' && item.label && (
          <div
            className={`absolute left-0 right-0 px-2 py-1 text-[10px] truncate pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
              item.type === 'video' ? 'top-0' : 'bottom-0'
            }`}
            style={{ background: 'rgba(10,10,10,0.85)', color: 'rgba(245,245,245,0.75)' }}
          >
            {item.label}
          </div>
        )}

        {/* Lock badge — small, persistent so a locked item reads as locked. */}
        {item.locked && (
          <div className="absolute top-1.5 left-1.5 grid place-items-center w-5 h-5 rounded-full bg-[rgba(10,10,10,0.7)] text-[#f5f5f5] pointer-events-none">
            <Lock size={11} weight="fill" />
          </div>
        )}

        {item.missing && (
          <div className="absolute top-1.5 right-1.5">
            <Badge variant="warning">missing</Badge>
          </div>
        )}
      </div>

      {/* Sent-to-Focus marker — a small green dot in the top-right corner. Green
          (not ink) so it reads as an active "promoted" state, not a stray mark. */}
      {sent && !item.missing && !collapsed && (
        <div
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full pointer-events-none"
          style={{ background: '#5FA968', boxShadow: '0 0 0 1.5px var(--bg)' }}
          title="Sent to Focus"
        />
      )}

      {/* resize handle (not on a collapsed comment pin, not when locked) */}
      {!panMode && !collapsed && !item.locked && (
        <div
          onMouseDown={startResize}
          className="absolute -right-1 -bottom-1 w-3 h-3 rounded-[3px] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background: 'var(--accent)',
            border: '1px solid var(--bg)',
            cursor: 'nwse-resize',
          }}
        />
      )}

      {/* link handle — drag to connect to another item. Filled accent dot with a
          ring at the top edge, distinct from the resize square. Not on comments. */}
      {!panMode && !collapsed && !item.locked && !isComment && (
        <div
          onMouseDown={startLink}
          title="Drag to connect"
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          style={{ background: 'var(--accent)', border: '2px solid var(--bg)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
        />
      )}
    </div>
  )
}

// Memoised: during a drag the parent re-renders every frame as items move, but
// only the items whose `item` ref actually changed need to re-render. This keeps
// multi-select drag smooth on a busy board.
export default memo(CanvasItem)

function MissingItem({ item }) {
  return (
    <div className="w-full h-full grid place-items-center bg-surface text-center p-3 relative overflow-hidden">
      {/* cached poster frame (videos) — dimmed so the missing card still reads */}
      {item.poster && (
        <img
          src={item.poster}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none select-none"
        />
      )}
      <div className="relative">
        <ImageBroken size={22} className="text-ink-3 mx-auto mb-1.5" />
        <div className="text-[10px] text-ink-3 break-all leading-tight max-w-[140px]">
          {item.label || item.path}
        </div>
      </div>
    </div>
  )
}


// Comment colours — the one place colour is allowed, for annotation clarity.
// First swatch is a neutral slate (the old warm cream washed out on a white
// card); the rest stay saturated so pinned annotations pop on the light board.
const COMMENT_COLORS = ['#8A8F98', '#D85C53', '#D89A4E', '#5FA968', '#5B8BC4', '#9B7BC4']

// Note tints — soft, paper-like sticky colours. First is plain paper (white);
// the rest are pale washes that keep ink fully legible on top.
const NOTE_COLORS = ['#ffffff', '#FEF3C7', '#FDE2E4', '#DCF3E4', '#DBEAFE', '#EDE4FB']

// Annotation comment. Collapsed → a small coloured pin (click expands it,
// handled in startDrag). Expanded → a card showing the text + a colour row;
// double-click to edit, the corner button minimises it. Typing then clicking
// away auto-minimises it; clicking anywhere outside an expanded comment also
// closes it back to a pin (and drops it if it was left empty).
function CommentItem({ item, collapsed, editing, setEditing, updateItem }) {
  const deleteItem = useCanvasStore((s) => s.deleteItem)
  const rootRef = useRef(null)
  const color = item.color || COMMENT_COLORS[0]

  // Close on outside click. Runs only while expanded. Capture phase so it
  // settles the comment before the click reaches the canvas/another item.
  useEffect(() => {
    if (collapsed) return
    const onDown = (e) => {
      // Ignore clicks anywhere on this item's wrapper — including the resize
      // handle, which sits just outside the comment's own box.
      const wrapper = rootRef.current?.closest('[role="group"]')
      if (wrapper?.contains(e.target)) return
      const ta = rootRef.current?.querySelector('textarea')
      const v = (ta ? ta.value : item.content || '').trim()
      if (v) updateItem(item.id, { content: v, collapsed: true })
      else deleteItem(item.id) // an empty annotation is just clutter — drop it
      setEditing(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [collapsed, item.id, item.content, updateItem, deleteItem, setEditing])

  if (collapsed) {
    return (
      <div
        className="w-full h-full grid place-items-center"
        style={{ background: color, color: '#0a0a0a' }}
        title={item.content || 'Comment'}
      >
        <ChatCircle size={16} weight="fill" />
      </div>
    )
  }
  const isEditing = editing || !item.content
  return (
    <div
      ref={rootRef}
      className="w-full h-full bg-surface-2 relative flex flex-col"
      style={{ borderLeft: `3px solid ${color}` }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
    >
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setEditing(false)
          updateItem(item.id, { collapsed: true })
        }}
        title="Minimise"
        aria-label="Minimise comment"
        className="absolute top-1 right-1 z-10 grid place-items-center w-5 h-5 rounded text-ink-3 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors"
      >
        <Minus size={12} />
      </button>

      <div className="flex-1 min-h-0 p-2.5 pl-3">
        {isEditing ? (
          <textarea
            autoFocus
            defaultValue={item.content}
            placeholder="Comment…"
            // Only swallow the drag once the user is explicitly editing (after a
            // double-click). On a freshly-added comment the textarea is shown but
            // not "editing", so the body stays draggable — a click still focuses
            // it to type, a drag moves the comment.
            onMouseDown={(e) => editing && e.stopPropagation()}
            onBlur={(e) => {
              const v = e.target.value.trim()
              // Minimise to a pin once there's a comment (the annotation flow).
              updateItem(item.id, { content: v, collapsed: v ? true : item.collapsed })
              setEditing(false)
            }}
            className="w-full h-full resize-none bg-transparent text-[12px] leading-[1.55] text-ink pr-4 placeholder:text-ink-3"
          />
        ) : (
          <div className="w-full h-full overflow-hidden text-[12px] leading-[1.55] text-ink whitespace-pre-wrap pr-4">
            {item.content}
          </div>
        )}
      </div>

      {/* colour row */}
      <div
        className="shrink-0 flex items-center gap-1.5 px-3 pb-1.5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {COMMENT_COLORS.map((c) => (
          <button
            key={c}
            onClick={(e) => {
              e.stopPropagation()
              updateItem(item.id, { color: c })
            }}
            title="Comment colour"
            aria-label="Set comment colour"
            className="w-3 h-3 rounded-full transition-transform hover:scale-110"
            style={{
              background: c,
              boxShadow: c === color ? '0 0 0 1.5px var(--ink), 0 0 0 3px var(--surface-2)' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function NoteItem({ item, editing, setEditing, updateItem }) {
  const tint = item.color || NOTE_COLORS[0]
  return (
    <div
      className="w-full h-full relative"
      style={{ background: tint }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
    >
      {/* Note colours are a fixed paper palette, deliberately independent of the
          app theme (a sticky note stays the same colour under any light) — so
          its text must stay fixed dark ink too, never the theme's `--ink`
          token, which goes near-white in dark mode and would wash out to
          nothing against these light pastels. */}
      <div className="w-full h-full p-3">
        {editing ? (
          <textarea
            autoFocus
            defaultValue={item.content}
            onBlur={(e) => {
              updateItem(item.id, { content: e.target.value })
              setEditing(false)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full h-full resize-none bg-transparent text-[13px] leading-[1.6] text-[#0a0a0a]"
          />
        ) : (
          <div className="w-full h-full overflow-hidden text-[13px] leading-[1.6] text-[#0a0a0a] whitespace-pre-wrap">
            {item.content || (
              <span className="font-light text-[rgba(10,10,10,0.4)]">Double-click to write…</span>
            )}
          </div>
        )}
      </div>

      {/* Colour palette — a floating pill at the bottom, shown on hover so a
          resting note stays clean. Click a tint to recolour the note. */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150"
        style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          border: '0.5px solid var(--border)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            onClick={(e) => {
              e.stopPropagation()
              updateItem(item.id, { color: c })
            }}
            title="Note colour"
            aria-label="Set note colour"
            className="w-3.5 h-3.5 rounded-full transition-transform hover:scale-110"
            style={{
              background: c,
              border: '0.5px solid var(--border-2)',
              boxShadow: c === tint ? '0 0 0 1.5px var(--ink), 0 0 0 3px #ffffff' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  )
}
