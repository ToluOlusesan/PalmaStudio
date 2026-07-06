import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause, Plus, FilmStrip, Path, Selection, X } from '@phosphor-icons/react'
import { useSessionStore } from '../../store/sessionStore.js'
import Button from '../../components/Button.jsx'
import Scrubber from '../../components/Scrubber.jsx'
import { uid } from '../../utils/id.js'

const fmt = (t = 0) => {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Motion Refs — frame-accurate reference. Pick a clip, scrub, pin frames (F),
// and attach timing notes to timestamps. Pinned frames are captured to data
// URLs so they survive reloads even though the source path (object URL) does
// not — the clip itself is relinked by re-picking the file (v1 web limitation).
export default function MotionRef() {
  const session = useSessionStore((s) => s.session)
  const saveModule = useSessionStore((s) => s.saveModule)
  const videoRef = useRef(null)

  const [src, setSrc] = useState(null)
  const [label, setLabel] = useState('')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [data, setData] = useState({ label: '', pinnedFrames: [], notes: [], sequences: [] })
  const [noteText, setNoteText] = useState('')
  const [pendIn, setPendIn] = useState(null) // in-point awaiting an out-point
  const ready = useRef(false)

  useEffect(() => {
    if (session && !ready.current) {
      const m = session.modules?.motionref || {}
      setData({
        label: m.label || '',
        pinnedFrames: m.pinnedFrames || [],
        notes: m.notes || [],
        sequences: m.sequences || [],
      })
      setLabel(m.label || '')
      ready.current = true
    }
  }, [session])
  useEffect(() => {
    ready.current = false
  }, [session?.id])

  const persist = useCallback(
    (next) => {
      setData(next)
      saveModule('motionref', next)
    },
    [saveModule]
  )

  const pickFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSrc(URL.createObjectURL(file))
    setLabel(file.name)
    persist({ ...data, label: file.name })
  }

  const togglePlay = () => {
    const v = videoRef.current
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
    const v = videoRef.current
    if (v) v.currentTime = t
    setTime(t)
  }

  const pinFrame = useCallback(() => {
    const v = videoRef.current
    if (!v || !src) return
    const c = document.createElement('canvas')
    c.width = 240
    c.height = Math.round((v.videoHeight / v.videoWidth) * 240) || 135
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    let thumb = null
    try {
      thumb = c.toDataURL('image/jpeg', 0.7)
    } catch {
      /* tainted (cross-origin) — keep timestamp only */
    }
    const frame = {
      id: uid('frame'),
      timestamp: +v.currentTime.toFixed(2),
      label: `frame_${String(data.pinnedFrames.length + 1).padStart(3, '0')}`,
      thumb,
    }
    persist({ ...data, pinnedFrames: [...data.pinnedFrames, frame] })
  }, [data, persist, src])

  // Press F to pin while not typing
  useEffect(() => {
    const onKey = (e) => {
      const t = document.activeElement
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
      if (e.key.toLowerCase() === 'f' && !typing) {
        e.preventDefault()
        pinFrame()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinFrame])

  const addNote = () => {
    if (!noteText.trim()) return
    const note = { id: uid('note'), timestamp: +time.toFixed(2), text: noteText.trim() }
    persist({ ...data, notes: [...data.notes, note].sort((a, b) => a.timestamp - b.timestamp) })
    setNoteText('')
  }

  // Sequence marking: set an in-point, then an out-point closes the range,
  // annotated with whatever is in the note field.
  const markSequence = () => {
    if (pendIn == null) {
      setPendIn(+time.toFixed(2))
      return
    }
    const inT = Math.min(pendIn, time)
    const outT = Math.max(pendIn, time)
    if (outT - inT < 0.05) return setPendIn(null)
    const seq = { id: uid('seq'), in: +inT.toFixed(2), out: +outT.toFixed(2), text: noteText.trim() }
    persist({ ...data, sequences: [...data.sequences, seq].sort((a, b) => a.in - b.in) })
    setPendIn(null)
    setNoteText('')
  }

  return (
    <div className="flex-1 min-h-0 flex bg-[var(--bg)]">
      {/* Player column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="relative flex-1 min-h-0 min-w-0 flex items-center justify-center p-6 overflow-hidden">
          {src ? (
            <video
              ref={videoRef}
              src={src}
              onTimeUpdate={(e) => setTime(e.target.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.target.duration)}
              onEnded={() => setPlaying(false)}
              className="max-w-full max-h-full w-auto h-auto object-contain rounded-[10px] border-[0.5px] border-[var(--border-2)]"
            />
          ) : (
            <label className="cursor-pointer text-center">
              <input type="file" accept="video/*" className="hidden" onChange={pickFile} />
              <FilmStrip size={28} weight="thin" className="text-ink-3 mx-auto mb-3" />
              <div className="text-[13px] text-ink-2">Pick a video to begin</div>
              <div className="text-[11px] text-ink-3 mt-1 font-light">
                {data.pinnedFrames.length > 0
                  ? `${data.pinnedFrames.length} pinned frames waiting — re-pick "${data.label}" to relink`
                  : 'Path reference only — the file is never copied'}
              </div>
            </label>
          )}

          {/* floating frosted playback bar over the video */}
          {src && (
            <div className="glass-bar absolute bottom-5 left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-[620px] rounded-[12px] px-4 py-2.5">
              <div className="flex items-center gap-3.5">
                <button
                  onClick={togglePlay}
                  className="shrink-0 grid place-items-center w-8 h-8 rounded-full text-ink hover:bg-white/10 transition-colors"
                >
                  {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
                </button>
                <span className="text-[11px] text-ink-2 tabular-nums w-9 text-right">{fmt(time)}</span>
                <Scrubber value={time} max={duration} onChange={seek} className="flex-1" />
                <span className="text-[11px] text-ink-3 tabular-nums w-9">{fmt(duration)}</span>
                <Button variant="tool" icon={Plus} onClick={pinFrame}>
                  Pin frame
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* annotation strip */}
        {src && (
          <div className="shrink-0 px-5 py-3 border-t-[0.5px] border-[var(--border)]">
            <div className="flex items-center gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNote()}
                placeholder={`Timing note at ${fmt(time)} — e.g. "ease-in, notice the hold"`}
                className="flex-1 h-8 px-3 rounded-md bg-surface-2 border-[0.5px] border-[var(--border)] text-[12px] text-ink placeholder:text-ink-3 focus:border-[var(--border-2)]"
              />
              <Button onClick={addNote}>Add</Button>
              <Button
                variant={pendIn == null ? 'default' : 'tool-active'}
                icon={Selection}
                onClick={markSequence}
              >
                {pendIn == null ? 'Mark in' : `Close · ${fmt(pendIn)}→${fmt(time)}`}
              </Button>
              {pendIn != null && (
                <button onClick={() => setPendIn(null)} className="text-ink-3 hover:text-ink p-1">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pins + notes rail */}
      <aside className="w-[260px] shrink-0 border-l-[0.5px] border-[var(--border)] flex flex-col bg-surface">
        <div className="px-4 pt-4 pb-2 text-[10px] uppercase tracking-[0.08em] text-ink-3">
          Pinned frames
        </div>
        <div className="px-4 grid grid-cols-2 gap-2 overflow-y-auto max-h-[40%]">
          {data.pinnedFrames.length === 0 && (
            <div className="col-span-2 text-[11px] text-ink-3 font-light pb-2">
              Press F to pin the current frame
            </div>
          )}
          {data.pinnedFrames.map((f) => (
            <button
              key={f.id}
              onClick={() => seek(f.timestamp)}
              className="text-left group"
              title={`Seek to ${fmt(f.timestamp)}`}
            >
              <div className="aspect-video rounded-[5px] overflow-hidden border-[0.5px] border-[var(--border)] bg-black">
                {f.thumb ? (
                  <img src={f.thumb} alt={f.label} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center">
                    <Path size={14} className="text-ink-3" />
                  </div>
                )}
              </div>
              <div className="text-[10px] text-ink-3 mt-1 tabular-nums">{fmt(f.timestamp)}</div>
            </button>
          ))}
        </div>

        <div className="px-4 pt-4 pb-2 text-[10px] uppercase tracking-[0.08em] text-ink-3 border-t-[0.5px] border-[var(--border)] mt-2">
          Timing notes
        </div>
        <div className="px-4 pb-3 overflow-y-auto flex-1 min-h-0 flex flex-col gap-1.5">
          {data.notes.length === 0 && (
            <div className="text-[11px] text-ink-3 font-light">No notes yet</div>
          )}
          {data.notes.map((n) => (
            <button
              key={n.id}
              onClick={() => seek(n.timestamp)}
              className="text-left rounded-md px-2.5 py-2 bg-surface-2 border-[0.5px] border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
            >
              <span className="text-[10px] tabular-nums text-accent">{fmt(n.timestamp)}</span>
              <p className="text-[12px] text-ink-2 leading-snug mt-0.5">{n.text}</p>
            </button>
          ))}
        </div>

        <div className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-[0.08em] text-ink-3 border-t-[0.5px] border-[var(--border)]">
          Sequences
        </div>
        <div className="px-4 pb-4 overflow-y-auto flex-1 min-h-0 flex flex-col gap-1.5">
          {data.sequences.length === 0 && (
            <div className="text-[11px] text-ink-3 font-light">
              Set an in-point, then close it to mark a range
            </div>
          )}
          {data.sequences.map((s) => (
            <button
              key={s.id}
              onClick={() => seek(s.in)}
              className="text-left rounded-md px-2.5 py-2 bg-surface-2 border-[0.5px] border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
            >
              <span className="text-[10px] tabular-nums text-accent">
                {fmt(s.in)} → {fmt(s.out)}
              </span>
              {s.text && <p className="text-[12px] text-ink-2 leading-snug mt-0.5">{s.text}</p>}
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}
