import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Eyedropper, Plus, X, ImageSquare } from '@phosphor-icons/react'
import Button from '../../components/Button.jsx'
import { useSessionStore } from '../../store/sessionStore.js'
import { useProjectStore } from '../../store/projectStore.js'
import { extractPalette } from '../../utils/colourExtract.js'

const STAGE = { w: 540, h: 380 }
const hx = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')

// Color Pick (Creation Bench) — extract colours from any image on the active
// canvas and add them to the project's Skin. Click anywhere on the image to
// sample an exact pixel, or take the auto-extracted dominant swatches.
export default function ColorPickTool() {
  const session = useSessionStore((s) => s.session)
  const saveModule = useSessionStore((s) => s.saveModule)
  const updateProject = useProjectStore((s) => s.updateProject)
  const canvasRef = useRef(null)

  const images = useMemo(() => {
    if (!session) return []
    const a = session.modules?.dumpboard?.items || []
    const b = session.modules?.moodboard?.items || []
    return [...a, ...b].filter((it) => it.type === 'image' && it.src && !it.missing)
  }, [session])

  const [active, setActive] = useState(null)
  const [dominant, setDominant] = useState([])
  const [picks, setPicks] = useState([])

  // draw the chosen image onto the stage canvas + extract its dominant palette
  const choose = useCallback((it) => {
    setActive(it)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const cv = canvasRef.current
      if (!cv) return
      const r = Math.min(STAGE.w / img.width, STAGE.h / img.height)
      cv.width = Math.round(img.width * r)
      cv.height = Math.round(img.height * r)
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
      setDominant(extractPalette(img, 6))
    }
    img.src = it.src
  }, [])

  useEffect(() => {
    if (images.length && !active) choose(images[0])
  }, [images, active, choose])

  const sampleAt = (e) => {
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) * (cv.width / rect.width))
    const y = Math.round((e.clientY - rect.top) * (cv.height / rect.height))
    try {
      const [r, g, b] = cv.getContext('2d').getImageData(x, y, 1, 1).data
      add(`#${hx(r)}${hx(g)}${hx(b)}`)
    } catch {
      /* tainted canvas */
    }
  }

  const add = (hex) => setPicks((p) => (p.includes(hex) ? p : [...p, hex]))
  const remove = (hex) => setPicks((p) => p.filter((c) => c !== hex))

  const addToSkin = () => {
    if (!session || picks.length === 0) return
    const skin = session.modules?.projectskin || { palette: [], pins: [], note: '' }
    const merged = [...new Set([...(skin.palette || []), ...picks])].slice(0, 12)
    saveModule('projectskin', { ...skin, palette: merged })
    updateProject(session.id, { palette: merged })
    setPicks([])
  }

  if (!session) {
    return (
      <div className="flex-1 grid place-items-center text-center px-6">
        <div className="max-w-[320px]">
          <ImageSquare size={26} weight="thin" className="text-ink-3 mx-auto mb-3" />
          <p className="text-[13px] text-ink-3 font-light leading-relaxed">
            Open a project to pick colours from its canvas. Color Pick samples the active
            project's images and adds them to its Skin.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 min-h-0 flex">
        {/* image strip */}
        <div className="w-[150px] shrink-0 border-r-[0.5px] border-[var(--border)] overflow-y-auto p-3 flex flex-col gap-2">
          {images.length === 0 && (
            <p className="text-[11px] text-ink-3 font-light">No images on this project's canvas yet.</p>
          )}
          {images.map((it) => (
            <button
              key={it.id}
              onClick={() => choose(it)}
              className="aspect-square rounded-[6px] overflow-hidden border-[0.5px] transition-colors"
              style={{ borderColor: active?.id === it.id ? 'var(--accent)' : 'var(--border)' }}
            >
              <img src={it.src} alt={it.label} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        {/* stage + sampling */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 grid place-items-center p-5">
            {active ? (
              <canvas
                ref={canvasRef}
                onClick={sampleAt}
                className="max-w-full max-h-full rounded-[8px] border-[0.5px] border-[var(--border-2)] cursor-crosshair"
              />
            ) : (
              <p className="text-[12px] text-ink-3">Select an image</p>
            )}
          </div>
          {dominant.length > 0 && (
            <div className="shrink-0 px-5 py-3 border-t-[0.5px] border-[var(--border)]">
              <div className="text-[10px] uppercase tracking-[0.08em] text-ink-3 mb-2">Dominant</div>
              <div className="flex flex-wrap gap-2">
                {dominant.map((hex) => (
                  <button
                    key={hex}
                    onClick={() => add(hex)}
                    className="flex items-center gap-1.5 rounded-md pl-1 pr-2 py-1 border-[0.5px] border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
                  >
                    <span className="w-4 h-4 rounded-[3px]" style={{ background: hex }} />
                    <span className="text-[10px] font-mono uppercase text-ink-2">{hex}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* picked tray */}
        <aside className="w-[180px] shrink-0 border-l-[0.5px] border-[var(--border)] flex flex-col">
          <div className="px-4 pt-4 pb-2 text-[10px] uppercase tracking-[0.08em] text-ink-3">
            Picked · {picks.length}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5">
            {picks.length === 0 && (
              <p className="text-[11px] text-ink-3 font-light">
                Click the image to sample, or add a dominant swatch.
              </p>
            )}
            {picks.map((hex) => (
              <div
                key={hex}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 border-[0.5px] border-[var(--border)]"
              >
                <span className="w-5 h-5 rounded-[4px] shrink-0" style={{ background: hex }} />
                <span className="text-[11px] font-mono uppercase text-ink-2 flex-1">{hex}</span>
                <button onClick={() => remove(hex)} className="text-ink-3 hover:text-warning opacity-0 group-hover:opacity-100">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-t-[0.5px]">
        <span className="text-[11px] text-ink-3 font-light flex items-center gap-1.5">
          <Eyedropper size={13} /> Adds to {session.name}'s Project Skin
        </span>
        <Button variant="primary" icon={Plus} onClick={addToSkin} disabled={picks.length === 0}>
          Add {picks.length || ''} to Skin
        </Button>
      </div>
    </>
  )
}
