import { useRef, useState } from 'react'
import { Play, Pause, Camera } from '@phosphor-icons/react'
import Scrubber from '../../components/Scrubber.jsx'
import { useCanvasStore } from '../../store/canvasStore.js'
import { useSessionStore } from '../../store/sessionStore.js'
import { snapToGrid } from '../../utils/canvasUtils.js'
import { assetPath } from '../../utils/pathUtils.js'
import { saveAsset } from '../../utils/platform.js'

const fmt = (t = 0) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

// In-canvas video player. Plays in place, and captures the current frame
// straight onto the board as an image item — this is where Frame Extract lives
// now (no separate window). Under Tauri the full-res PNG is also written to the
// project's assets/frames/ folder. Controls stop propagation so the item still
// drags by its body.
export default function CanvasVideo({ item }) {
  const ref = useRef(null)
  const addItem = useCanvasStore((s) => s.addItem)
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
    let full, preview
    try {
      full = c.toDataURL('image/png')
      const pc = document.createElement('canvas')
      const r = Math.min(640 / c.width, 1)
      pc.width = Math.round(c.width * r)
      pc.height = Math.round(c.height * r)
      pc.getContext('2d').drawImage(c, 0, 0, pc.width, pc.height)
      preview = pc.toDataURL('image/jpeg', 0.8)
    } catch {
      return
    }

    const base = (item.label || 'frame').replace(/\.[^.]+$/, '')
    const fname = `${base}_${fmt(v.currentTime).replace(':', 'm')}s.png`
    const w = 200
    const h = Math.round((c.height / c.width) * w)

    // place beside the source clip, snapped; write the real PNG under Tauri
    const folder = useSessionStore.getState().session?.folder || ''
    const savedPath = await saveAsset(folder, `assets/frames/${fname}`, full)
    addItem({
      type: 'image',
      src: preview,
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
        className="w-full h-full object-cover pointer-events-none"
      />

      {/* Big centre affordance: Play when paused (always visible), Pause when
          playing (revealed on hover). Counter-scaled by --inv-zoom so it stays a
          constant, crisp size at any board zoom. */}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggle}
        className={`absolute left-1/2 top-1/2 grid place-items-center w-9 h-9 rounded-full transition-opacity duration-150 ${
          playing ? 'opacity-0 group-hover/v:opacity-100' : 'opacity-100'
        }`}
        style={{
          background: 'rgba(10,10,10,0.72)',
          color: '#f5f5f5',
          transform: 'translate(-50%, -50%) scale(var(--inv-zoom, 1))',
        }}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
      </button>

      {/* control bar — on hover. Counter-scaled (bottom-centre) so its text and
          controls stay sharp instead of rasterising up with the zoomed canvas. */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="glass-bar absolute left-1.5 right-1.5 bottom-1.5 rounded-[8px] px-2 py-1.5 flex items-center gap-2 opacity-0 group-hover/v:opacity-100 transition-opacity duration-150"
        style={{ transform: 'scale(var(--inv-zoom, 1))', transformOrigin: 'bottom center' }}
      >
        <button onClick={toggle} className="text-ink hover:text-accent shrink-0" title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
        </button>
        <Scrubber value={time} max={duration} onChange={seek} className="flex-1" />
        <span className="text-[10px] text-ink-3 tabular-nums shrink-0">{fmt(time)}</span>
        <button onClick={capture} className="text-ink-2 hover:text-ink shrink-0" title="Capture frame to canvas">
          <Camera size={15} />
        </button>
      </div>
    </div>
  )
}
