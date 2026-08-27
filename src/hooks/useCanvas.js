import { useEffect, useRef, useState, useCallback } from 'react'
import { useCanvasStore } from '../store/canvasStore.js'

// A board can hold a wall of references or one image you're studying, so the
// range runs from a tenth (see everything) to 8× (read the grain). The old
// 0.25–4 couldn't do either end.
export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 8

// Named stops for the +/− buttons and keys. Stepping by a fixed +0.2 drifted
// onto ugly values (90%, 110%, 130%…) and moved far too slowly once you were
// zoomed in; landing on round percentages is both predictable and faster.
const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const stepUp = (z) => ZOOM_STEPS.find((s) => s > z + 0.001) ?? ZOOM_MAX
const stepDown = (z) => [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? ZOOM_MIN
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

// Clearance a fit leaves around the content, per edge — sized to the floating
// chrome that overlays the canvas (tool dock along the bottom, zoom pill in the
// bottom-right corner) so fitted content lands where you can actually see it.
const FIT_PADDING = { top: 72, right: 110, bottom: 120, left: 72 }
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Bounding box (canvas coords) of a set of items, or null if there are none.
const boundsOf = (items) => {
  if (!items.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const it of items) {
    minX = Math.min(minX, it.x)
    minY = Math.min(minY, it.y)
    maxX = Math.max(maxX, it.x + (it.width || 0))
    maxY = Math.max(maxY, it.y + (it.height || 0))
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Pan + zoom for the infinite canvas. Built on raw transforms — no library.
// Pan: hold space + drag, or middle-mouse drag. Zoom: wheel/pinch anchored at
// the cursor, or the buttons and keys, which step through ZOOM_STEPS.
//
// Direct input (wheel, pinch, drag) still moves the board 1:1 with no easing —
// that's the brand rule and it's what makes the canvas feel physical. Only
// *commanded* zooms (a button, a shortcut, Fit) tween, over ~180ms, because
// those teleport the viewport and a jump cut leaves you hunting for where you
// landed. Any direct input cancels a tween in flight.
export function useCanvas() {
  const canvasRef = useRef(null)
  const panX = useCanvasStore((s) => s.panX)
  const panY = useCanvasStore((s) => s.panY)
  const zoom = useCanvasStore((s) => s.zoom)
  const setPan = useCanvasStore((s) => s.setPan)
  const setZoom = useCanvasStore((s) => s.setZoom)

  const [spaceDown, setSpaceDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panOrigin = useRef(null)

  // In-flight view tween (see animTo). Held in a ref so the raw wheel/pan
  // listeners can kill it without re-registering themselves.
  const animRef = useRef(null)
  const cancelAnim = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    animRef.current = null
  }, [])
  useEffect(() => () => cancelAnim(), [cancelAnim])

  // Sharp-on-stop: the board layer carries `will-change: transform` so pan/zoom
  // is a cheap GPU move — but that pins a fixed-resolution raster, so images
  // blur when zoomed in past the size the texture was baked at. We flip this
  // flag on whenever the transform changes and off a beat after it settles;
  // dropping the will-change hint at rest lets Chromium re-rasterise the layer
  // crisply at the current zoom. Motion masks the transient softness while it's
  // on. (See DumpBoard's canvas-bg layer.)
  const [interacting, setInteracting] = useState(false)
  const idleTimer = useRef(null)
  useEffect(() => {
    setInteracting(true)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setInteracting(false), 160)
    return () => idleTimer.current && clearTimeout(idleTimer.current)
  }, [panX, panY, zoom])

  // Space toggles pan affordance (ignore while typing in a field/note).
  useEffect(() => {
    const isEditable = (el) =>
      el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)
    const down = (e) => {
      if (e.code === 'Space' && !isEditable(document.activeElement)) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const up = (e) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Wheel + gesture handling. Native listeners so we can preventDefault.
  //  · pinch (trackpad)    → zoom, anchored at the cursor (Figma-style)
  //  · Cmd/Ctrl+wheel      → zoom, anchored at the cursor
  //  · scroll              → pan (vertical scroll pans vertically)
  //  · horizontal scroll   → pan horizontally (trackpad deltaX, or Shift+wheel)
  //
  // On a trackpad a two-finger pinch is delivered by the OS/engine as a `wheel`
  // event with `ctrlKey` set — the user is NOT pressing Ctrl. That's how every
  // web canvas tool (Figma, tldraw, Excalidraw) detects pinch. macOS WebKit is
  // the exception: it sends `gesture*` events with an absolute `scale` instead,
  // so we handle those too.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    // Zoom to an absolute factor, keeping the world point under the cursor fixed.
    const zoomToAt = (nextZoom, clientX, clientY) => {
      const rect = el.getBoundingClientRect()
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      const { panX, panY, zoom } = useCanvasStore.getState()
      const next = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX)
      const wx = (sx - panX) / zoom
      const wy = (sy - panY) / zoom
      setPan(sx - wx * next, sy - wy * next)
      setZoom(next)
    }

    const onWheel = (e) => {
      // Yield to a scrollable note / text field under the cursor: let the wheel
      // scroll it natively instead of panning/zooming the board. Only when not
      // zooming (Ctrl/Cmd still zooms the board) and only if it can actually
      // scroll. Without this a long note only scrolled via its scrollbar.
      const sc = e.target.closest?.('[data-wheel-scroll]')
      if (sc && !e.ctrlKey && !e.metaKey && sc.scrollHeight > sc.clientHeight + 1) return
      cancelAnim() // your hand always wins over a tween in flight
      // passive:false + preventDefault stops WebView2/WKWebView from applying its
      // own whole-page magnification on top of ours. On Windows this pairs with
      // disabling WebView2's IsPinchZoomEnabled (src-tauri/src/lib.rs) — with the
      // host page-scale zoom off, Chromium forwards the trackpad pinch to the
      // page as ctrl+wheel events, which the ctrlKey branch below handles.
      e.preventDefault()
      // Branch on ctrlKey (trackpad pinch-as-ctrl+wheel, both the macOS path and
      // the WebView2 path) OR metaKey. deltaMode === 0 means delta is in CSS
      // pixels, which the `* 0.0015` factor below assumes.
      if (e.ctrlKey || e.metaKey) {
        // pinch / zoom — exponential so it feels even across zoom levels.
        // Anchored at e.clientX/e.clientY relative to the canvas rect (inside
        // zoomToAt), never the canvas origin.
        const { zoom } = useCanvasStore.getState()
        const px = e.deltaMode === 0 ? e.deltaY : e.deltaY * 16 // line-mode fallback
        return zoomToAt(zoom * Math.exp(-px * 0.0015), e.clientX, e.clientY)
      }
      // scroll = pan; Shift turns a vertical mouse wheel into horizontal scroll
      let dx = e.deltaX
      let dy = e.deltaY
      if (e.shiftKey && dx === 0) {
        dx = dy
        dy = 0
      }
      const { panX, panY } = useCanvasStore.getState()
      setPan(panX - dx, panY - dy)
    }

    // macOS WebKit pinch: gesture events carry an absolute scale; track the
    // pointer so we can anchor the zoom under the fingers.
    let gestureStartZoom = 1
    let point = { x: 0, y: 0 }
    const trackPointer = (e) => {
      point = { x: e.clientX, y: e.clientY }
    }
    const onGestureStart = (e) => {
      e.preventDefault()
      cancelAnim()
      gestureStartZoom = useCanvasStore.getState().zoom
      point = { x: e.clientX, y: e.clientY }
    }
    const onGestureChange = (e) => {
      e.preventDefault()
      zoomToAt(gestureStartZoom * e.scale, point.x, point.y)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointermove', trackPointer)
    el.addEventListener('gesturestart', onGestureStart, { passive: false })
    el.addEventListener('gesturechange', onGestureChange, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointermove', trackPointer)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
    }
  }, [setPan, setZoom, cancelAnim])

  const handleMouseDown = useCallback(
    (e) => {
      const panTool = useCanvasStore.getState().tool === 'pan'
      const wantsPan = spaceDown || panTool || e.button === 1
      if (!wantsPan) return
      e.preventDefault()
      cancelAnim()
      setIsPanning(true)
      const { panX, panY } = useCanvasStore.getState()
      panOrigin.current = { x: e.clientX, y: e.clientY, panX, panY }
    },
    [spaceDown, cancelAnim]
  )

  useEffect(() => {
    if (!isPanning) return
    const move = (e) => {
      const o = panOrigin.current
      if (!o) return
      setPan(o.panX + (e.clientX - o.x), o.panY + (e.clientY - o.y))
    }
    const up = () => setIsPanning(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [isPanning, setPan])

  // ---- commanded (tweened) view changes ----------------------------------

  // Tween the whole view — pan and zoom together, so the board appears to move
  // under a camera rather than teleport. Cancelled the instant you touch the
  // wheel or start a pan, so a tween can never fight your hand.
  const animTo = useCallback(
    (target, duration = 180) => {
      cancelAnim()
      const from = useCanvasStore.getState()
      const start = { panX: from.panX, panY: from.panY, zoom: from.zoom }
      // A hidden window suspends rAF, which would strand the tween halfway and
      // leave the board at some arbitrary in-between zoom. Jump instead.
      if (reducedMotion() || duration <= 0 || document.hidden) {
        setPan(target.panX, target.panY)
        setZoom(target.zoom)
        return
      }
      const t0 = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / duration)
        const k = easeOut(t)
        setPan(start.panX + (target.panX - start.panX) * k, start.panY + (target.panY - start.panY) * k)
        setZoom(start.zoom + (target.zoom - start.zoom) * k)
        animRef.current = t < 1 ? requestAnimationFrame(tick) : null
      }
      animRef.current = requestAnimationFrame(tick)
    },
    [cancelAnim, setPan, setZoom]
  )

  // Zoom about a point given in canvas-element coordinates (default: the middle
  // of the viewport), keeping the world point under it fixed.
  const zoomAround = useCallback(
    (next, at, animate = true) => {
      const el = canvasRef.current
      const clamped = clamp(next, ZOOM_MIN, ZOOM_MAX)
      if (!el) return setZoom(clamped)
      const rect = el.getBoundingClientRect()
      const sx = at?.x ?? rect.width / 2
      const sy = at?.y ?? rect.height / 2
      const { panX, panY, zoom } = useCanvasStore.getState()
      const wx = (sx - panX) / zoom
      const wy = (sy - panY) / zoom
      const target = { panX: sx - wx * clamped, panY: sy - wy * clamped, zoom: clamped }
      if (animate) animTo(target)
      else {
        cancelAnim()
        setPan(target.panX, target.panY)
        setZoom(target.zoom)
      }
    },
    [animTo, cancelAnim, setPan, setZoom]
  )

  const zoomTo = useCallback((next) => zoomAround(next), [zoomAround])
  const zoomIn = useCallback(() => zoomAround(stepUp(useCanvasStore.getState().zoom)), [zoomAround])
  const zoomOut = useCallback(() => zoomAround(stepDown(useCanvasStore.getState().zoom)), [zoomAround])

  // Frame a world-space rect in the viewport. The padding is deliberately
  // lopsided: the tool dock floats over the bottom of the canvas and the zoom
  // pill over the bottom-right, so an evenly-padded fit tucks content underneath
  // them. `maxZoom` stops a single small item being blown up to fill the screen.
  const fitRect = useCallback(
    (rect, { padding = FIT_PADDING, maxZoom = 2 } = {}) => {
      const el = canvasRef.current
      if (!el || !rect || rect.w <= 0 || rect.h <= 0) return
      const r = el.getBoundingClientRect()
      const vw = Math.max(1, r.width - padding.left - padding.right)
      const vh = Math.max(1, r.height - padding.top - padding.bottom)
      const z = clamp(Math.min(vw / rect.w, vh / rect.h), ZOOM_MIN, Math.min(ZOOM_MAX, maxZoom))
      animTo({
        panX: padding.left + vw / 2 - (rect.x + rect.w / 2) * z,
        panY: padding.top + vh / 2 - (rect.y + rect.h / 2) * z,
        zoom: z,
      })
    },
    [animTo]
  )

  // Fit everything on the board. With an empty board there's nothing to frame,
  // so it just returns to 100% at the origin.
  const zoomToFit = useCallback(() => {
    const b = boundsOf(useCanvasStore.getState().items)
    if (!b) return animTo({ panX: 0, panY: 0, zoom: 1 })
    fitRect(b)
  }, [animTo, fitRect])

  // Fit the current selection — the fastest way to go and look at one thing.
  // Falls back to fitting the whole board when nothing is selected.
  const zoomToSelection = useCallback(() => {
    const { items, selectedIds } = useCanvasStore.getState()
    const picked = items.filter((it) => selectedIds.includes(it.id))
    if (!picked.length) return zoomToFit()
    fitRect(boundsOf(picked), { padding: { ...FIT_PADDING, top: 96, left: 96 }, maxZoom: 3 })
  }, [fitRect, zoomToFit])

  // 100%, holding whatever you're looking at in the middle of the viewport.
  const zoomTo100 = useCallback(() => zoomAround(1), [zoomAround])

  const resetView = useCallback(() => animTo({ panX: 0, panY: 0, zoom: 1 }), [animTo])

  // Keyboard: the shortcuts the cheat-sheet has always promised. Ctrl/⌘+0 is
  // 100%, Ctrl/⌘+1 fits the board, Ctrl/⌘+2 fits the selection; +/− step. Note
  // the app menu is removed in electron/main.cjs precisely so Ctrl+0/+/− reach
  // this handler instead of magnifying the whole page behind it.
  useEffect(() => {
    const onKey = (e) => {
      const t = document.activeElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        return zoomIn()
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        return zoomOut()
      }
      if (!mod) return
      if (e.key === '0') {
        e.preventDefault()
        return zoomTo100()
      }
      if (e.key === '1') {
        e.preventDefault()
        return zoomToFit()
      }
      if (e.key === '2') {
        e.preventDefault()
        return zoomToSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomIn, zoomOut, zoomTo100, zoomToFit, zoomToSelection])

  return {
    canvasRef,
    panX,
    panY,
    zoom,
    spaceDown,
    isPanning,
    interacting,
    handleMouseDown,
    zoomTo,
    zoomIn,
    zoomOut,
    zoomTo100,
    zoomToFit,
    zoomToSelection,
    fitRect,
    resetView,
    ZOOM_MIN,
    ZOOM_MAX,
  }
}
