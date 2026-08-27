import { useState, useCallback, useRef } from 'react'
import { useCanvasStore } from '../store/canvasStore.js'
import { useSessionStore } from '../store/sessionStore.js'
import { kindFromName, isImageType, isVideoType, basename } from '../utils/pathUtils.js'
import { snapToGrid, captureVideoPoster, loadImageSize, fitImageBox } from '../utils/canvasUtils.js'
import { persistImage, persistRemoteImage, desktopPathForFile, toAssetUrl } from '../utils/platform.js'
import { uid } from '../utils/id.js'
import { landBoardItem } from '../utils/boardOps.js'
import { imageUrlFromTransfer, imageUrlFromHtml, isDirectImageUrl } from '../utils/imageSource.js'

// The image URL a paste is offering: the copied markup's <img> (srcset-aware,
// so we take the biggest size the page published) or a bare URL on the
// clipboard. Preferred over the clipboard's own bitmap wherever it exists —
// the bitmap is only ever the size the page was rendering.
const clipboardImageUrl = (e) => {
  const fromHtml = imageUrlFromHtml(e.clipboardData?.getData('text/html') || '')
  if (fromHtml) return fromHtml
  const text = (e.clipboardData?.getData('text/plain') || '').trim()
  return isDirectImageUrl(text) ? text : ''
}

