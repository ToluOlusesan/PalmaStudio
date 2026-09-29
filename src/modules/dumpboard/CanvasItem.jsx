import { memo, useState, useEffect, useRef } from 'react'
import { ImageBroken, ChatCircle, Minus, Lock, Target, Check, LinkSimple } from '@phosphor-icons/react'
import { useCanvasStore } from '../../store/canvasStore.js'
import { useFocusStore } from '../../store/focusStore.js'
import { snapToGrid, loadImageSize } from '../../utils/canvasUtils.js'
import { isGifItem } from '../../utils/pathUtils.js'
import { hasCrop, resolveCrop, clampCrop, scaleCrop, cropStyle } from '../../utils/cropGeometry.js'
import { openExternalUrl, toAssetUrl } from '../../utils/platform.js'
import Badge from '../../components/Badge.jsx'
import CanvasVideo from './CanvasVideo.jsx'
import CanvasGif from './CanvasGif.jsx'

const TIDY_EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
const PIN = 30 // collapsed-comment pin size
const MIN_W = 60
const MIN_H = 48

// Handle placement. Each sits half in / half out of the card edge so it can be
// grabbed from either side of the boundary.
const CORNERS = [
  { dir: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
  { dir: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
  { dir: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
  { dir: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
]
const SIDES = [
  { dir: 'w', left: '0%', top: '50%' },
  { dir: 'e', left: '100%', top: '50%' },
]

// A single absolutely-positioned canvas item (image / video / note / comment).
// Drag moves it (screen delta ÷ zoom); the corner and side handles resize it,
// each pinning the side opposite itself. While the
// canvas is in pan mode the item yields so the canvas can pan. `animating`
// turns on the 300ms positional transition used by Tidy / Breathe. A collapsed
// comment renders as a small pin and expands on click.
//
// Resizing media follows Figma's split: a plain corner drag SCALES (aspect
// locked — the picture never distorts), Ctrl/⌘-drag CROPS (the frame changes
// around a picture that stays put), and Shift-drag is the old free resize for
// when you really do want to squash something. Ctrl-dragging the picture itself
// slides it inside its crop. See utils/cropGeometry.js for the model.
function CanvasItem({ item, zoom = 1, selected, panMode, animating, onContextMenu, onOpenMedia }) {
  const updateItem = useCanvasStore((s) => s.updateItem)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const select = useCanvasStore((s) => s.select)

  // Whether this item has been promoted to Focus (shows a corner dot), and a
  // transient flag that plays the rainbow-rim sweep when it's sent.
  const sent = useFocusStore((s) => s.queue.some((q) => q.sourceItemId === item.id))
  const stamping = useFocusStore((s) => s.stampingId === item.id)

  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)
  const [sizing, setSizing] = useState(null) // 'scale' | 'crop' | 'free' — live badge
  const rootRef = useRef(null)

  const isMedia = item.type === 'image' || item.type === 'video'
  const isGif = isGifItem(item)

  // Earlier video captures stored a full PNG on disk but pointed their cards
  // at a 640px JPEG preview. Upgrade those existing cards to their saved PNG
  // after confirming it still loads; the item then persists the sharper src.
  useEffect(() => {
    if (item.type !== 'image' || !item.src?.startsWith('data:image/jpeg;') ||
        !/[\\/]assets[\\/]frames[\\/].+\.png$/i.test(item.path || '')) return
    let cancelled = false
    toAssetUrl(item.path).then(async (src) => {
      if (!src || !(await loadImageSize(src)) || cancelled) return
      updateItem(item.id, { src })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [item.id, item.path, item.src, item.type, updateItem])

  // Intrinsic pixel size of whatever is painted in this card — read straight off
  // the live element, so nothing extra has to be stored on the item. Returns
  // null until the media has actually decoded: a crop derived from a guessed
  // aspect ratio would lock the picture into that wrong shape permanently (the
  // drawn size is what gets persisted), so the crop gestures sit out until the
  // real dimensions are known rather than working from a placeholder.
  const naturalSize = () => {
    const el = rootRef.current?.querySelector('img, canvas, video')
    const w = el?.naturalWidth || el?.videoWidth || el?.width || 0
    const h = el?.naturalHeight || el?.videoHeight || el?.height || 0
    return w > 0 && h > 0 ? { w, h } : null
  }

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

    // Ctrl/⌘-drag on media slides the picture inside its frame instead of
    // moving the card — the other half of Figma's crop gesture, and the only
    // way to choose WHICH part of a cropped image you keep. Falls through to a
    // normal move while the picture is still loading (see naturalSize).
    const natForPan = isMedia && (e.ctrlKey || e.metaKey) ? naturalSize() : null
    if (natForPan) return startCropPan(e, natForPan)

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

  // Ctrl/⌘-drag on the picture: slide it inside its frame. Materialises a crop
  // from the current cover fit on first use, so an image that has never been
  // cropped starts exactly where it looks like it is.
  const startCropPan = (e, nat) => {
    e.stopPropagation()
    e.preventDefault()
    const { zoom } = useCanvasStore.getState()
    const startCrop = resolveCrop(item, nat.w, nat.h)
    setSizing('crop')
    let pushed = false
    const move = (ev) => {
      if (!pushed) {
        pushed = true
        useCanvasStore.getState().pushHistory()
      }
      const dx = (ev.clientX - e.clientX) / zoom
      const dy = (ev.clientY - e.clientY) / zoom
      updateItem(item.id, {
        crop: clampCrop({ ...startCrop, x: startCrop.x + dx, y: startCrop.y + dy }, item.width, item.height),
      })
    }
    const up = () => {
      setSizing(null)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Resize from any handle. `dir` names the edges the handle owns — 'se', 'w',
  // 'ne' and so on — and the side OPPOSITE it stays pinned, so dragging the left
  // handle grows the card leftwards instead of shuffling the whole thing right.
  // (A lone bottom-right handle could only ever anchor the top-left corner,
  // which is why sizing something against a neighbour used to take two moves:
  // resize, then drag back.)
  //
  // Which of the three resizes you get is decided at mousedown and held for the
  // whole drag, so the card can't change behaviour under your hand halfway:
  //   plain  → scale, aspect locked (media) / free (notes, comments)
  //   Ctrl/⌘ → crop: the frame moves, the picture doesn't
  //   Shift  → free resize, for deliberate squashing
  const startResize = (e, dir) => {
    e.stopPropagation()
    e.preventDefault()
    const store = useCanvasStore.getState()
    const batch = store.selectedIds.length > 1 && store.selectedIds.includes(item.id)
      ? store.items.filter((it) => store.selectedIds.includes(it.id) && !it.locked)
      : []
    if (batch.length > 1) {
      const left = Math.min(...batch.map((it) => it.x))
      const top = Math.min(...batch.map((it) => it.y))
      const right = Math.max(...batch.map((it) => it.x + it.width))
      const bottom = Math.max(...batch.map((it) => it.y + it.height))
      const centerX = (left + right) / 2
      const centerY = (top + bottom) / 2
      const groupWidth = right - left
      const groupHeight = bottom - top
      const minScale = Math.max(...batch.map((it) => Math.max(MIN_W / it.width, MIN_H / it.height)))
      const { zoom } = store
      const startX = e.clientX
      const startY = e.clientY
      const west = dir.includes('w')
      const east = dir.includes('e')
      const north = dir.includes('n')
      const south = dir.includes('s')
      const anchorX = west ? right : east ? left : centerX
      const anchorY = north ? bottom : south ? top : centerY
      setSizing('scale')
      let pushed = false
      const move = (ev) => {
        if (!pushed) {
          pushed = true
          useCanvasStore.getState().pushHistory()
        }
        const rawX = (ev.clientX - startX) / zoom
        const rawY = (ev.clientY - startY) / zoom
        const dx = east ? rawX : west ? -rawX : 0
        const dy = south ? rawY : north ? -rawY : 0
        const scaleDelta = west || east
          ? north || south
            ? (dx * groupWidth + dy * groupHeight) / (groupWidth ** 2 + groupHeight ** 2)
            : dx / groupWidth
          : dy / groupHeight
        const k = Math.max(minScale, 1 + scaleDelta)
        useCanvasStore.getState().updateItems(batch.map((it) => ({
          id: it.id,
          x: Math.round(anchorX + (it.x - anchorX) * k),
          y: Math.round(anchorY + (it.y - anchorY) * k),
          width: Math.max(MIN_W, Math.round(it.width * k)),
          height: Math.max(MIN_H, Math.round(it.height * k)),
          ...(hasCrop(it) ? { crop: scaleCrop(it.crop, k) } : {}),
        })))
      }
      const up = () => {
        setSizing(null)
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
      return
    }
    bringToFront(item.id)
    const { zoom } = useCanvasStore.getState()
    const nat = isMedia ? naturalSize() : null
    const crop = nat ? resolveCrop(item, nat.w, nat.h) : null
    // Crop needs the picture's real dimensions; without them (still decoding)
    // it degrades to a scale, which needs nothing but the frame.
    const mode = crop && (e.ctrlKey || e.metaKey) ? 'crop' : !isMedia || e.shiftKey ? 'free' : 'scale'
    const N = dir.includes('n')
    const S = dir.includes('s')
    const W = dir.includes('w')
    const E = dir.includes('e')
    const start = {
      x: e.clientX,
      y: e.clientY,
      w: item.width,
      h: item.height,
      itemX: item.x,
      itemY: item.y,
      zoom,
      crop,
    }
    setSizing(mode)
    let pushed = false

    // Place a freshly-sized frame so the handle's opposite side doesn't move.
    // On the axis a side handle doesn't drive, the frame grows about its centre
    // — the only choice that doesn't make an edge drag creep the card sideways.
    const anchored = (w, h) => ({
      x: Math.round(W ? start.itemX + (start.w - w) : E ? start.itemX : start.itemX + (start.w - w) / 2),
      y: Math.round(N ? start.itemY + (start.h - h) : S ? start.itemY : start.itemY + (start.h - h) / 2),
    })

    const move = (ev) => {
      if (!pushed) {
        pushed = true
        useCanvasStore.getState().pushHistory() // one undo entry for the resize
      }
      // Outward-positive deltas: dragging the west handle left grows the card,
      // which is a NEGATIVE clientX delta — so each side flips its own sign and
      // the rest of the maths stays direction-agnostic.
      const rawX = (ev.clientX - start.x) / start.zoom
      const rawY = (ev.clientY - start.y) / start.zoom
      const dx = E ? rawX : W ? -rawX : 0
      const dy = S ? rawY : N ? -rawY : 0

      if (mode === 'scale') {
        // Project the drag onto whatever the handle drives — the frame diagonal
        // for a corner, the single axis for a side — so the handle tracks the
        // cursor while width and height stay locked to each other.
        const k = Math.max(
          MIN_W / start.w,
          MIN_H / start.h,
          E || W
            ? N || S
              ? 1 + (dx * start.w + dy * start.h) / (start.w * start.w + start.h * start.h)
              : 1 + dx / start.w
            : 1 + dy / start.h
        )
        const width = Math.round(start.w * k)
        const height = Math.round(start.h * k)
        updateItem(item.id, {
          width,
          height,
          ...anchored(width, height),
          ...(hasCrop(item) ? { crop: scaleCrop(start.crop, k) } : {}),
        })
        return
      }

      // Crop: the frame closes into the picture (never past it — there'd be
      // nothing to show), and the picture itself is left at exactly its size.
      // Because the frame's origin can move, the crop offset has to move by the
      // same amount in reverse, or the picture would slide along with the frame
      // instead of staying put on the board.
      if (mode === 'crop') {
        const width = Math.round(Math.max(MIN_W, Math.min(start.crop.w, start.w + dx)))
        const height = Math.round(Math.max(MIN_H, Math.min(start.crop.h, start.h + dy)))
        const at = anchored(width, height)
        updateItem(item.id, {
          width,
          height,
          ...at,
          crop: clampCrop(
            {
              ...start.crop,
              x: start.crop.x - (at.x - start.itemX),
              y: start.crop.y - (at.y - start.itemY),
            },
            width,
            height
          ),
        })
        return
      }

      const width = Math.max(MIN_W, Math.round(start.w + dx))
      const height = Math.max(MIN_H, Math.round(start.h + dy))
      updateItem(item.id, {
        width,
        height,
        ...anchored(width, height),
        ...(hasCrop(item) ? { crop: clampCrop(start.crop, width, height) } : {}),
      })
    }
    const up = () => {
      setSizing(null)
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

  // How the picture is painted: cover-fit until the card has been cropped, then
  // absolutely placed at exactly the drawn size the crop records.
  const mediaClassName = hasCrop(item)
    ? 'pointer-events-none select-none'
    : 'w-full h-full object-cover pointer-events-none select-none'
  const mediaStyle = hasCrop(item) ? cropStyle(item.crop) : undefined

  const batchSelected = selected && useCanvasStore.getState().selectedIds.length > 1
  const resizeHint = batchSelected
    ? 'Drag to scale selected items together'
    : isMedia
    ? 'Drag to scale · Ctrl-drag to crop · Shift-drag to stretch'
    : 'Drag to resize'

  return (
    <div
      ref={rootRef}
      role="group"
      tabIndex={0}
      onMouseDown={startDrag}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e, item)
      }}
      className={`absolute group outline-none ${stamping ? 'sending-to-focus' : ''}`}
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
        onDoubleClick={(e) => {
          if (item.type !== 'image' || item.missing) return
          e.preventDefault()
          e.stopPropagation()
          onOpenMedia?.(item)
        }}
        className={`card-in w-full h-full overflow-hidden relative bg-surface-2 ${
          selected || dragging ? '' : 'card-rest'
        } ${collapsed ? 'rounded-full' : 'rounded-[6px]'}`}
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
        ) : isGif ? (
          <CanvasGif item={item} mediaClassName={mediaClassName} mediaStyle={mediaStyle} />
        ) : item.type === 'image' ? (
          <img
            src={item.src}
            alt={item.label}
            draggable={false}
            decoding="async"
            className={mediaClassName}
            style={mediaStyle}
          />
        ) : item.type === 'video' ? (
          <CanvasVideo item={item} mediaClassName={mediaClassName} mediaStyle={mediaStyle} />
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
            zoom={zoom}
            editing={editing}
            setEditing={setEditing}
            updateItem={updateItem}
          />
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

      {/* Send to Focus — a frosted pill shown on hover. Images only (Focus is
          image-only; videos are snapshot scaffolding and never promoted). Once
          promoted it reads "Sent". Lives in the OUTER wrapper (a sibling of the
          card, not inside its overflow-hidden box) so it's never clipped into a
          cut-off rectangle on a narrow card — it always renders as a full pill.
          Counter-scaled by --inv-zoom (clamped ≤1) so it stays crisp when zoomed
          in without ballooning when zoomed out. whitespace-nowrap keeps it one
          line. */}
      {item.type === 'image' && !item.missing && !collapsed && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            useFocusStore.getState().sendToFocus(item)
          }}
          title={sent ? 'Sent to Focus' : 'Send to Focus'}
          aria-label={sent ? 'Sent to Focus' : 'Send to Focus'}
          className={`absolute left-1/2 z-10 inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium text-[#0a0a0a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 ${
            isGif ? 'top-1.5' : 'bottom-1.5'
          }`}
          style={{
            background: 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '0.5px solid var(--border)',
            boxShadow: 'var(--shadow-soft)',
            transform: 'translateX(-50%) scale(var(--control-inv-zoom, 1))',
            // A GIF's frame transport owns the bottom of the card, so the pill
            // moves to the top rather than sitting on top of the scrubber.
            transformOrigin: isGif ? 'top center' : 'bottom center',
          }}
        >
          {sent ? <Check size={13} weight="bold" /> : <Target size={13} />}
          {sent ? 'Sent to Focus' : 'Send to Focus'}
        </button>
      )}

      {/* Link previews retain a quiet way back to the original post without
          turning the board into a feed. It is visible on hover/selection only. */}
      {item.sourceUrl && !item.missing && !collapsed && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            openExternalUrl(item.sourceUrl)
          }}
          title="Open original link"
          aria-label="Open original link"
          className="absolute top-1.5 left-1.5 z-10 grid place-items-center w-6 h-6 rounded-full text-[#0a0a0a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150"
          style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '0.5px solid var(--border)', boxShadow: 'var(--shadow-soft)', transform: 'scale(var(--control-inv-zoom, 1))', transformOrigin: 'top left' }}
        >
          <LinkSimple size={13} weight="bold" />
        </button>
      )}

      {/* Sent-to-Focus marker — a small green dot in the top-right corner. Green
          (not ink) so it reads as an active "promoted" state, not a stray mark. */}
      {sent && !item.missing && !collapsed && (
        <div
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full pointer-events-none"
          style={{ background: '#5FA968', boxShadow: '0 0 0 1.5px var(--bg)' }}
          title="Sent to Focus"
        />
      )}

      {/* Resize handles (not on a collapsed comment pin, not when locked).
          Four corners plus a bar on each side: the side handles are what let you
          size a card against whatever sits next to it, since each handle pins the
          opposite side. Top and bottom centre are deliberately left free — the
          connector dot lives at one and the Send-to-Focus pill at the other, and
          both edges are still reachable from the corners. */}
      {!panMode && !collapsed && !item.locked && (
        <>
          {CORNERS.map(({ dir, left, top, cursor }) => (
            <div
              key={dir}
              onMouseDown={(e) => startResize(e, dir)}
              title={resizeHint}
              className={`absolute z-20 w-6 h-6 grid place-items-center transition-opacity ${selected ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'}`}
              style={{ left, top, transform: 'scale(var(--control-inv-zoom, 1)) translate(-50%, -50%)', transformOrigin: 'top left', cursor }}
            >
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: 'var(--accent)', border: '1px solid var(--bg)', boxShadow: '0 1px 3px rgba(0,0,0,0.22)' }} />
            </div>
          ))}
          {SIDES.map(({ dir, left, top }) => (
            <div
              key={dir}
              onMouseDown={(e) => startResize(e, dir)}
              title={resizeHint}
              className={`absolute z-20 w-6 h-7 grid place-items-center transition-opacity ${selected ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'}`}
              style={{ left, top, transform: 'scale(var(--control-inv-zoom, 1)) translate(-50%, -50%)', transformOrigin: 'top left', cursor: 'ew-resize' }}
            >
              <span className="w-1.5 h-4 rounded-full" style={{ background: 'var(--accent)', border: '1px solid var(--bg)', boxShadow: '0 1px 3px rgba(0,0,0,0.22)' }} />
            </div>
          ))}
        </>
      )}

      {/* Which resize you're getting, named while you do it — the three
          gestures are only discoverable if the card says which one it heard.
          Counter-scaled like the rest of the on-card chrome. */}
      {sizing && (
        <div
          className="absolute -top-1 left-1/2 px-1.5 py-[2px] rounded text-[10px] font-medium pointer-events-none whitespace-nowrap"
          style={{
            background: 'rgba(10,10,10,0.78)',
            color: '#f5f5f5',
            transform: 'translate(-50%, -100%) scale(var(--inv-zoom, 1))',
            transformOrigin: 'bottom center',
          }}
        >
          {sizing === 'crop'
            ? `Crop · ${Math.round(item.width)} × ${Math.round(item.height)}`
            : sizing === 'scale'
              ? `Scale · ${Math.round(item.width)} × ${Math.round(item.height)}`
              : `Stretch · ${Math.round(item.width)} × ${Math.round(item.height)}`}
        </div>
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

function NoteItem({ item, zoom = 1, editing, setEditing, updateItem }) {
  const tint = item.color || NOTE_COLORS[0]
  // Keep note text at a modest readable size on screen when the board is zoomed
  // out. The card itself stays at its intended canvas size and position.
  const noteFontSize = Math.max(13, 8 / Math.max(0.1, zoom))
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
        {/* data-wheel-scroll lets the canvas wheel handler yield to this element
            so a long note scrolls on wheel instead of panning/zooming the board. */}
        {editing ? (
          <textarea
            autoFocus
            defaultValue={item.content}
            data-wheel-scroll
            onBlur={(e) => {
              updateItem(item.id, { content: e.target.value })
              setEditing(false)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ fontSize: noteFontSize }}
            className="w-full h-full resize-none overflow-y-auto bg-transparent text-[13px] leading-[1.6] text-[#0a0a0a]"
          />
        ) : (
          <div
            data-wheel-scroll
            style={{ fontSize: noteFontSize }}
            className="w-full h-full overflow-y-auto text-[13px] leading-[1.6] text-[#0a0a0a] whitespace-pre-wrap"
          >
            {item.content || (
              <span className="font-light text-[rgba(10,10,10,0.4)]">Double-click to write…</span>
            )}
          </div>
        )}
      </div>

      {/* Colour palette — a floating pill at the bottom, shown on hover so a
          resting note stays clean. Click a tint to recolour the note. */}
      {/* Dark frosted pill (not white) so the pale paper swatches read with clear
          contrast against it, and counter-scaled by --inv-zoom so it stays crisp
          and constant-size at any board zoom. */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute bottom-1.5 left-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150"
        style={{
          background: 'rgba(24,24,27,0.82)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          border: '0.5px solid rgba(255,255,255,0.16)',
          boxShadow: 'var(--shadow-soft)',
          transform: 'translateX(-50%) scale(var(--inv-zoom, 1))',
          transformOrigin: 'bottom center',
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
              border: '0.5px solid rgba(0,0,0,0.15)',
              boxShadow: c === tint ? '0 0 0 1.5px #ffffff, 0 0 0 3px rgba(24,24,27,0.9)' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  )
}
