import { useEffect, useRef, useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { useFocusStore } from '../../store/focusStore.js'
import { extractVibePalette } from '../../utils/colourExtract.js'
import { copyTextToClipboard } from '../../utils/systemClipboard.js'

const loadImage = (src) => new Promise((resolve) => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.onload = () => resolve(image)
  image.onerror = () => resolve(null)
  image.src = src
})

// The placed images shape a passive palette. It is always visible in the Focus
// toolbar; opening the popover only reveals values and copy actions.
export default function PaletteControl() {
  const queue = useFocusStore((s) => s.queue)
  const placed = useFocusStore((s) => s.placed)
  const placedIds = new Set(placed.map((item) => item.queueItemId))
  const images = queue.filter((item) =>
    placedIds.has(item.id) && item.type === 'image' && item.src &&
    !item.src.startsWith('data:image/svg+xml') // link cards have no image pixels
  )
  const sourceKey = images.map((item) => `${item.id}:${item.src}`).join('|')
  const [palette, setPalette] = useState([])
  const [open, setOpen] = useState(false)
  const [updated, setUpdated] = useState(false)
  const [copied, setCopied] = useState('')
  const [loading, setLoading] = useState(false)
  const cache = useRef(new Map())
  const previousPalette = useRef('')
  const updateTimer = useRef(null)
  const copyTimer = useRef(null)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (!images.length) {
      setPalette([])
      setLoading(false)
      previousPalette.current = ''
      cache.current.clear()
      return
    }

    setLoading(true)
    const currentSources = new Set(images.map((item) => item.src))
    for (const src of cache.current.keys()) {
      if (!currentSources.has(src)) cache.current.delete(src)
    }

    ;(async () => {
      const loaded = await Promise.all(images.map((item) => {
        if (!cache.current.has(item.src)) cache.current.set(item.src, loadImage(item.src))
        return cache.current.get(item.src)
      }))
      if (cancelled) return
      const next = extractVibePalette(loaded.filter(Boolean))
      const nextKey = next.join('|')
      if (previousPalette.current && previousPalette.current !== nextKey) {
        setUpdated(true)
        window.clearTimeout(updateTimer.current)
        updateTimer.current = window.setTimeout(() => setUpdated(false), 900)
      }
      previousPalette.current = nextKey
      setPalette(next)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [sourceKey])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => () => {
    window.clearTimeout(updateTimer.current)
    window.clearTimeout(copyTimer.current)
  }, [])

  const copyColor = async (color) => {
    const success = await copyTextToClipboard(color)
    setCopied(success ? `Copied ${color}` : 'Could not copy color')
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(''), 2200)
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Palette"
        aria-expanded={open}
        aria-controls="focus-palette-details"
        className={`focus-palette-trigger inline-flex h-7 items-center gap-2 rounded-md border-[0.5px] px-2.5 text-[12px] text-ink whitespace-nowrap bg-surface-2 hover:bg-surface-3 transition-colors ${updated ? 'palette-updated' : ''}`}
        style={{ borderColor: 'var(--border-2)' }}
      >
        <span className="focus-palette-label">Palette</span>
        <span className="flex h-[15px] w-[70px] shrink-0 overflow-hidden rounded-[3px] border-[0.5px] border-[var(--border-2)]" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <span
              key={index}
              className="flex-1 transition-colors duration-300"
              style={{ backgroundColor: palette[index] || 'var(--surface-3)' }}
            />
          ))}
        </span>
        <CaretDown size={11} className="text-ink-3" aria-hidden="true" />
      </button>

      {open && (
        <div
          id="focus-palette-details"
          className="absolute top-[calc(100%+8px)] right-0 z-[100] w-[260px] rounded-lg border-[0.5px] p-3.5 text-ink"
          style={{ background: 'var(--surface-modal)', borderColor: 'var(--border-2)', boxShadow: 'var(--shadow-lifted)' }}
        >
          <div className="text-[13px] font-medium">Palette</div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
            {images.length
              ? `From ${images.length} placed ${images.length === 1 ? 'reference' : 'references'} · updates automatically`
              : 'Place images in Focus to reveal the palette.'}
          </p>
          {palette.length > 0 ? (
            <>
              <div className="mt-3 flex h-14 overflow-hidden rounded-[5px] border-[0.5px] border-[var(--border-2)]" aria-label="Colors in the current palette">
                {palette.map((color, index) => (
                  <div key={`${index}-${color}`} className="flex-1" style={{ backgroundColor: color }} />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1">
                {palette.map((color, index) => (
                  <button
                    key={`${index}-${color}`}
                    type="button"
                    onClick={() => copyColor(color)}
                    aria-label={`Copy ${color}`}
                    className="flex items-center gap-1.5 rounded px-1.5 py-1.5 text-[11px] font-mono text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors"
                  >
                    <span className="h-3 w-3 shrink-0 rounded-[2px] border-[0.5px] border-[var(--border-2)]" style={{ backgroundColor: color }} />
                    {color.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="mt-2 min-h-4 text-[11px] text-ink-3" aria-live="polite">{copied || 'Click a color to copy its hex value.'}</p>
            </>
          ) : images.length > 0 && (
            <p className="mt-3 text-[11px] text-ink-3">
              {loading ? 'Reading the placed images…' : 'These images could not be sampled.'}
            </p>
          )}
        </div>
      )}
      <span className="sr-only" aria-live="polite">{updated ? 'Palette updated' : ''}</span>
    </div>
  )
}
