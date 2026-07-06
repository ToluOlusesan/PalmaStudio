import { useEffect, useState } from 'react'
import { isTauri } from '../utils/platform.js'
import { useCanvasStore } from '../store/canvasStore.js'
import { kindFromName, basename } from '../utils/pathUtils.js'
import { snapToGrid, loadImageSize, fitImageBox } from '../utils/canvasUtils.js'

// Desktop drag-drop. Unlike the browser's HTML5 drop (which only yields blob
// URLs that die on restart), Tauri's native drag-drop gives the real file PATH.
// We reference it via the asset protocol (convertFileSrc) so images and video
// load straight from disk — and keep loading after Palma is closed and reopened.
export function useTauriDrop(canvasRef, toCanvas) {
  const [isDragging, setIsDragging] = useState(false)
  const addItem = useCanvasStore((s) => s.addItem)
  const updateItem = useCanvasStore((s) => s.updateItem)

  useEffect(() => {
    if (!isTauri()) return
    let unlisten = null
    let cancelled = false

    ;(async () => {
      const [{ getCurrentWebview }, { convertFileSrc }] = await Promise.all([
        import('@tauri-apps/api/webview'),
        import('@tauri-apps/api/core'),
      ])
      if (cancelled) return
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        const p = event.payload
        if (p.type === 'enter' || p.type === 'over') return setIsDragging(true)
        if (p.type === 'leave') return setIsDragging(false)
        if (p.type !== 'drop') return
        setIsDragging(false)

        const dpr = window.devicePixelRatio || 1
        const origin = p.position
          ? toCanvas(p.position.x / dpr, p.position.y / dpr)
          : { x: 80, y: 80 }

        ;(p.paths || []).forEach((path, i) => {
          const kind = kindFromName(path)
          if (kind === 'note') return
          const isImg = kind === 'image'
          const src = convertFileSrc(path) // asset:// URL — persists across restarts
          const id = addItem({
            type: kind,
            src,
            path,
            label: basename(path),
            x: snapToGrid(origin.x + i * 26),
            y: snapToGrid(origin.y + i * 26),
            width: isImg ? 180 : 220,
            height: isImg ? 226 : 140,
            missing: false,
            ...(kind === 'video' ? { pinnedFrames: [], sequences: [] } : {}),
          })
          // Size images to their real aspect ratio once decoded.
          if (isImg) {
            loadImageSize(src).then((d) => d && updateItem(id, fitImageBox(d.w, d.h)))
          }
        })
      })
    })()

    return () => {
      cancelled = true
      if (unlisten) unlisten()
    }
  }, [canvasRef, toCanvas, addItem, updateItem])

  return { isDragging }
}