// Drag-and-drop intake for the canvas. Accepts image/video files and dropped
// URLs. Screen-drop coordinates are converted into canvas-space so items land
// under the cursor regardless of pan/zoom.
//
// v1 (web): files become object URLs; `path` is simulated from file.name and
// flagged for the Tauri fs swap. Finder image/video → reference only; browser
// drops → would download to /project/assets in v2.
export function useDrop(containerRef) {
  const [isDragging, setIsDragging] = useState(false)
  const depth = useRef(0)
  const addItem = useCanvasStore((s) => s.addItem)
  const updateItem = useCanvasStore((s) => s.updateItem)

  const toCanvas = useCallback(
    (clientX, clientY) => {
      const el = containerRef.current
      const { panX, panY, zoom } = useCanvasStore.getState()
      const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0 }
      return {
        x: (clientX - rect.left - panX) / zoom,
        y: (clientY - rect.top - panY) / zoom,
      }
    },
    [containerRef]
  )

  // Only react to OS file drags — never to an internal element drag (e.g. while
  // moving selected canvas items), which would wrongly flash "Drop to add".
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')

  // Download a remote image into the project and land it. Resolves false when
  // the host served nothing and `requireDownload` is set — so a caller that
  // still holds the dragged bytes (handleDrop) can fall back to those rather
  // than landing a dead remote reference.
  const landRemoteImage = useCallback(
    (url, at, { requireDownload = false } = {}) => {
      const folder = useSessionStore.getState().session?.folder || ''
      const projectId = useSessionStore.getState().session?.id
      return persistRemoteImage(folder, url, `pasted_${uid('img')}`).then(async (saved) => {
        if (!saved && requireDownload) return false
        const src = saved?.src || url
        const path = saved?.path || url
        const { liveId } = landBoardItem(projectId, {
          type: 'image',
          src,
          path,
          label: basename(url) || 'pasted',
          x: snapToGrid(at.x),
          y: snapToGrid(at.y),
          width: 180,
          height: 226,
          missing: false,
        })
        if (liveId) {
          loadImageSize(src).then((d) => d && updateItem(liveId, fitImageBox(d.w, d.h)))
        }
        return true
      })
    },
    [updateItem]
  )

  const handleDragEnter = useCallback((e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth.current += 1
    setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    depth.current -= 1
    if (depth.current <= 0) {
      depth.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      depth.current = 0
      setIsDragging(false)
      const origin = toCanvas(e.clientX, e.clientY)
      // Captured now, synchronously, before any `await` below — the project
      // this drop is FOR, regardless of where the user is by the time an async
      // persist finishes. See landBoardItem in utils/boardOps.js.
      const dropProjectId = useSessionStore.getState().session?.id

      // Tell a browser image drag apart from an OS file drag: a browser hands
      // over text/html and/or text/uri-list types (the source markup / URL);
      // an Explorer/Finder drag carries only 'Files'. This holds even when the
      // image's URL is a blob:/data: one, which a plain http-regex would miss.
      const types = Array.from(e.dataTransfer.types || [])
      const droppedUrl = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').trim()
      const isHttpUrl = /^https?:\/\//i.test(droppedUrl)
      const fromBrowser = isHttpUrl || types.includes('text/html') || types.includes('text/uri-list')

      const files = [...(e.dataTransfer.files || [])]
      const landFiles = () => {
        files.forEach(async (file, i) => {
          const kind = isImageType(file.type)
            ? 'image'
            : isVideoType(file.type)
              ? 'video'
              : kindFromName(file.name)
          if (kind === 'note') return
          const isImg = kind === 'image'

          // Persistence-critical: never leave an image on a session-scoped blob:
          // URL (snapshot() strips those → "missing" after reload — the bug
          // testers hit). A file dragged from Explorer/Finder has a real disk
          // path → reference it via an asset URL. A file dragged from a BROWSER
          // is backed by a THROWAWAY temp file (Chromium's drag cache), whose
          // path getPathForFile happily returns — referencing it means the image
          // disappears when temp is cleared. So for browser drags we ignore that
          // path and write the bytes into the project's assets/ (persistImage),
          // exactly like a paste. Only videos without a usable path keep an
          // object URL (bytes too big to embed); they reload as a poster.
          const diskPath = fromBrowser ? null : desktopPathForFile(file)
          let src
          let path
          if (diskPath) {
            src = await toAssetUrl(diskPath)
            path = diskPath
          } else if (isImg) {
            const folder = useSessionStore.getState().session?.folder || ''
            const ext = (file.name.split('.').pop() || 'png').toLowerCase()
            const saved = await persistImage(folder, `assets/drop_${uid('img')}.${ext}`, file)
            src = saved.src
            path = saved.path
          } else {
            src = URL.createObjectURL(file)
            path = file.name
          }
          const { liveId } = landBoardItem(dropProjectId, {
            type: kind,
            src,
            path,
            label: diskPath ? basename(diskPath) : file.name,
            x: snapToGrid(origin.x + i * 26),
            y: snapToGrid(origin.y + i * 26),
            width: isImg ? 180 : 220,
            height: isImg ? 226 : 140,
            missing: false,
            ...(kind === 'video' ? { pinnedFrames: [], sequences: [] } : {}),
          })
          // Secondary polish only applies when the item actually landed live —
          // there's no durable-session equivalent of updateItem, and losing the
          // auto-fit-aspect-ratio touch on the rare raced drop is a fair trade
          // for never losing the item itself.
          if (liveId && isImg) {
            loadImageSize(src).then((d) => d && updateItem(liveId, fitImageBox(d.w, d.h)))
          }
          // Cache a poster frame so the clip still reads as itself if its blob
          // URL dies on restart (the persisted item becomes a missing placeholder).
          if (liveId && kind === 'video') {
            captureVideoPoster(src).then((poster) => poster && updateItem(liveId, { poster }))
          }
        })
      }

      // A browser image drag hands over BOTH a temp file and the source markup.
      // The temp file is only ever the pixels the page was DISPLAYING — on an
      // image-grid site that's a downscaled tile, so saving it means saving the
      // thumbnail. The markup still carries the real URL (and its srcset), which
      // the downloader can upgrade to the host's original. So: try the URL
      // first, and fall back to the dragged bytes only if nothing downloads.
      const remoteUrl = fromBrowser ? imageUrlFromTransfer(e.dataTransfer) : ''
      if (remoteUrl) {
        landRemoteImage(remoteUrl, origin, { requireDownload: files.length > 0 }).then((ok) => {
          if (!ok) landFiles()
        })
        return
      }

      if (files.length) {
        landFiles()
        return
      }

      // Dropped just a URL (e.g. from a browser tab, no file) → download the
      // bytes into the project's assets/ and reference that.
      if (isHttpUrl) {
        landRemoteImage(droppedUrl, origin)
      }
    },
    [landRemoteImage, toCanvas]
  )

  // Land raw clipboard bitmap bytes (a screenshot, or a copied image whose
  // source URL we couldn't reach). persistImage writes them into the project's
  // assets/ on the desktop and embeds them as a data: URL in web — either way a
  // stable ref that survives a reload, never a session-scoped blob: URL.
  const landPastedFile = useCallback(
    (file, mime, at) => {
      const ext = ((mime || '').split('/')[1] || 'png').replace('jpeg', 'jpg')
      const name = `pasted_${uid('img')}.${ext}`
      const folder = useSessionStore.getState().session?.folder || ''
      // Captured now, before the async persist — see landBoardItem.
      const pasteProjectId = useSessionStore.getState().session?.id
      persistImage(folder, `assets/${name}`, file).then(({ src, path }) => {
        const { liveId } = landBoardItem(pasteProjectId, {
          type: 'image',
          src,
          path,
          label: 'pasted',
          x: snapToGrid(at.x),
          y: snapToGrid(at.y),
          width: 200,
          height: 150,
          missing: false,
        })
        if (liveId) {
          loadImageSize(src).then((d) => d && updateItem(liveId, fitImageBox(d.w, d.h)))
        }
      })
    },
    [updateItem]
  )

  // Clipboard paste of an image (screenshots) → canvas item, centred-ish.
  const handlePaste = useCallback(
    (e, center) => {
      const at = center ? toCanvas(center.x, center.y) : { x: 80, y: 80 }
      const items = [...(e.clipboardData?.items || [])]

      // 1. An image on the clipboard (a screenshot, a copied image) → image item.
      //    "Copy image" in a browser puts BOTH the rendered bitmap and the page
      //    markup on the clipboard. The markup names the source URL, which can
      //    be upgraded to the host's original, so it wins when it's there; the
      //    bitmap (always only as big as the page drew it) is the fallback.
      const imgItem = items.find((it) => it.type.startsWith('image/'))
      const markupUrl = clipboardImageUrl(e)
      if (imgItem && markupUrl) {
        const file = imgItem.getAsFile()
        landRemoteImage(markupUrl, at, { requireDownload: !!file }).then((ok) => {
          if (!ok && file) landPastedFile(file, imgItem.type, at)
        })
        return true
      }
      if (imgItem) {
        const file = imgItem.getAsFile()
        if (file) landPastedFile(file, imgItem.type, at)
        return true
      }

      // 2. Text on the clipboard. A direct link to an image → image reference;
      //    any other URL or plain text → a note holding it. Returns whether we
      //    consumed the paste so callers can fall through to other handlers.
      if (markupUrl) {
        landRemoteImage(markupUrl, at)
        return true
      }

      const text = (e.clipboardData?.getData('text/plain') || '').trim()
      if (!text) return false

      addItem({
        type: 'note',
        content: text,
        x: snapToGrid(at.x),
        y: snapToGrid(at.y),
        width: 200,
        height: 140,
      })
      return true
    },
    [addItem, landPastedFile, landRemoteImage, toCanvas]
  )

  return {
    isDragging,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    toCanvas,
  }
}
