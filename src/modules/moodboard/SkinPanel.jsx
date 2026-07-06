import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { CaretLeft, CaretRight, Eyedropper, Check, X, PushPin, Plus } from '@phosphor-icons/react'
import { useSessionStore } from '../../store/sessionStore.js'
import { useProjectStore } from '../../store/projectStore.js'
import { useCanvasStore } from '../../store/canvasStore.js'
import { extractSwatches, rgbToHex } from '../../utils/colourExtract.js'

// Copy text to the clipboard, with a textarea fallback for older webviews.
async function writeClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to execCommand */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}

// Key panel (formerly "Skin") — the Project Skin module, now a collapsible
// right-hand rail in the Focus area. Reads/writes the SAME `projectskin` session
// slice (palette / pins / note kept exactly as before). Dominant swatches are
// derived live from the canvas and never persisted; the palette + pinned anchors
// are the durable data. The rail width animates open/closed and the three
// sections stack vertically down the panel.
const PANEL_W = 296

const loadImage = (src) =>
  new Promise((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })

// Sensitivity 1–5 → granularity knobs. Lower = broad, heavily-averaged colours;
// higher = finer bins, more distinct colours, more swatches. `step` is the
// within-image bin size, `cross` the across-image bin size, `top` the count.
const SENS = {
  1: { step: 48, cross: 40, top: 3 },
  2: { step: 32, cross: 32, top: 4 },
  3: { step: 16, cross: 24, top: 5 },
  4: { step: 10, cross: 16, top: 7 },
  5: { step: 6, cross: 10, top: 10 },
}

