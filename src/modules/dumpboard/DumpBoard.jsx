import { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Minus, Plus, ArrowsIn, ArrowLineUp, ArrowLineDown, Copy, Clipboard, ArrowCounterClockwise, Trash, FolderOpen, LinkSimple, Export, ArrowRight, ArrowsLeftRight, SelectionPlus, SelectionSlash, AlignLeft, AlignRight, AlignTop, AlignBottom, AlignCenterHorizontal, AlignCenterVertical, Rows, Columns, Lock, LockOpen, TextT, Target } from '@phosphor-icons/react'
import { useCanvasStore } from '../../store/canvasStore.js'
import { useFocusStore } from '../../store/focusStore.js'
import { useProjectStore } from '../../store/projectStore.js'
import { useSessionStore } from '../../store/sessionStore.js'
import { useCanvas } from '../../hooks/useCanvas.js'
import { useDrop } from '../../hooks/useDrop.js'
import { useTauriDrop } from '../../hooks/useTauriDrop.js'
import { snapToGrid, tidyClusters, captureVideoPoster, loadImageSize, fitImageBox } from '../../utils/canvasUtils.js'
import { kindFromName, isImageType, isVideoType, basename } from '../../utils/pathUtils.js'
import { revealInFolder, pickFile, isDiskPath, toAssetUrl, isElectron, saveDataUrl, copyAsset, saveAsset, desktopPathForFile, persistImage } from '../../utils/platform.js'
import { exportBoardImage, boardToPdfDataUri } from '../../utils/captureBoard.js'
import { setItemClipboard, getItemClipboard, getItemClipboardSignature } from '../../utils/itemClipboard.js'
import { copyItemsToClipboard } from '../../utils/systemClipboard.js'
import { appendBoardItem, landBoardItem } from '../../utils/boardOps.js'
import { uid } from '../../utils/id.js'
import CanvasItem from './CanvasItem.jsx'
import CanvasToolbar, { ToolDock } from './CanvasToolbar.jsx'
import ContextMenu from '../../components/ContextMenu.jsx'

