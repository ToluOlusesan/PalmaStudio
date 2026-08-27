import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, Camera } from '@phosphor-icons/react'
import Scrubber from '../../components/Scrubber.jsx'
import { useCanvasStore } from '../../store/canvasStore.js'
import { useSessionStore } from '../../store/sessionStore.js'
import { snapToGrid } from '../../utils/canvasUtils.js'
import { assetPath } from '../../utils/pathUtils.js'
import { saveAsset, toAssetUrl } from '../../utils/platform.js'
import { uid } from '../../utils/id.js'

// A GIF on the board, with a real transport.
//
// A plain <img> can't be paused — the browser owns the animation and gives you
// no handle on it. So instead of displaying the GIF we DECODE it (WebCodecs
// ImageDecoder, which Chromium has had since 94) and paint frames onto a canvas
// ourselves. That buys the whole point of the feature: pause holds the exact
// frame you were looking at, play carries on from there, and you can scrub to
// the frame you actually wanted — which is the reason to put a motion reference
// on a board in the first place.
//
// If ImageDecoder isn't there or the file won't decode, we fall back to a plain
// <img>: it animates, and Pause freezes it by snapshotting the visible frame to
// a canvas (resuming restarts the loop, the best a bare <img> allows).

export default function CanvasGif({ item, mediaStyle, mediaClassName }) {
  const updateItem = useCanvasStore((s) => s.updateItem)
  // The item IS the play state — no local mirror. The right-click menu can
  // toggle gifPaused too, and a mirrored copy would leave the card still
  // running while the menu insisted it was paused.
  const playing = !item.gifPaused
  const setPaused = (paused) => updateItem(item.id, { gifPaused: paused })
  const [decoder, setDecoder] = useState({ status: 'loading' })
  const decoderRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const frameRef = useRef(0) // where the loop should resume from
  const [frame, setFrame] = useState(0) // same, for the scrubber's benefit

  // ---- decode ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setDecoder({ status: 'loading' })
    decoderRef.current = null
    if (typeof window.ImageDecoder === 'undefined') {
      setDecoder({ status: 'fallback' })
      return
    }
    ;(async () => {
      try {
        const res = await fetch(item.src)
        const data = await res.arrayBuffer()
        if (cancelled) return
        const dec = new window.ImageDecoder({ data, type: 'image/gif' })
        await dec.tracks.ready
        if (cancelled) return dec.close()
        const track = dec.tracks.selectedTrack
        const first = await dec.decode({ frameIndex: 0 })
        if (cancelled) {
          first.image.close()
          return dec.close()
        }
        const w = first.image.displayWidth
        const h = first.image.displayHeight
        first.image.close()
        decoderRef.current = dec
        setDecoder({ status: 'ready', frames: Math.max(1, track?.frameCount || 1), w, h })
      } catch {
        if (!cancelled) setDecoder({ status: 'fallback' })
      }
    })()
    return () => {
      cancelled = true
      try {
        decoderRef.current?.close()
      } catch {
        /* already closed */
      }
      decoderRef.current = null
    }
  }, [item.src])

  // ---- playback ----------------------------------------------------------
  // Decodes and paints one frame, then schedules the next by that frame's own
  // delay (GIF frame durations are per-frame, in microseconds). Re-runs on
  // play/pause and on a scrub; `frameRef` carries the position across those.
  const [seekTick, setSeekTick] = useState(0)
  useEffect(() => {
    if (decoder.status !== 'ready') return
    const cv = canvasRef.current
    const dec = decoderRef.current
    if (!cv || !dec) return
    cv.width = decoder.w
    cv.height = decoder.h
    const ctx = cv.getContext('2d')
    let cancelled = false
    let timer = null
    let i = frameRef.current % decoder.frames

    const step = async () => {
      let decoded
      try {
        decoded = await dec.decode({ frameIndex: i })
      } catch {
        return
      }
      if (cancelled) return decoded.image.close()
      ctx.drawImage(decoded.image, 0, 0, cv.width, cv.height)
      // VideoFrame.duration is in microseconds, and has to be read before the
      // frame is closed. 100ms is the GIF spec's own default.
      const delay = decoded.image.duration || 100000
      decoded.image.close()
      frameRef.current = i
      setFrame(i)
      if (!playing || decoder.frames < 2) return
      // Browsers floor sub-20ms GIF delays to 100ms; match that so joke-fast
      // GIFs play at the speed everywhere else shows them.
      const ms = delay / 1000 < 20 ? 100 : delay / 1000
      timer = setTimeout(() => {
        i = (i + 1) % decoder.frames
        step()
      }, ms)
    }
    step()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [decoder, playing, seekTick])

  // ---- fallback freeze ---------------------------------------------------
  // No decoder: snapshot whatever frame the <img> is showing onto a canvas and
  // show that instead. The <img> unmounts, so the animation genuinely stops.
  const [frozen, setFrozen] = useState(null)
  const freeze = useCallback(() => {
    const el = imgRef.current
    if (!el || !el.naturalWidth) return null
    try {
      const c = document.createElement('canvas')
      c.width = el.naturalWidth
      c.height = el.naturalHeight
      c.getContext('2d').drawImage(el, 0, 0)
      return c.toDataURL('image/png')
    } catch {
      return null
    }
  }, [])
  // Reopened already paused → there's no live <img> to snapshot, so show the
  // first frame (loading it into a detached Image, which never gets displayed).
  useEffect(() => {
    if (decoder.status !== 'fallback' || playing || frozen) return
    let cancelled = false
    const probe = new Image()
    probe.crossOrigin = 'anonymous'
    probe.onload = () => {
      if (cancelled) return
      try {
        const c = document.createElement('canvas')
        c.width = probe.naturalWidth
        c.height = probe.naturalHeight
        c.getContext('2d').drawImage(probe, 0, 0)
        setFrozen(c.toDataURL('image/png'))
      } catch {
        /* tainted canvas — leave the img running rather than showing nothing */
      }
    }
    probe.src = item.src
    return () => {
      cancelled = true
    }
  }, [decoder.status, playing, frozen, item.src])

  const toggle = (e) => {
    e?.stopPropagation()
    const next = !playing
    if (!next && decoder.status === 'fallback') setFrozen(freeze())
    if (next) setFrozen(null)
    setPaused(!next)
  }

  // Scrubbing implies "let me look at this frame", so it pauses.
  const seek = (n) => {
    const i = Math.max(0, Math.min((decoder.frames || 1) - 1, Math.round(n)))
    frameRef.current = i
    if (playing) setPaused(true)
    setSeekTick((t) => t + 1)
  }

  // Drop the frame on screen onto the board as its own still image — the same
  // move the video player's Capture makes, for the same reason.
  const capture = async () => {
    const cv = canvasRef.current
    let full
    try {
      if (decoder.status === 'ready' && cv) full = cv.toDataURL('image/png')
      else if (frozen) full = frozen
      else full = freeze()
    } catch {
      return
    }
    if (!full) return
    // Frame numbers match what the transport shows (1-based).
    const base = (item.label || 'gif').replace(/\.[^.]+$/, '')
    const fname = `${base}_f${frameRef.current + 1}_${uid('x').slice(-4)}.png`
    const folder = useSessionStore.getState().session?.folder || ''
    const savedPath = await saveAsset(folder, `assets/frames/${fname}`, full)
    // Reference the PNG on disk once it's written — keeping the full data: URL
    // as the item src would park a whole base64 image inside palma.json. It
    // stays the fallback for web, where there's no disk to write to.
    const src = (savedPath && (await toAssetUrl(savedPath))) || full
    const w = item.width
    const h = Math.round((decoder.h && decoder.w ? decoder.h / decoder.w : 0.75) * w)
    useCanvasStore.getState().addItem({
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

  const showFallbackImg = decoder.status !== 'ready' && !(frozen && !playing)

  return (
    <div className="w-full h-full relative group/g">
      {decoder.status === 'ready' ? (
        <canvas ref={canvasRef} className={mediaClassName} style={mediaStyle} />
      ) : frozen && !playing ? (
        <img src={frozen} alt={item.label} draggable={false} className={mediaClassName} style={mediaStyle} />
      ) : null}
      {/* Deliberately no crossOrigin below: on the rare path where a GIF's src is
          still a remote URL (the download fell through), requesting CORS can fail
          the load outright and show nothing. Displaying it matters more than
          being able to snapshot it — the freeze just fails softly, and the
          frame-accurate decoder above covers every local case. */}
      {showFallbackImg && (
        <img
          ref={imgRef}
          src={item.src}
          alt={item.label}
          draggable={false}
          className={mediaClassName}
          style={mediaStyle}
        />
      )}

      {/* GIF marker — a still frame is indistinguishable from a photo without
          it, and it doubles as the hint that this card has a transport. */}
      <div
        className="absolute top-1.5 left-1.5 px-1.5 py-[1px] rounded text-[9px] font-medium tracking-wide pointer-events-none"
        style={{
          background: 'rgba(10,10,10,0.66)',
          color: '#f5f5f5',
          transform: 'scale(var(--inv-zoom, 1))',
          transformOrigin: 'top left',
        }}
      >
        GIF
      </div>

      {/* Centre affordance: Play always visible when paused, Pause on hover. */}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggle}
        className={`absolute left-1/2 top-1/2 grid place-items-center w-9 h-9 rounded-full transition-opacity duration-150 ${
          playing ? 'opacity-0 group-hover/g:opacity-100' : 'opacity-100'
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

      {/* Frame transport — only where we're really decoding, since a fallback
          <img> has no frames to scrub. */}
      {decoder.status === 'ready' && decoder.frames > 1 && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="glass-bar absolute left-1.5 right-1.5 bottom-1.5 rounded-[8px] px-2 py-1.5 flex items-center gap-2 opacity-0 group-hover/g:opacity-100 transition-opacity duration-150"
          style={{ transform: 'scale(var(--inv-zoom, 1))', transformOrigin: 'bottom center' }}
        >
          <button onClick={toggle} className="text-ink hover:text-accent shrink-0" title={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>
          <Scrubber value={frame} max={decoder.frames - 1} onChange={seek} className="flex-1" />
          <span className="text-[10px] text-ink-3 tabular-nums shrink-0">
            {frame + 1}/{decoder.frames}
          </span>
          <button onClick={capture} className="text-ink-2 hover:text-ink shrink-0" title="Capture frame to canvas">
            <Camera size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