export default function SkinPanel({ projectId }) {
  const session = useSessionStore((s) => s.session)
  const saveModule = useSessionStore((s) => s.saveModule)
  const updateProject = useProjectStore((s) => s.updateProject)

  // Live canvas items (this board) — drives the dominant swatches and the pin
  // picker. Reading from the store keeps both reactive as items come and go.
  const items = useCanvasStore((s) => s.items)
  const canvasImages = items.filter((it) => it.type === 'image' && it.src && !it.missing)

  const skin = session?.modules?.projectskin
  const palette = skin?.palette || []
  const pins = skin?.pins || []

  // Focus opens canvas-first — Skin starts as its thin bottom strip; open it
  // (the chevron) when you want palette / anchors.
  const [open, setOpen] = useState(false)
  const [dominant, setDominant] = useState([])
  const [picking, setPicking] = useState(false)
  const [copiedHex, setCopiedHex] = useState(null) // brief "copied" flash target
  const [copiedFmt, setCopiedFmt] = useState(null) // brief "copied" on the export buttons
  const copyTimer = useRef(null)

  // Click a swatch → copy its hex silently, flash a confirmation on the tile.
  const copyHex = useCallback((hex) => {
    writeClipboard(hex)
    setCopiedHex(hex)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopiedHex(null), 900)
  }, [])
  useEffect(() => () => copyTimer.current && clearTimeout(copyTimer.current), [])

  // Merge a patch into the projectskin slice, always reading the freshest copy
  // so palette / labels / pins / note never clobber one another.
  const saveSkin = useCallback(
    (patch) => {
      const cur = useSessionStore.getState().session?.modules?.projectskin || {}
      saveModule('projectskin', { ...cur, ...patch })
    },
    [saveModule]
  )

  // Dominant-colour sensitivity (persisted per project). Local state drives the
  // slider instantly; it syncs from the slice when the session changes.
  const [sensitivity, setSensitivity] = useState(3)
  useEffect(() => {
    setSensitivity(skin?.sensitivity ?? 3)
  }, [skin?.sensitivity])
  const changeSensitivity = (v) => {
    setSensitivity(v)
    saveSkin({ sensitivity: v })
  }

  // Cache decoded images by src so re-extracting on every slider tick is cheap
  // (no reload / re-decode — just the 24×24 sampling).
  const imgCache = useRef(new Map())
  const getImg = async (src) => {
    if (imgCache.current.has(src)) return imgCache.current.get(src)
    const img = await loadImage(src)
    imgCache.current.set(src, img)
    return img
  }

  // Dominant swatches — recomputed live whenever the set of canvas images
  // changes (added / removed). Aggregates 3–5 colours weighted by pixel
  // population across the images, same binning as the old snapshot.
  const srcKey = canvasImages.map((it) => it.src).join('|')
  useEffect(() => {
    let cancelled = false
    if (canvasImages.length === 0) {
      setDominant([])
      return
    }
    const { step, cross, top } = SENS[sensitivity] || SENS[3]
    ;(async () => {
      const bins = new Map()
      for (const it of canvasImages.slice(0, 12)) {
        const img = await getImg(it.src)
        if (!img) continue
        for (const sw of extractSwatches(img, Math.max(6, top), step)) {
          const key = `${Math.round(sw.r / cross)}-${Math.round(sw.g / cross)}-${Math.round(sw.b / cross)}`
          const e = bins.get(key) || { r: 0, g: 0, b: 0, n: 0 }
          e.r += sw.r * sw.n
          e.g += sw.g * sw.n
          e.b += sw.b * sw.n
          e.n += sw.n
          bins.set(key, e)
        }
      }
      if (cancelled) return
      setDominant(
        [...bins.values()]
          .sort((a, b) => b.n - a.n)
          .slice(0, top)
          .map((e) => rgbToHex(e.r / e.n, e.g / e.n, e.b / e.n))
      )
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey, sensitivity])

  const addColor = (hex) => {
    if (!hex || palette.includes(hex)) return
    const next = [...palette, hex].slice(0, 12)
    saveSkin({ palette: next })
    // keep the project summary swatch (dashboard / sidebar dot) in sync
    updateProject(projectId, { palette: next })
  }
  const removeColor = (hex) => {
    const next = palette.filter((c) => c !== hex)
    const labels = skin?.labels || {}
    const { [hex]: _drop, ...restLabels } = labels
    saveSkin({ palette: next, labels: restLabels })
    updateProject(projectId, { palette: next })
  }

  // Hand-off: copy the whole palette as ready-to-paste CSS variables or JSON.
  const copyPaletteAs = (fmt) => {
    if (!palette.length) return
    const text =
      fmt === 'css'
        ? `:root {\n${palette.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n}`
        : JSON.stringify(palette, null, 2)
    writeClipboard(text)
    setCopiedFmt(fmt)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopiedFmt(null), 1100)
  }

  // Native eyedropper — samples any pixel on screen, including canvas items.
  const pickColor = async () => {
    if (typeof window.EyeDropper !== 'function') {
      if (dominant[0]) addColor(dominant[0]) // no native eyedropper — grab the top dominant
      return
    }
    try {
      const { sRGBHex } = await new window.EyeDropper().open()
      addColor(sRGBHex)
    } catch {
      /* user cancelled */
    }
  }

  const togglePin = (it) => {
    const has = pins.some((p) => p.id === it.id)
    if (has) {
      saveSkin({ pins: pins.filter((p) => p.id !== it.id) })
    } else if (pins.length < 3) {
      saveSkin({ pins: [...pins, { id: it.id, src: it.src, label: it.label || '' }] })
    }
  }
  const unpin = (id) => saveSkin({ pins: pins.filter((p) => p.id !== id) })

  // Drag-to-pin: a reference dragged from the Curate rail and dropped on the
  // Anchors zone becomes an anchor (up to 3).
  const [anchorDragOver, setAnchorDragOver] = useState(false)
  const addPinFromRef = (ref) => {
    if (!ref || pins.length >= 3 || pins.some((p) => p.id === ref.id)) return
    saveSkin({ pins: [...pins, { id: ref.id, src: ref.src, label: ref.label || '' }] })
  }

  // Collapsed — a thin right strip with a vertical label; click to open.
  if (!open) {
    return (
      <aside
        className="shrink-0 h-full w-10 flex flex-col bg-surface border-l-[0.5px]"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => setOpen(true)}
          title="Open Key panel"
          aria-label="Open Key panel"
          className="w-full h-full flex flex-col items-center gap-2.5 pt-3 text-ink-2 hover:text-ink transition-colors"
        >
          <CaretLeft size={14} />
          <span className="font-serif text-[13px] leading-none" style={{ writingMode: 'vertical-rl' }}>
            Key
          </span>
        </button>
      </aside>
    )
  }

  return (
    <motion.aside
      className="shrink-0 h-full flex flex-col bg-surface border-l-[0.5px] overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
      initial={{ width: 40 }}
      animate={{ width: PANEL_W }}
      exit={{ width: 40 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header — title toggles the panel; eyedropper sits opposite. */}
      <div
        className="h-10 shrink-0 flex items-center justify-between pl-3 pr-2 border-b-[0.5px]"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Collapse Key panel"
          className="flex items-center gap-1.5 text-ink-2 hover:text-ink transition-colors"
        >
          <CaretRight size={14} />
          <span className="font-serif text-[15px] leading-none">Key</span>
        </button>
        <button
          onClick={pickColor}
          title="Pick a colour from anywhere on screen"
          className="flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors"
        >
          <Eyedropper size={14} /> Pick
        </button>
      </div>

      {/* Body — sections stacked top to bottom; the whole rail scrolls. */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ width: PANEL_W }}>
        {/* Dominant — live from the canvas. Click a tile to copy; + adds it to
            the palette. The slider tunes broad ↔ detailed colour distinction. */}
        <SideSection
          title="Dominant"
          right={
            canvasImages.length > 0 && (
              <label className="flex items-center gap-1.5" title="Colour sensitivity — broad ↔ detailed">
                <span className="text-[9px] uppercase tracking-[0.06em] text-ink-3">Detail</span>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={sensitivity}
                  onChange={(e) => changeSensitivity(Number(e.target.value))}
                  aria-label="Colour sensitivity"
                  className="w-16 cursor-pointer"
                  style={{ accentColor: 'var(--accent)', height: '3px' }}
                />
              </label>
            )
          }
        >
          {dominant.length === 0 ? (
            <Empty>Add references to the canvas to read its dominant colours.</Empty>
          ) : (
            <SwatchGrid>
              {dominant.map((hex) => (
                <Swatch
                  key={hex}
                  hex={hex}
                  copied={copiedHex === hex}
                  onCopy={copyHex}
                  onAdd={() => addColor(hex)}
                  added={palette.includes(hex)}
                />
              ))}
            </SwatchGrid>
          )}
        </SideSection>

        {/* Palette — your kept colours. Click to copy; hover to remove. */}
        <SideSection
          title="Palette"
          right={
            palette.length > 0 && (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => copyPaletteAs('css')}
                  title="Copy palette as CSS variables"
                  className="text-[10px] text-ink-3 hover:text-ink transition-colors"
                >
                  {copiedFmt === 'css' ? 'Copied' : 'CSS'}
                </button>
                <button
                  onClick={() => copyPaletteAs('json')}
                  title="Copy palette as JSON"
                  className="text-[10px] text-ink-3 hover:text-ink transition-colors"
                >
                  {copiedFmt === 'json' ? 'Copied' : 'JSON'}
                </button>
              </div>
            )
          }
        >
          {palette.length === 0 ? (
            <Empty>Pick colours with the eyedropper, or + a dominant colour — they collect here.</Empty>
          ) : (
            <SwatchGrid>
              {palette.map((hex) => (
                <Swatch
                  key={hex}
                  hex={hex}
                  copied={copiedHex === hex}
                  onCopy={copyHex}
                  onRemove={removeColor}
                />
              ))}
            </SwatchGrid>
          )}
        </SideSection>

        {/* Anchors — up to 3 reference thumbnails. Drop a ref from Curate here. */}
        <div
          className="px-4 py-3 transition-colors"
          style={{
            background: anchorDragOver && pins.length < 3 ? 'var(--sand-hover)' : 'transparent',
          }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes('application/x-palma-ref')) {
              e.preventDefault()
              setAnchorDragOver(true)
            }
          }}
          onDragLeave={() => setAnchorDragOver(false)}
          onDrop={(e) => {
            setAnchorDragOver(false)
            const raw = e.dataTransfer.getData('application/x-palma-ref')
            if (!raw) return
            e.preventDefault()
            try {
              addPinFromRef(JSON.parse(raw))
            } catch {
              /* ignore bad payload */
            }
          }}
        >
          <div className="flex items-center justify-between mb-2 h-5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-ink-3">Anchors</span>
            {pins.length < 3 && canvasImages.length > 0 && (
              <button
                onClick={() => setPicking((v) => !v)}
                title="Pin a reference"
                className="flex items-center gap-1 text-[10px] text-ink-3 hover:text-ink transition-colors"
              >
                <PushPin size={13} /> {picking ? 'Done' : 'Pin'}
              </button>
            )}
          </div>

          {pins.length === 0 && !picking ? (
            <Empty>Drag references here from the Curate rail to set this project's visual anchors.</Empty>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {pins.map((p) => (
                <div
                  key={p.id}
                  className="group relative aspect-square rounded-[6px] overflow-hidden border-[0.5px] border-[var(--border-2)]"
                >
                  <img src={p.src} alt={p.label} className="w-full h-full object-cover" />
                  <button
                    onClick={() => unpin(p.id)}
                    className="absolute top-1 right-1 grid place-items-center w-4 h-4 rounded-full bg-[rgba(10,10,10,0.7)] text-white/85 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Unpin"
                  >
                    <X size={10} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pin picker — choose from the canvas images */}
          {picking && (
            <div className="mt-2 grid grid-cols-3 gap-2 pt-2 border-t-[0.5px] border-[var(--border)]">
              {canvasImages.map((it) => {
                const pinned = pins.some((p) => p.id === it.id)
                return (
                  <button
                    key={it.id}
                    onClick={() => togglePin(it)}
                    disabled={!pinned && pins.length >= 3}
                    className="relative aspect-square rounded-[6px] overflow-hidden border-[0.5px] disabled:opacity-40"
                    style={{ borderColor: pinned ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <img src={it.src} alt={it.label} className="w-full h-full object-cover" />
                    {pinned && (
                      <span
                        className="absolute top-1 right-1 grid place-items-center w-4 h-4 rounded-full"
                        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                      >
                        <PushPin size={9} weight="fill" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  )
}

// A stacked section in the side rail: header row (label + optional control)
// above its content, with a hairline divider beneath.
function SideSection({ title, right, children }) {
  return (
    <div className="px-4 py-3 border-b-[0.5px] border-[var(--border)]">
      <div className="flex items-center justify-between mb-2 h-5">
        <span className="text-[10px] uppercase tracking-[0.08em] text-ink-3">{title}</span>
        {right || null}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }) {
  return <p className="text-[12px] text-ink-3 font-light leading-relaxed">{children}</p>
}

// Responsive grid of colour tiles (square swatch + hex caption), 8px gutters.
function SwatchGrid({ children }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: '8px' }}
    >
      {children}
    </div>
  )
}

// A colour tile: a square swatch with its hex shown beneath. Clicking copies the
// hex (flashing a check). A corner action either adds it to the palette (+, for
// dominant tiles — with a check once it's in) or removes it (×, for palette
// tiles).
function Swatch({ hex, copied, onCopy, onRemove, onAdd, added }) {
  return (
    <div
      role="button"
      tabIndex={0}
      title={`Copy ${hex}`}
      onClick={() => onCopy(hex)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onCopy(hex)}
      className="group relative flex flex-col items-stretch cursor-pointer outline-none"
    >
      <div
        className="relative aspect-square rounded-[6px] border-[0.5px] border-[var(--border-2)]"
        style={{ background: hex }}
      >
        <span
          className={`absolute inset-0 grid place-items-center rounded-[6px] bg-[rgba(10,10,10,0.6)] transition-opacity duration-150 ${
            copied ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Check size={15} weight="bold" className="text-white" />
        </span>

        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(hex)
            }}
            aria-label="Remove colour"
            className="absolute -top-1 -right-1 grid place-items-center w-4 h-4 rounded-full bg-[rgba(10,10,10,0.85)] text-white/80 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={9} weight="bold" />
          </button>
        )}

        {onAdd &&
          (added ? (
            <span
              className="absolute -top-1 -right-1 grid place-items-center w-4 h-4 rounded-full bg-surface-3 text-ink-3 border-[0.5px] border-[var(--border-2)]"
              title="In palette"
            >
              <Check size={8} weight="bold" />
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAdd()
              }}
              aria-label="Add to palette"
              title="Add to palette"
              className="absolute -top-1 -right-1 grid place-items-center w-4 h-4 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Plus size={9} weight="bold" />
            </button>
          ))}
      </div>
      <span className="mt-1 text-[9px] font-mono uppercase text-ink-3 text-center leading-none truncate group-hover:text-ink-2 transition-colors">
        {hex}
      </span>
    </div>
  )
}
