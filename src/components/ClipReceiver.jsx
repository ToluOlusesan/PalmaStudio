import { useEffect, useRef, useState } from 'react'
import { onClip, isElectron, saveAsset, toAssetUrl } from '../utils/platform.js'
import { useProjectStore } from '../store/projectStore.js'
import { useSessionStore } from '../store/sessionStore.js'
import { appendBoardItem } from '../utils/boardOps.js'
import { loadImageSize, fitImageBox } from '../utils/canvasUtils.js'
import { basename } from '../utils/pathUtils.js'
import { uid } from '../utils/id.js'

// Receives browser-extension clips relayed from the local ingest server and
// routes them into whichever project is OPEN: saves the image into that
// project's assets/ and drops it on its Dump Board (live if that board is the
// visible module, otherwise merged into the open session). When no project is
// open it falls back to the Inbox project instead. Shows a small toast.
// Electron only.
export default function ClipReceiver() {
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const flash = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  useEffect(() => {
    if (!isElectron()) return undefined
    const unsub = onClip(async ({ imageDataUrl, title }) => {
      try {
        if (!imageDataUrl) return

        // Route to the open project; fall back to the Inbox when nothing's open.
        const open = useSessionStore.getState().session
        const target = open
          ? { id: open.id, folder: open.folder, name: open.name }
          : await useProjectStore.getState().ensureInbox()
        if (!target) return

        const m = /^data:(image\/[^;]+)/.exec(imageDataUrl)
        const ext = (m ? m[1].split('/')[1] : 'jpg').replace('jpeg', 'jpg').split('+')[0]
        const name = `clip_${uid('img')}.${ext}`

        let src = imageDataUrl
        let path = name
        if (target.folder) {
          const saved = await saveAsset(target.folder, `assets/${name}`, imageDataUrl)
          if (saved) {
            const u = await toAssetUrl(saved)
            if (u) {
              src = u
              path = saved
            }
          }
        }

        const size = await loadImageSize(src)
        const box = size ? fitImageBox(size.w, size.h) : { width: 200, height: 150 }
        const label = title ? title.slice(0, 60) : basename(path)
        const item = { type: 'image', src, path, label, ...box }

        // Open project → ingest into its Dump Board (live or in-memory). No open
        // project → append straight to the Inbox session on disk/cache.
        if (open) useSessionStore.getState().ingestClip(item)
        else appendBoardItem(target.id, item)

        flash(`Clipped to ${target.name || 'Inbox'}`)
      } catch {
        flash('Clip failed')
      }
    })
    return unsub
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  if (!toast) return null
  return (
    <div className="glass-bar fixed bottom-5 right-5 z-[120] rounded-full px-4 py-2 text-[12px] text-ink pointer-events-none">
      {toast}
    </div>
  )
}
