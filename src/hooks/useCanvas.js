import { useEffect, useRef, useState, useCallback } from 'react'
import { useCanvasStore } from '../store/canvasStore.js'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 4.0
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Pan + zoom for the infinite canvas. Built on raw transforms — no library.
// Pan: hold space + drag, or middle-mouse drag. Zoom: wheel, anchored at the
// cursor. The canvas itself never eases; it responds 1:1 to input (per brand).
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
  }, [setPan, setZoom])

  const handleMouseDown = useCallback(
    (e) => {
      const panTool = useCanvasStore.getState().tool === 'pan'
      const wantsPan = spaceDown || panTool || e.button === 1
      if (!wantsPan) return
      e.preventDefault()
      setIsPanning(true)
      const { panX, panY } = useCanvasStore.getState()
      panOrigin.current = { x: e.clientX, y: e.clientY, panX, panY }
    },
    [spaceDown]
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

  const zoomTo = useCallback(
    (next) => {
      const el = canvasRef.current
      if (!el) return setZoom(clamp(next, ZOOM_MIN, ZOOM_MAX))
      const rect = el.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      const { panX, panY, zoom } = useCanvasStore.getState()
      const clamped = clamp(next, ZOOM_MIN, ZOOM_MAX)
      const wx = (cx - panX) / zoom
      const wy = (cy - panY) / zoom
      setPan(cx - wx * clamped, cy - wy * clamped)
      setZoom(clamped)
    },
    [setPan, setZoom]
  )

  const resetView = useCallback(() => {
    setPan(0, 0)
    setZoom(1)
  }, [setPan, setZoom])

  return {
    canvasRef,
    panX,
    panY,
    zoom,
    spaceDown,
    isPanning,
    handleMouseDown,
    zoomTo,
    resetView,
    ZOOM_MIN,
    ZOOM_MAX,
  }
}
