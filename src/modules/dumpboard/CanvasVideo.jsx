import { useRef, useState } from 'react'
import { Play, Pause, Camera } from '@phosphor-icons/react'
import Scrubber from '../../components/Scrubber.jsx'
import { useCanvasStore } from '../../store/canvasStore.js'
import { useSessionStore } from '../../store/sessionStore.js'
import { snapToGrid } from '../../utils/canvasUtils.js'
import { assetPath } from '../../utils/pathUtils.js'
import { saveAsset, toAssetUrl } from '../../utils/platform.js'
import { uid } from '../../utils/id.js'

const fmt = (t = 0) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

// In-canvas video player. Plays in place, and captures the current frame
// straight onto the board as an image item. The board item references the
// source-resolution PNG, so scaling the still later never exposes a small
// preview. Controls stop propagation so the item still drags by its body.
export default function CanvasVideo({ item, mediaClassName, mediaStyle }) {
  const ref = useRef(null)
  const addItem = useCanvasStore((s) => s.addItem)
  const zoom = useCanvasStore((s) => s.zoom)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }
  const seek = (t) => {
    const v = ref.current
    if (v) v.currentTime = t
    setTime(t)
  }

  const capture = async () => {
    const v = ref.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    let full
    try {
      full = c.toDataURL('image/png')
    } catch {
      return
    }

    const base = (item.label || 'frame').replace(/\.[^.]+$/, '')
    const fname = `${base}_${fmt(v.currentTime).replace(':', 'm')}s_${uid('f').slice(-4)}.png`
    const w = 200
    const h = Math.round((c.height / c.width) * w)

    // Persist the same source-resolution frame that the card displays. A
    // separate 640px preview used to become its src and went soft on resize.
    const folder = useSessionStore.getState().session?.folder || ''
    const savedPath = await saveAsset(folder, `assets/frames/${fname}`, full)
    let src = full
    if (savedPath) {
      try { src = (await toAssetUrl(savedPath)) || full } catch { /* keep the PNG bytes */ }
    }
    addItem({
      type: 'image',
      src,
      path: savedPath || assetPath(folder, 'frames', fname),
      label: fname,
      x: snapToGrid(item.x + item.width + 16),
      y: snapToGrid(item.y),
      width: w,
      height: h,
      missing: false,
    })
  }

  return (
    <div className="w-full h-full relative bg-black group/v">
      <video
        ref={ref}
        src={item.src}
        crossOrigin="anonymous"
        playsInline
        loop
        preload="metadata"
        onTimeUpdate={(e) => setTime(e.target.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.target.duration)}
        onEnded={() => setPlaying(false)}
        className={mediaClassName || 'w-full h-full object-cover pointer-events-none'}
        style={mediaStyle}
      />

      {/* Keep the play target a readable screen size even when a large card is
          viewed at a low board zoom. */}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggle}
        className={`absolute left-1/2 top-1/2 grid place-items-center w-10 h-10 rounded-full transition-opacity duration-150 ${
          playing ? 'opacity-0 group-hover/v:opacity-100' : 'opacity-100'
        }`}
        style={{
          background: 'rgba(10,10,10,0.72)',
          color: '#f5f5f5',
          transform: 'scale(var(--control-inv-zoom, 1)) translate(-50%, -50%)',
          transformOrigin: 'top left',
        }}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
      </button>

      {/* The transport has a compact screen-space width even on an enormous
          video card, and grows back to a usable size at low board zoom. */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="glass-bar absolute left-1/2 rounded-[8px] px-2 py-1 flex items-center gap-1.5 opacity-0 group-hover/v:opacity-100 transition-opacity duration-150"
        style={{
          bottom: 'calc(6px * var(--control-inv-zoom, 1))',
          width: Math.min(360, Math.max(112, item.width * zoom - 12)),
          transform: 'scale(var(--control-inv-zoom, 1)) translateX(-50%)',
          transformOrigin: 'bottom left',
        }}
      >
        <button onClick={toggle} className="grid place-items-center w-8 h-8 text-ink hover:text-accent shrink-0" title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </button>
        <Scrubber value={time} max={duration} onChange={seek} className="flex-1" />
        {item.width * zoom >= 180 && <span className="text-[11px] text-ink-3 tabular-nums shrink-0">{fmt(time)}</span>}
        <button onClick={capture} className="grid place-items-center w-8 h-8 text-ink-2 hover:text-ink shrink-0" title="Capture frame to canvas" aria-label="Capture frame to canvas">
          <Camera size={17} />
        </button>
      </div>
    </div>
  )
}