// The Dump Board: an infinite, dot-gridded canvas. The creative inbox — messy
// by design. Pan (space/middle-drag or Pan tool), zoom (wheel), drop files,
// paste screenshots, double-click for a note. Grid Snap is always on; Tidy and
// Breathe are one-shot layout actions with single-level Ctrl/Cmd+Z undo.
// Point where the ray from an item's centre toward (tx,ty) exits the item's box.
// Used so connectors emerge from item edges rather than from hidden centres.
const edgePoint = (it, tx, ty) => {
  const cx = it.x + it.width / 2
  const cy = it.y + it.height / 2
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx !== 0 ? it.width / 2 / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? it.height / 2 / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

// Give a copied set of items fresh groupIds so duplicates/pastes form their own
// independent groups instead of silently merging into the originals.
const remapGroupIds = (arr) => {
  const map = new Map()
  return arr.map((it) => {
    if (!it.groupId) return it
    if (!map.has(it.groupId)) map.set(it.groupId, uid('group'))
    return { ...it, groupId: map.get(it.groupId) }
  })
}

export default function DumpBoard({
  emptyHint = 'Drag images, videos, or paste anything here',
  tools = null,
}) {
  const items = useCanvasStore((s) => s.items)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const tool = useCanvasStore((s) => s.tool)
  const addItem = useCanvasStore((s) => s.addItem)
  const addItems = useCanvasStore((s) => s.addItems)
  const clearSelection = useCanvasStore((s) => s.clearSelection)
  const setSelection = useCanvasStore((s) => s.setSelection)
  const applyPositions = useCanvasStore((s) => s.applyPositions)
  const pushHistory = useCanvasStore((s) => s.pushHistory)
  const undo = useCanvasStore((s) => s.undo)
  const redo = useCanvasStore((s) => s.redo)
  const moveBy = useCanvasStore((s) => s.moveBy)
  const deleteItems = useCanvasStore((s) => s.deleteItems)
  const group = useCanvasStore((s) => s.group)
  const ungroup = useCanvasStore((s) => s.ungroup)
  const removeFromGroup = useCanvasStore((s) => s.removeFromGroup)
  const renameGroup = useCanvasStore((s) => s.renameGroup)
  const alignSelected = useCanvasStore((s) => s.alignSelected)
  const distributeSelected = useCanvasStore((s) => s.distributeSelected)
  const toggleLock = useCanvasStore((s) => s.toggleLock)
  const dropTargetGroupId = useCanvasStore((s) => s.dropTargetGroupId)
  const draggingItems = useCanvasStore((s) => s.draggingItems)
  const edges = useCanvasStore((s) => s.edges)
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId)
  const linking = useCanvasStore((s) => s.linking)
  const selectEdge = useCanvasStore((s) => s.selectEdge)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  const setEdgeLabel = useCanvasStore((s) => s.setEdgeLabel)

  const deleteItem = useCanvasStore((s) => s.deleteItem)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const sendToBack = useCanvasStore((s) => s.sendToBack)
  const updateItem = useCanvasStore((s) => s.updateItem)

  const projects = useProjectStore((s) => s.projects)
  const sessionId = useSessionStore((s) => s.session?.id)

  const { canvasRef, panX, panY, zoom, spaceDown, isPanning, handleMouseDown, zoomTo, resetView } =
    useCanvas()
  const drop = useDrop(canvasRef)
  const tauriDrop = useTauriDrop(canvasRef, drop.toCanvas) // real paths under desktop
  const isDraggingFiles = drop.isDragging || tauriDrop.isDragging

  const [menu, setMenu] = useState(null) // { x, y, item } right-click context menu
  const [marquee, setMarquee] = useState(null) // { x0,y0,x1,y1 } rubber-band (screen coords)
  const [showHelp, setShowHelp] = useState(false) // shortcuts cheat-sheet overlay
  const [picker, setPicker] = useState(null) // { mode:'move'|'copy', items } project picker
  const [exportMenu, setExportMenu] = useState(null) // { x, y } PNG/PDF chooser
  const [toast, setToast] = useState(null) // transient confirmation
  const toastTimer = useRef(null)
  const lastNudge = useRef(0) // coalesces rapid arrow-key nudges into one undo step

  const flashToast = useCallback((msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])
  useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), [])

  const panMode = spaceDown || tool === 'pan'

  // Bounding box + frame colour per group (canvas coords) for the group outline,
  // plus the set of groups that currently have a selected member (drawn brighter).
  const groupBoxes = useMemo(() => {
    const m = new Map()
    for (const it of items) {
      if (!it.groupId) continue
      const g = m.get(it.groupId)
      if (g) {
        g.minX = Math.min(g.minX, it.x)
        g.minY = Math.min(g.minY, it.y)
        g.maxX = Math.max(g.maxX, it.x + it.width)
        g.maxY = Math.max(g.maxY, it.y + it.height)
      } else {
        m.set(it.groupId, {
          minX: it.x,
          minY: it.y,
          maxX: it.x + it.width,
          maxY: it.y + it.height,
          color: it.groupColor,
          name: it.groupName || '',
        })
      }
    }
    return [...m.entries()].map(([id, b]) => ({ id, ...b }))
  }, [items])

  const selectedGroupIds = useMemo(() => {
    const sel = new Set(selectedIds)
    const out = new Set()
    for (const it of items) if (it.groupId && sel.has(it.id)) out.add(it.groupId)
    return out
  }, [items, selectedIds])

  // Bounding box of the current multi-selection (canvas coords), plus the group
  // and lock state the floating toolbar needs. null for 0/1 selected.
  const selection = useMemo(() => {
    const sel = items.filter((it) => selectedIds.includes(it.id))
    if (sel.length < 2) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const it of sel) {
      minX = Math.min(minX, it.x)
      minY = Math.min(minY, it.y)
      maxX = Math.max(maxX, it.x + it.width)
      maxY = Math.max(maxY, it.y + it.height)
    }
    const groupIds = new Set(sel.map((it) => it.groupId).filter(Boolean))
    const grouped = groupIds.size === 1 && sel.every((it) => it.groupId)
    return {
      minX,
      minY,
      maxX,
      maxY,
      count: sel.length,
      grouped,
      groupId: grouped ? [...groupIds][0] : null,
      allLocked: sel.every((it) => it.locked),
    }
  }, [items, selectedIds])

  // Group / connector whose label is being edited inline (screen-space overlay).
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingEdge, setEditingEdge] = useState(null)

  // id → item lookup for resolving connector endpoints.
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  const [animating, setAnimating] = useState(false)
  const animTimer = useRef(null)

  // Apply new positions on the next frame (so the 300ms transition is already
  // active when left/top change), then drop the transition after it settles.
  const animateTo = useCallback(
    (positions) => {
      if (!positions || positions.length === 0) return
      setAnimating(true)
      requestAnimationFrame(() => applyPositions(positions))
      if (animTimer.current) clearTimeout(animTimer.current)
      animTimer.current = setTimeout(() => setAnimating(false), 360)
    },
    [applyPositions]
  )

  const centreOfViewport = useCallback(() => {
    const el = canvasRef.current
    const rect = el?.getBoundingClientRect()
    if (!rect) return { x: 80, y: 80 }
    return drop.toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [canvasRef, drop])

  const addNote = useCallback(
    (at) => {
      const p = at || centreOfViewport()
      addItem({
        type: 'note',
        content: '',
        x: snapToGrid(p.x - 60),
        y: snapToGrid(p.y - 40),
        width: 150,
        height: 118,
      })
    },
    [addItem, centreOfViewport]
  )

  // Annotation comment — starts expanded + empty (so you can type at once), then
  // minimises to a pin once you've written it.
  const addComment = useCallback(
    (at) => {
      const p = at || centreOfViewport()
      addItem({
        type: 'comment',
        content: '',
        collapsed: false,
        x: snapToGrid(p.x - 60),
        y: snapToGrid(p.y - 30),
        width: 200,
        height: 96,
      })
    },
    [addItem, centreOfViewport]
  )

  // Photo / Video toolbar buttons → add media at the viewport centre (snapped).
  // Persist the file so it survives a reload — the same path the drag-drop intake
  // uses: reference the real disk path on desktop, otherwise embed the image as a
  // data URL. Previously these picker uploads used a session-scoped blob: URL, so
  // they came back "missing" after a restart (the bug testers hit).
  const addFiles = useCallback(
    (files) => {
      const p = centreOfViewport()
      // Captured now, before any await below — see landBoardItem.
      const uploadProjectId = useSessionStore.getState().session?.id
      ;[...files].forEach(async (file, i) => {
        const kind = isImageType(file.type)
          ? 'image'
          : isVideoType(file.type)
            ? 'video'
            : kindFromName(file.name)
        if (kind === 'note') return
        const isImg = kind === 'image'

        const diskPath = desktopPathForFile(file)
        let src
        let path
        if (diskPath) {
          src = await toAssetUrl(diskPath)
          path = diskPath
        } else if (isImg) {
          // Web (no disk path): embed as a data URL so it persists in the session.
          const folder = useSessionStore.getState().session?.folder || ''
          const ext = (file.name.split('.').pop() || 'png').toLowerCase()
          const saved = await persistImage(folder, `assets/up_${uid('img')}.${ext}`, file)
          src = saved.src
          path = saved.path
        } else {
          // Web video — no way to persist the bytes; keep the live object URL.
          src = URL.createObjectURL(file)
          path = file.name
        }

        const { liveId } = landBoardItem(uploadProjectId, {
          type: kind,
          src,
          path,
          label: diskPath ? basename(diskPath) : file.name,
          x: snapToGrid(p.x + i * 26),
          y: snapToGrid(p.y + i * 26),
          width: isImg ? 180 : 220,
          height: isImg ? 226 : 140,
          missing: false,
          ...(kind === 'video' ? { pinnedFrames: [], sequences: [] } : {}),
        })
        if (liveId && isImg) {
          loadImageSize(src).then((d) => d && updateItem(liveId, fitImageBox(d.w, d.h)))
        }
        if (liveId && kind === 'video') {
          captureVideoPoster(src).then((poster) => poster && updateItem(liveId, { poster }))
        }
      })
    },
    [updateItem, centreOfViewport]
  )

  // Tidy: pack content into rows that fit the visible width. Snapshot for undo
  // first. Relationships are preserved — items joined by a connector, or sharing
  // a group, move together as one rigid block (keeping their internal layout and
  // arrows intact), comments aren't treated as tiles, and a comment pinned to an
  // image rides along with that image's new spot.
  const handleTidy = useCallback(() => {
    const state = useCanvasStore.getState()
    const cur = state.items
    if (cur.length === 0) return
    pushHistory()
    const width = canvasRef.current?.clientWidth || 1000

    const positions = tidyClusters(cur, state.edges, width, state.zoom)

    // Pinned comments follow their anchor by the same delta it moved.
    const posById = new Map(positions.map((p) => [p.id, p]))
    const byId = new Map(cur.map((it) => [it.id, it]))
    const followers = []
    for (const it of cur) {
      if (it.type !== 'comment' || !it.anchorId) continue
      const np = posById.get(it.anchorId)
      const anchor = byId.get(it.anchorId)
      if (!np || !anchor) continue
      followers.push({ id: it.id, x: it.x + (np.x - anchor.x), y: it.y + (np.y - anchor.y) })
    }
    animateTo([...positions, ...followers])
  }, [animateTo, pushHistory, canvasRef])

  // Paste selected items (from Palma's own clipboard) offset off the originals.
  const pasteInternalOffset = useCallback(() => {
    const clip = getItemClipboard()
    if (!clip.length) return false
    addItems(remapGroupIds(clip).map((it) => ({ ...it, x: snapToGrid(it.x + 24), y: snapToGrid(it.y + 24) })))
    return true
  }, [addItems])

  // Ctrl/⌘+V is the single paste path. It reconciles two clipboards:
  //   • Palma's internal item clipboard (rich — groups, positions, disk refs)
  //   • the real OS clipboard (images, URLs, text from any app)
  // Priority: an OS image always pastes as an image (so external screenshots and
  // copied images just work); otherwise, if the OS text matches the signature of
  // Palma's last copy (or the OS clipboard is empty) we do the rich internal
  // paste; any other external text becomes a URL image or a note.
  useEffect(() => {
    const onPaste = (e) => {
      const t = document.activeElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()

      const rect = canvasRef.current?.getBoundingClientRect()
      const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null

      const hasImage = [...(e.clipboardData?.items || [])].some((it) => it.type.startsWith('image/'))
      if (hasImage) {
        drop.handlePaste(e, center)
        return
      }

      const osText = (e.clipboardData?.getData('text/plain') || '').trim()
      const clip = getItemClipboard()
      const sig = getItemClipboardSignature()

      // Our own copy: OS text mirrors the signature, or the OS clipboard is bare.
      if (clip.length && ((sig && osText === sig) || !osText)) {
        pasteInternalOffset()
        return
      }
      // External text / URL → let the drop handler turn it into an item.
      if (osText) {
        drop.handlePaste(e, center)
        return
      }
      // Nothing external and nothing mirrored — fall back to internal items.
      pasteInternalOffset()
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canvasRef, drop, pasteInternalOffset])

  // Board-wide keyboard: undo/redo, select-all, delete, nudge, deselect.
  // Ignored while typing in a field or note.
  useEffect(() => {
    const ARROWS = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    }
    const onKey = (e) => {
      const t = document.activeElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const sel = useCanvasStore.getState().selectedIds

      if (mod && key === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && key === 'a') {
        e.preventDefault()
        setSelection(useCanvasStore.getState().items.map((it) => it.id))
        return
      }
      // Copy canvas items to Palma's clipboard AND mirror to the OS clipboard so
      // they can be pasted into other apps. Paste itself is handled by the
      // window `paste` event (which can read the real OS clipboard). Let the
      // native copy proceed (no preventDefault) so text in a note still copies.
      if (mod && key === 'c') {
        if (sel.length) {
          const picked = useCanvasStore.getState().items.filter((it) => sel.includes(it.id))
          setItemClipboard(picked)
          copyItemsToClipboard(picked)
        }
        return
      }
      if (mod && key === 'd') {
        if (sel.length) {
          e.preventDefault()
          const cur = useCanvasStore.getState().items
          const picked = cur.filter((it) => sel.includes(it.id))
          addItems(
            remapGroupIds(
              picked.map(({ id, zIndex, ...rest }) => ({
                ...rest,
                x: snapToGrid(rest.x + 24),
                y: snapToGrid(rest.y + 24),
              }))
            )
          )
        }
        return
      }
      // Group / ungroup the selection.
      if (mod && key === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroup(sel)
        else if (sel.length > 1) group(sel)
        return
      }
      // Lock / unlock the selection.
      if (mod && key === 'l') {
        if (sel.length) {
          e.preventDefault()
          toggleLock(sel)
        }
        return
      }
      // Send the selection to the Focus board (queues each item there).
      if (mod && key === 'f') {
        if (sel.length) {
          e.preventDefault()
          const picked = useCanvasStore.getState().items.filter((it) => sel.includes(it.id))
          picked.forEach((it) => useFocusStore.getState().sendToFocus(it))
        }
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp((v) => !v)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const edgeId = useCanvasStore.getState().selectedEdgeId
        if (edgeId) {
          e.preventDefault()
          removeEdge(edgeId)
        } else if (sel.length) {
          e.preventDefault()
          deleteItems(sel)
        }
        return
      }
      if (e.key === 'Escape') {
        if (showHelp) setShowHelp(false)
        else if (useCanvasStore.getState().selectedEdgeId) selectEdge(null)
        else if (sel.length) clearSelection()
        return
      }
      if (ARROWS[e.key] && sel.length) {
        e.preventDefault()
        const [ux, uy] = ARROWS[e.key]
        const step = e.shiftKey ? 1 : 24 // grid cell by default, 1px fine-nudge with Shift
        // Coalesce a burst of nudges into a single undo step.
        const now = Date.now()
        if (now - lastNudge.current > 500) pushHistory()
        lastNudge.current = now
        moveBy(sel, ux * step, uy * step)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, setSelection, deleteItems, clearSelection, moveBy, pushHistory, addItems, group, ungroup, toggleLock, removeEdge, selectEdge, showHelp])

  // Empty-canvas hit test. The inner transformed layer (canvasBg) shifts when
  // panned, exposing the outer canvasRoot — both count as "empty canvas".
  const isCanvasBg = (e) => e.target.dataset.canvasBg || e.target.dataset.canvasRoot

  const onBackgroundMouseDown = (e) => {
    handleMouseDown(e) // pans when space held / Pan tool / middle mouse
    if (panMode || e.button !== 0 || !isCanvasBg(e)) return

    // Finish any in-progress note/comment edit, then suppress the browser's
    // native text selection so dragging doesn't highlight the whole board.
    const active = document.activeElement
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur()
    e.preventDefault()

    // Rubber-band selection. Drag a box on empty canvas to select what it covers.
    clearSelection()
    const x0 = e.clientX
    const y0 = e.clientY
    setMarquee({ x0, y0, x1: x0, y1: y0 })

    const hitsAt = (ev) => {
      const a = drop.toCanvas(Math.min(x0, ev.clientX), Math.min(y0, ev.clientY))
      const b = drop.toCanvas(Math.max(x0, ev.clientX), Math.max(y0, ev.clientY))
      return useCanvasStore
        .getState()
        .items.filter(
          (it) => it.x < b.x && it.x + it.width > a.x && it.y < b.y && it.y + it.height > a.y
        )
        .map((it) => it.id)
    }
    const moved = (ev) => Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 3
    const move = (ev) => {
      setMarquee({ x0, y0, x1: ev.clientX, y1: ev.clientY })
      if (moved(ev)) setSelection(hitsAt(ev)) // live — reflect the covered items
    }
    const up = (ev) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setMarquee(null)
      if (moved(ev)) setSelection(hitsAt(ev))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const onDoubleClick = (e) => {
    if (!isCanvasBg(e)) return
    addNote(drop.toCanvas(e.clientX, e.clientY))
  }

  // Right-click menus. On an item: per-item actions. On empty canvas: add/arrange.
  const DEFAULT_SIZE = {
    image: { width: 180, height: 226 },
    video: { width: 220, height: 140 },
    note: { width: 150, height: 118 },
    comment: { width: 200, height: 96 },
  }
  const duplicate = (item) => {
    const { id, zIndex, groupId, groupColor, ...rest } = item
    addItem({ ...rest, x: snapToGrid(item.x + 24), y: snapToGrid(item.y + 24) })
  }
  // Copy the given items to Palma's cross-board clipboard and mirror them to the
  // OS clipboard (image bytes for a lone image, else text) for pasting elsewhere.
  const copyItems = (its) => {
    if (!its?.length) return
    setItemClipboard(its)
    copyItemsToClipboard(its)
  }
  // Paste the clipboard. With `at` (right-clicked empty canvas) the set is
  // dropped with its top-left at the cursor; otherwise it's nudged off the
  // originals — both forms snapped to the grid and re-grouped independently.
  const pasteItems = (at) => {
    const clip = remapGroupIds(getItemClipboard())
    if (!clip.length) return
    if (at) {
      let minX = Infinity
      let minY = Infinity
      for (const it of clip) {
        minX = Math.min(minX, it.x)
        minY = Math.min(minY, it.y)
      }
      addItems(clip.map((it) => ({ ...it, x: snapToGrid(at.x + (it.x - minX)), y: snapToGrid(at.y + (it.y - minY)) })))
    } else {
      addItems(clip.map((it) => ({ ...it, x: snapToGrid(it.x + 24), y: snapToGrid(it.y + 24) })))
    }
  }
  // Relink a missing (or any) item to a file picked from disk — desktop only.
  const relink = async (item) => {
    const p = await pickFile({
      title: 'Relink file',
      filters: [
        { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'mp4', 'mov', 'webm', 'm4v', 'mkv'] },
      ],
    })
    if (!p) return
    const src = await toAssetUrl(p)
    if (!src) return
    updateItem(item.id, { src, path: p, label: basename(p), missing: false })
  }
  // Export the board (images + notes + expanded comments) as a high-res PNG or
  // PDF via a native Save dialog.
  const exportBoard = async (format = 'png', scale = 2) => {
    const its = useCanvasStore.getState().items
    const eds = useCanvasStore.getState().edges
    if (format === 'pdf') {
      const uri = await boardToPdfDataUri(its, eds, scale)
      if (uri) await saveDataUrl('palma-board.pdf', uri, [{ name: 'PDF', extensions: ['pdf'] }])
    } else {
      const dataUrl = await exportBoardImage(its, eds, scale)
      if (dataUrl) await saveDataUrl('palma-board.png', dataUrl, [{ name: 'PNG Image', extensions: ['png'] }])
    }
  }

  // Export menu shared by the toolbar button and the empty-canvas right-click
  // menu — PNG/PDF at 1× (smaller) or 2× (crisper).
  const exportEntries = () => [
    { label: 'Export PNG · 1×', icon: Export, onClick: () => exportBoard('png', 1) },
    { label: 'Export PNG · 2×', icon: Export, onClick: () => exportBoard('png', 2) },
    { label: 'Export PDF · 1×', icon: Export, onClick: () => exportBoard('pdf', 1) },
    { label: 'Export PDF · 2×', icon: Export, onClick: () => exportBoard('pdf', 2) },
  ]

  // The set a Move/Copy acts on: the whole selection if the right-clicked item is
  // part of a multi-selection, else just that item.
  const menuTargetItems = () => {
    const cur = useCanvasStore.getState().items
    const sel = useCanvasStore.getState().selectedIds
    const ids = menu?.item && sel.includes(menu.item.id) && sel.length > 1 ? sel : [menu?.item?.id]
    return cur.filter((it) => ids.includes(it.id))
  }

  // Move/Copy selected items into another project. The asset file is copied into
  // the target project's assets/ so the destination is self-contained; Move then
  // unlinks the item from this board (the original file is left in place).
  const relocateItems = async (target, mode, toMove) => {
    if (!target || !toMove?.length) return
    for (const it of toMove) {
      const { id, zIndex, ...rest } = it
      let src = it.src
      let path = it.path
      if (isDiskPath(it.path) && target.folder) {
        const newPath = await copyAsset(it.path, target.folder, `assets/${basename(it.path)}`)
        if (newPath) {
          const u = await toAssetUrl(newPath)
          if (u) {
            src = u
            path = newPath
          }
        }
      } else if (typeof it.src === 'string' && it.src.startsWith('data:') && target.folder) {
        const ext = (/^data:image\/([^;]+)/.exec(it.src)?.[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0]
        const saved = await saveAsset(target.folder, `assets/item_${uid('img')}.${ext}`, it.src)
        if (saved) {
          const u = await toAssetUrl(saved)
          if (u) {
            src = u
            path = saved
          }
        }
      }
      const partial = { ...rest, src, path, missing: false }
      if (sessionId === target.id) useCanvasStore.getState().addItem(partial)
      else appendBoardItem(target.id, partial)
    }
    if (mode === 'move') deleteItems(toMove.map((it) => it.id))
    flashToast(`${mode === 'move' ? 'Moved' : 'Copied'} ${toMove.length} to ${target.name}`)
  }

  const otherProjects = projects.filter((p) => p.id !== sessionId && !p.deleted)

  // Stable so memoised CanvasItems don't re-render every drag frame.
  const openItemMenu = useCallback((e, item) => setMenu({ x: e.clientX, y: e.clientY, item }), [])
  const onCanvasContextMenu = (e) => {
    if (!isCanvasBg(e)) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, bgPos: drop.toCanvas(e.clientX, e.clientY) })
  }
  const menuItems = !menu
    ? []
    : menu.item
      ? [
          { label: 'Bring to front', icon: ArrowLineUp, onClick: () => bringToFront(menu.item.id) },
          { label: 'Send to back', icon: ArrowLineDown, onClick: () => sendToBack(menu.item.id) },
          { label: 'Copy', icon: Copy, hint: 'Ctrl C', onClick: () => copyItems(menuTargetItems()) },
          ...(getItemClipboard().length
            ? [{ label: 'Paste', icon: Clipboard, hint: 'Ctrl V', onClick: () => pasteItems() }]
            : []),
          { label: 'Duplicate', icon: Copy, hint: 'Ctrl D', onClick: () => duplicate(menu.item) },
          { label: 'Reset size', icon: ArrowCounterClockwise, onClick: () => updateItem(menu.item.id, DEFAULT_SIZE[menu.item.type] || DEFAULT_SIZE.image) },
          ...(selectedIds.length > 1 && selectedIds.includes(menu.item.id)
            ? [{ label: 'Group selection', icon: SelectionPlus, hint: 'Ctrl G', onClick: () => group(useCanvasStore.getState().selectedIds) }]
            : []),
          ...(menu.item.groupId
            ? [
                { label: 'Rename group', icon: TextT, onClick: () => setEditingGroup(menu.item.groupId) },
                { label: 'Remove from group', icon: Minus, onClick: () => removeFromGroup(menu.item.id) },
                { label: 'Ungroup', icon: SelectionSlash, hint: 'Ctrl ⇧ G', onClick: () => ungroup([menu.item.id]) },
              ]
            : []),
          {
            label: menu.item.locked ? 'Unlock' : 'Lock',
            icon: menu.item.locked ? LockOpen : Lock,
            hint: 'Ctrl L',
            onClick: () =>
              toggleLock(
                selectedIds.includes(menu.item.id) && selectedIds.length > 1 ? selectedIds : [menu.item.id]
              ),
          },
          ...(isElectron() && isDiskPath(menu.item.path)
            ? [{ label: 'Reveal in Explorer', icon: FolderOpen, onClick: () => revealInFolder(menu.item.path) }]
            : []),
          ...(isElectron() && (menu.item.type === 'image' || menu.item.type === 'video')
            ? [{ label: 'Relink file…', icon: LinkSimple, onClick: () => relink(menu.item) }]
            : []),
          ...(menu.item.type === 'comment' && menu.item.anchorId
            ? [{ label: 'Unpin from image', onClick: () => updateItem(menu.item.id, { anchorId: null }) }]
            : []),
          ...(isElectron() && otherProjects.length
            ? [
                { separator: true },
                { label: 'Move to project…', icon: ArrowRight, onClick: () => setPicker({ mode: 'move', items: menuTargetItems() }) },
                { label: 'Copy to project…', icon: ArrowsLeftRight, onClick: () => setPicker({ mode: 'copy', items: menuTargetItems() }) },
              ]
            : []),
          { separator: true },
          { label: 'Send to Focus', icon: Target, hint: 'Ctrl F', onClick: () => menuTargetItems().forEach((it) => useFocusStore.getState().sendToFocus(it)) },
          { separator: true },
          { label: 'Delete', icon: Trash, danger: true, hint: 'Del', onClick: () => deleteItem(menu.item.id) },
        ]
      : [
          { label: 'Add note', onClick: () => addNote(menu.bgPos) },
          { label: 'Add comment', onClick: () => addComment(menu.bgPos) },
          ...(getItemClipboard().length
            ? [{ label: 'Paste', icon: Clipboard, hint: 'Ctrl V', onClick: () => pasteItems(menu.bgPos) }]
            : []),
          { separator: true },
          { label: 'Tidy', onClick: handleTidy },
          ...(items.length ? [{ separator: true }, ...exportEntries()] : []),
        ]

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <CanvasToolbar
        count={items.length}
        onExport={(e) => items.length && setExportMenu({ x: e.clientX, y: e.clientY })}
      />

      <div
        ref={canvasRef}
        data-canvas-root="1"
        onMouseDown={onBackgroundMouseDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onCanvasContextMenu}
        onDragEnter={drop.handleDragEnter}
        onDragOver={drop.handleDragOver}
        onDragLeave={drop.handleDragLeave}
        onDrop={drop.handleDrop}
        className="canvas-grain relative flex-1 overflow-hidden"
        style={{
          backgroundColor: 'var(--bg)',
          backgroundImage:
            'radial-gradient(circle, var(--grid-dot) 1px, transparent 1px)',
          // Rounded to a whole pixel: a fractional tile size (e.g. 22×0.92 =
          // 20.24px) repeated across a wide canvas accumulates sub-pixel
          // rounding error tile-to-tile, which can show up as a visible seam
          // partway across — worse under non-100% OS display scaling.
          backgroundSize: `${Math.round(22 * zoom)}px ${Math.round(22 * zoom)}px`,
          // Modulo keeps the offset inside one tile so the world-anchored dots
          // track pan/zoom without drifting to huge pixel values.
          backgroundPosition: `${panX % Math.round(22 * zoom)}px ${panY % Math.round(22 * zoom)}px`,
          cursor: panMode ? (isPanning ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {/* Connectors — screen-space SVG (crisp at any zoom), painted behind the
            items layer. Lines run edge-to-edge; click to select, double-click to
            label. The dashed line is the in-progress drag from a link handle. */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-[1]">
          <defs>
            <marker id="palma-arrow" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(10,10,10,0.45)" />
            </marker>
            <marker id="palma-arrow-sel" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--accent)" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = itemById.get(e.from)
            const b = itemById.get(e.to)
            if (!a || !b) return null
            const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
            const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
            const p1 = edgePoint(a, bc.x, bc.y)
            const p2 = edgePoint(b, ac.x, ac.y)
            const x1 = panX + p1.x * zoom
            const y1 = panY + p1.y * zoom
            const x2 = panX + p2.x * zoom
            const y2 = panY + p2.y * zoom
            const sel = selectedEdgeId === e.id
            return (
              <g key={e.id}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="transparent" strokeWidth={16}
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onMouseDown={(ev) => { ev.stopPropagation(); selectEdge(e.id) }}
                  onDoubleClick={(ev) => { ev.stopPropagation(); setEditingEdge(e.id) }}
                />
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={sel ? 'var(--accent)' : 'rgba(10,10,10,0.4)'}
                  strokeWidth={sel ? 2.5 : 1.5}
                  markerEnd={`url(#${sel ? 'palma-arrow-sel' : 'palma-arrow'})`}
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            )
          })}
          {linking &&
            (() => {
              const a = itemById.get(linking.fromId)
              if (!a) return null
              const p1 = edgePoint(a, linking.x, linking.y)
              return (
                <line
                  x1={panX + p1.x * zoom}
                  y1={panY + p1.y * zoom}
                  x2={panX + linking.x * zoom}
                  y2={panY + linking.y * zoom}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  style={{ pointerEvents: 'none' }}
                />
              )
            })()}
        </svg>

        <div
          data-canvas-bg="1"
          className="absolute top-0 left-0 w-full h-full"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: '0 0',
            // Composited layer: pan/zoom becomes a GPU transform instead of a
            // relayout+repaint of every card each frame.
            willChange: 'transform',
            // Above the paper-grain ::before so cards sit cleanly on the texture.
            zIndex: 1,
          }}
        >
          {/* Group frames — a coloured outline around each group's bounding box.
              Solid/brighter when selected or being targeted by a drop; dashed and
              quiet otherwise. A targeted group also gets a faint colour wash so
              it's clear where a dragged item will land. Sits behind items
              (zIndex 0) and never intercepts pointer events. */}
          {groupBoxes.map((g) => {
            const active = selectedGroupIds.has(g.id)
            const targeted = dropTargetGroupId === g.id
            const color = g.color || 'var(--border-2)'
            return (
              <div
                key={g.id}
                className="absolute pointer-events-none rounded-[10px]"
                style={{
                  left: g.minX - 8,
                  top: g.minY - 8,
                  width: g.maxX - g.minX + 16,
                  height: g.maxY - g.minY + 16,
                  border: `${targeted ? 2 : 1.5}px ${active || targeted ? 'solid' : 'dashed'} ${color}`,
                  background: targeted ? 'rgba(10,10,10,0.05)' : 'transparent',
                  opacity: active || targeted ? 0.95 : 0.6,
                  zIndex: 0,
                }}
              />
            )
          })}

          {items.map((item) => (
            <CanvasItem
              key={item.id}
              item={item}
              selected={selectedIds.includes(item.id)}
              panMode={panMode}
              animating={animating}
              onContextMenu={openItemMenu}
            />
          ))}
        </div>

        {/* Group title chips — screen-space so text stays crisp at any zoom. A
            named group shows its label at the frame's top-left. While a group is
            the active selection the chip is hidden (the floating toolbar owns that
            space and offers Rename), so the two never overlap. Inline edit shows
            whenever this group is being renamed. */}
        <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
          {groupBoxes.map((g) => {
            const editing = editingGroup === g.id
            const showName = g.name && !selectedGroupIds.has(g.id)
            if (!showName && !editing) return null
            const color = g.color || 'var(--border-2)'
            const left = panX + (g.minX - 8) * zoom
            const top = panY + (g.minY - 8) * zoom
            return (
              <div
                key={g.id}
                className="absolute pointer-events-auto"
                style={{ left, top, transform: 'translateY(-100%)' }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {editing ? (
                  <input
                    autoFocus
                    defaultValue={g.name}
                    placeholder="Group name"
                    onBlur={(e) => {
                      renameGroup(g.id, e.target.value)
                      setEditingGroup(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.currentTarget.blur()
                      } else if (e.key === 'Escape') {
                        setEditingGroup(null)
                      }
                    }}
                    className="mb-1 h-6 w-[150px] rounded-md bg-surface-2 border-[0.5px] border-[var(--border-2)] px-2 text-[11px] text-ink outline-none"
                    style={{ boxShadow: `inset 2px 0 0 ${color}` }}
                  />
                ) : (
                  <button
                    onClick={() => setEditingGroup(g.id)}
                    title="Rename group"
                    className="mb-1 flex items-center gap-1.5 h-6 max-w-[200px] rounded-md bg-surface-2 border-[0.5px] border-[var(--border-2)] px-2 text-[11px] leading-none hover:bg-surface-3 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="truncate text-ink">{g.name}</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Connector labels — screen-space chips at each line's midpoint. */}
        <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
          {edges.map((e) => {
            const a = itemById.get(e.from)
            const b = itemById.get(e.to)
            if (!a || !b) return null
            const editing = editingEdge === e.id
            if (!e.label && !editing) return null
            const mx = panX + ((a.x + a.width / 2 + b.x + b.width / 2) / 2) * zoom
            const my = panY + ((a.y + a.height / 2 + b.y + b.height / 2) / 2) * zoom
            return (
              <div
                key={e.id}
                className="absolute pointer-events-auto"
                style={{ left: mx, top: my, transform: 'translate(-50%, -50%)' }}
                onMouseDown={(ev) => ev.stopPropagation()}
              >
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
                      } else if (ev.key === 'Escape') {
                        setEditingEdge(null)
                      }
                    }}
                    className="h-6 w-[130px] rounded-md bg-surface-2 border-[0.5px] border-[var(--border-2)] px-2 text-[11px] text-ink text-center outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setEditingEdge(e.id)}
                    title="Edit label"
                    className="max-w-[160px] truncate px-2 h-5 rounded-full bg-surface-2 border-[0.5px] border-[var(--border-2)] text-[10px] text-ink leading-none hover:bg-surface-3 transition-colors"
                  >
                    {e.label}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Floating selection toolbar — Miro-style. Sits above (or below, near the
            top edge) the multi-selection, in screen space. */}
        {selection &&
          !marquee &&
          !panMode &&
          !draggingItems &&
          !editingGroup &&
          (() => {
            const cx = panX + ((selection.minX + selection.maxX) / 2) * zoom
            const topY = panY + selection.minY * zoom
            const below = topY < 56
            const y = below ? panY + selection.maxY * zoom + 10 : topY - 10
            return (
              <div
                className="absolute z-30"
                style={{ left: cx, top: y, transform: `translate(-50%, ${below ? '0' : '-100%'})` }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="pop-in glass-bar flex items-center gap-0.5 rounded-lg px-1 py-1">
                  <SelBtn icon={AlignLeft} label="Align left" onClick={() => alignSelected('left')} />
                  <SelBtn icon={AlignCenterVertical} label="Align horizontal centres" onClick={() => alignSelected('hcenter')} />
                  <SelBtn icon={AlignRight} label="Align right" onClick={() => alignSelected('right')} />
                  <SelSep />
                  <SelBtn icon={AlignTop} label="Align top" onClick={() => alignSelected('top')} />
                  <SelBtn icon={AlignCenterHorizontal} label="Align vertical centres" onClick={() => alignSelected('vmiddle')} />
                  <SelBtn icon={AlignBottom} label="Align bottom" onClick={() => alignSelected('bottom')} />
                  {selection.count >= 3 && (
                    <>
                      <SelSep />
                      <SelBtn icon={Columns} label="Distribute horizontally" onClick={() => distributeSelected('h')} />
                      <SelBtn icon={Rows} label="Distribute vertically" onClick={() => distributeSelected('v')} />
                    </>
                  )}
                  <SelSep />
                  {selection.grouped ? (
                    <>
                      <SelBtn icon={TextT} label="Rename group" onClick={() => setEditingGroup(selection.groupId)} />
                      <SelBtn icon={SelectionSlash} label="Ungroup" onClick={() => ungroup(selectedIds)} />
                    </>
                  ) : (
                    <SelBtn icon={SelectionPlus} label="Group" onClick={() => group(selectedIds)} />
                  )}
                  <SelBtn
                    icon={selection.allLocked ? LockOpen : Lock}
                    label={selection.allLocked ? 'Unlock' : 'Lock'}
                    onClick={() => toggleLock(selectedIds)}
                  />
                  <SelSep />
                  <SelBtn icon={Trash} label="Delete" danger onClick={() => deleteItems(selectedIds)} />
                </div>
              </div>
            )
          })()}

        {items.length === 0 && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-center">
              <div className="text-[13px] text-ink-3 font-light">{emptyHint}</div>
              <div className="text-[11px] text-ink-3 opacity-60 mt-1.5">
                Double-click for a note · space + drag to pan · scroll to zoom
              </div>
            </div>
          </div>
        )}

        {isDraggingFiles && (
          <div
            className="fade-in absolute inset-3 rounded-[10px] pointer-events-none grid place-items-center"
            style={{ border: '1.5px dashed var(--border-2)', background: 'rgba(10,10,10,0.03)' }}
          >
            <span className="text-[13px] text-ink-2">Drop to add</span>
          </div>
        )}

        {/* Rubber-band selection box. Positioned absolute inside the relative
            canvas container (NOT fixed — framer-motion transforms upstream would
            otherwise reparent a fixed box and misplace it). */}
        {marquee &&
          (() => {
            const rect = canvasRef.current?.getBoundingClientRect()
            if (!rect) return null
            return (
              <div
                className="absolute z-40 pointer-events-none rounded-[2px]"
                style={{
                  left: Math.min(marquee.x0, marquee.x1) - rect.left,
                  top: Math.min(marquee.y0, marquee.y1) - rect.top,
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                  border: '1px solid var(--accent)',
                  background: 'rgba(10,10,10,0.06)',
                }}
              />
            )
          })()}

        {/* Selection count — quiet chip, bottom-left, only for a multi-selection. */}
        {selectedIds.length > 1 && (
          <div className="pop-in glass-bar absolute bottom-5 left-5 z-30 rounded-full px-3 py-1.5 text-[12px] text-ink-2 tabular-nums pointer-events-none">
            {selectedIds.length} selected
          </div>
        )}

        {/* Shortcuts cheat-sheet — press ? to toggle. */}
        <AnimatePresence>
          {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
        </AnimatePresence>

        {/* Move / Copy to project picker. */}
        <AnimatePresence>
          {picker && (
            <ProjectPicker
              mode={picker.mode}
              count={picker.items.length}
              projects={otherProjects}
              onPick={(target) => {
                const sel = picker
                setPicker(null)
                relocateItems(target, sel.mode, sel.items)
              }}
              onClose={() => setPicker(null)}
            />
          )}
        </AnimatePresence>

        {/* Transient confirmation toast (move/copy). */}
        <AnimatePresence>
          {toast && (
            <motion.div
              className="glass-bar absolute top-4 left-1/2 z-[60] rounded-full px-4 py-2 text-[12px] text-ink pointer-events-none"
              initial={{ opacity: 0, y: -8, x: '-50%', scale: 0.96 }}
              animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
              exit={{ opacity: 0, y: -8, x: '-50%', scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drawing tools — floating dock, pinned bottom-centre over the canvas. */}
        <ToolDock
          onAddNote={() => addNote()}
          onAddComment={() => addComment()}
          onAddFiles={addFiles}
          onTidy={handleTidy}
          extra={tools}
        />

        {/* Zoom control — vertical stack, pinned bottom-right, always visible.
            The reliable way to zoom the board (trackpad pinch isn't forwarded by
            the desktop WebView). Click the percentage to snap back to 100% and
            re-centre. */}
        <ZoomControl
          zoom={zoom}
          onIn={() => zoomTo(zoom + 0.2)}
          onOut={() => zoomTo(zoom - 0.2)}
          onReset={resetView}
        />
      </div>

      <AnimatePresence>
        {exportMenu && (
          <ContextMenu
            key="export-menu"
            x={exportMenu.x}
            y={exportMenu.y}
            items={exportEntries()}
            onClose={() => setExportMenu(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menu && (
          <ContextMenu key="item-menu" x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// Shortcuts cheat-sheet — a quiet centred card. Toggled with `?`, closes on
// Esc or a click on the backdrop.
const SHORTCUTS = [
  ['Select / add to selection', 'Click · Shift-click'],
  ['Marquee select', 'Drag on empty canvas'],
  ['Select all', 'Ctrl A'],
  ['Copy · Paste · Duplicate', 'Ctrl C · V · D'],
  ['Paste image / text / URL from clipboard', 'Ctrl V'],
  ['Group · Ungroup', 'Ctrl G · Ctrl Shift G'],
  ['Lock · Unlock', 'Ctrl L'],
  ['Send to Focus', 'Ctrl F'],
  ['Connect items', 'Drag the top link dot'],
  ['Delete selection', 'Del · Backspace'],
  ['Nudge (fine with Shift)', 'Arrow keys'],
  ['Undo · Redo', 'Ctrl Z · Ctrl Shift Z'],
  ['Pan', 'Space-drag · middle-drag'],
  ['Zoom', 'Ctrl-scroll · pinch · +/−'],
  ['Add note', 'Double-click'],
  ['Deselect', 'Esc'],
  ['This cheat-sheet', '?'],
]
function ShortcutsHelp({ onClose }) {
  return (
    <motion.div
      className="absolute inset-0 z-50 grid place-items-center"
      style={{ background: 'rgba(10,10,10,0.5)' }}
      onMouseDown={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.div
        className="glass-bar w-[380px] max-w-[90%] rounded-[12px] p-5"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-serif text-[16px] text-ink">Keyboard shortcuts</span>
          <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink transition-colors">
            <Plus size={16} className="rotate-45" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {SHORTCUTS.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <span className="text-[12px] text-ink-2">{label}</span>
              <span className="text-[11px] font-mono text-ink-3 text-right">{keys}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// Move/Copy-to-project picker — a centred list of the other projects.
function ProjectPicker({ mode, count, projects, onPick, onClose }) {
  return (
    <motion.div
      className="absolute inset-0 z-[60] grid place-items-center"
      style={{ background: 'rgba(10,10,10,0.5)' }}
      onMouseDown={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.div
        className="glass-bar w-[300px] max-w-[90%] rounded-[12px] p-4"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="font-serif text-[15px] text-ink mb-1">
          {mode === 'move' ? 'Move' : 'Copy'} {count} {count === 1 ? 'item' : 'items'}
        </div>
        <div className="text-[11px] text-ink-3 mb-3">Choose a destination project</div>
        <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto -mx-1">
          {projects.length === 0 ? (
            <div className="text-[12px] text-ink-3 px-1 py-2">No other projects yet.</div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md text-left hover:bg-[var(--sand-hover)] transition-colors"
              >
                <span
                  className="w-3.5 h-3.5 rounded-[3px] shrink-0"
                  style={{ background: p.palette?.[0] || 'var(--surface-3)', border: '0.5px solid var(--border-2)' }}
                />
                <span className="text-[13px] text-ink truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// Floating selection-toolbar button + separator.
function SelBtn({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid place-items-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--sand-hover)] ${
        danger ? 'text-ink-2 hover:text-warning' : 'text-ink-2 hover:text-ink'
      }`}
    >
      <Icon size={16} weight="regular" />
    </button>
  )
}
function SelSep() {
  return <span className="w-px h-5 mx-0.5 bg-[var(--border-2)] shrink-0" />
}

// Prominent, always-on canvas zoom control, pinned to the bottom-centre. Sits
// outside the panned/zoomed layer so it stays put. Frosted (.glass-bar) — the
// brand's sanctioned floating-overlay treatment.
function ZoomControl({ zoom, onIn, onOut, onReset }) {
  // Every row is the same 40px-wide box, centred, so the +, %, −, rule and
  // fit-view glyph sit on one clean vertical axis.
  const ZBtn = ({ icon: Icon, label, onClick, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid place-items-center w-10 h-10 rounded-full text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      <Icon size={19} weight="regular" />
    </button>
  )
  return (
    <div
      className="pop-in glass-bar absolute bottom-6 right-6 z-30 flex flex-col items-center gap-0.5 rounded-[22px] p-1.5"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ZBtn icon={Plus} label="Zoom in" onClick={onIn} disabled={zoom >= 4} />
      <button
        onClick={onReset}
        title="Reset to 100%"
        className="grid place-items-center w-10 h-8 text-[12px] font-medium tabular-nums text-ink rounded-lg hover:bg-[var(--sand-hover)] transition-colors"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ZBtn icon={Minus} label="Zoom out" onClick={onOut} disabled={zoom <= 0.25} />
      <span className="h-px w-6 my-1 bg-[var(--border-2)]" />
      <ZBtn icon={ArrowsIn} label="Reset view" onClick={onReset} />
    </div>
  )
}
