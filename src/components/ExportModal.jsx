import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CaretDown, Check, Sun, Moon } from '@phosphor-icons/react'
import { useSessionStore } from '../store/sessionStore.js'
import { useFocusStore } from '../store/focusStore.js'
import { saveDataUrl } from '../utils/platform.js'
import { exportBoardImage, boardToPdfDataUri } from '../utils/captureBoard.js'
import { renderFocusBoard, focusBoardPdf, processBriefPdf } from '../utils/focusExport.js'

// Unified export. A dropdown picks the target (Dump Board / Focus Board /
// Process Brief); the controls beneath adapt to it. Nothing is gated or graded —
// every target is always selectable and exports whatever exists (an empty
// section simply doesn't appear in the output). Process Brief is PDF-only and
// carries a light/dark toggle, since it's the one output whose theme isn't just
// the current view; boards export exactly as the canvas looks now.
const TARGETS = [
  { key: 'dumpboard', title: 'Dump Board', sub: 'Full canvas snapshot' },
  { key: 'focus', title: 'Focus Board', sub: 'Zones and references' },
  { key: 'brief', title: 'Process Brief', sub: 'Dump Board → Focus → Notes' },
]

export default function ExportModal({ open, onClose, context }) {
  // Pre-select the target matching the view it was opened from (Focus from the
  // Focus view, otherwise the Dump Board); never the Brief.
  const [sel, setSel] = useState(context === 'moodboard' ? 'focus' : 'dumpboard')
  const [format, setFormat] = useState('png')
  const [scale, setScale] = useState(2)
  const [briefTheme, setBriefTheme] = useState('light')
  const [focusTheme, setFocusTheme] = useState('light')
  const [busy, setBusy] = useState(false)
  const [ddOpen, setDdOpen] = useState(false)
  const ddRef = useRef(null)

  // Which Focus zones to include (default all) — lets you export just the
  // zone(s) you want to share instead of the whole board every time.
  const zones = useFocusStore((s) => s.zones)
  const [zoneSel, setZoneSel] = useState(() => new Set())

  useEffect(() => {
    if (!open) return
    setSel(context === 'moodboard' ? 'focus' : 'dumpboard')
    setFormat('png')
    setScale(2)
    setBriefTheme('light')
    setFocusTheme('light')
    setDdOpen(false)
    setZoneSel(new Set(useFocusStore.getState().zones.map((z) => z.id)))
  }, [open, context])

  const toggleZone = (id) =>
    setZoneSel((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const allZonesOn = zones.length > 0 && zones.every((z) => zoneSel.has(z.id))
  const toggleAllZones = () =>
    setZoneSel(allZonesOn ? new Set() : new Set(zones.map((z) => z.id)))

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Close the target dropdown on any pointer-down outside it.
  useEffect(() => {
    if (!ddOpen) return
    const onDown = (e) => {
      if (!ddRef.current?.contains(e.target)) setDdOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [ddOpen])

  const isBrief = sel === 'brief'
  const target = TARGETS.find((t) => t.key === sel) || TARGETS[0]

  const run = async () => {
    setBusy(true)
    try {
      useSessionStore.getState().flush()
      const sess = useSessionStore.getState().session
      const fs = useFocusStore.getState()
      const dumpItems = sess?.modules?.dumpboard?.items || []
      const dumpEdges = sess?.modules?.dumpboard?.edges || []

      if (sel === 'dumpboard') {
        if (format === 'pdf') {
          const uri = await boardToPdfDataUri(dumpItems, dumpEdges, scale)
          if (uri) await saveDataUrl('dump-board.pdf', uri, [{ name: 'PDF', extensions: ['pdf'] }])
        } else {
          const url = await exportBoardImage(dumpItems, dumpEdges, scale)
          if (url) await saveDataUrl('dump-board.png', url, [{ name: 'PNG Image', extensions: ['png'] }])
        }
      } else if (sel === 'focus') {
        // Export only the chosen zones (placed/queue are scoped by zone inside).
        const pickedZones = fs.zones.filter((z) => zoneSel.has(z.id))
        if (format === 'pdf') {
          // Styled, one-zone-per-page PDF (Process-Brief look) with notes/comments.
          const uri = await focusBoardPdf(pickedZones, fs.placed, fs.queue, fs.notes, { theme: focusTheme })
          if (uri) await saveDataUrl(`focus-board-${focusTheme}.pdf`, uri, [{ name: 'PDF', extensions: ['pdf'] }])
        } else {
          const url = await renderFocusBoard(pickedZones, fs.placed, fs.queue, { scale, max: scale >= 2 ? 4000 : 2500, theme: focusTheme })
          if (url) await saveDataUrl(`focus-board-${focusTheme}.png`, url, [{ name: 'PNG Image', extensions: ['png'] }])
        }
      } else {
        const uri = await processBriefPdf({
          projectName: sess?.name || 'Untitled',
          direction: fs.direction,
          dumpItems,
          dumpEdges,
          zones: fs.zones,
          placed: fs.placed,
          queue: fs.queue,
          notes: fs.notes,
          scratchpad: sess?.modules?.scratchpad?.content || '',
          theme: briefTheme,
        })
        if (uri) await saveDataUrl(`process-brief-${briefTheme}.pdf`, uri, [{ name: 'PDF', extensions: ['pdf'] }])
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(10,10,10,0.2)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose} />
          <motion.div
            className="relative w-full max-w-[400px] rounded-[14px] border-[0.5px]"
            style={{ borderColor: 'var(--border-2)', background: 'var(--surface-modal)' }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.25, 0, 0, 1] }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b-[0.5px]" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-serif text-[18px] text-ink leading-none">Export</h2>
              <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink transition-colors -mr-1 p-1">
                <X size={15} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Target dropdown */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-[0.1em] text-ink-3 font-semibold">What to export</label>
                <div className="relative" ref={ddRef}>
                  <button
                    onClick={() => setDdOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={ddOpen}
                    className="w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2.5 border-[0.5px] bg-surface-2 hover:bg-[var(--sand-hover)] transition-colors"
                    style={{ borderColor: 'var(--border-2)' }}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] text-ink leading-tight">{target.title}</span>
                      <span className="block text-[11px] text-ink-3 leading-tight">{target.sub}</span>
                    </span>
                    <CaretDown size={14} className={`ml-auto text-ink-3 transition-transform ${ddOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {ddOpen && (
                    <div
                      role="listbox"
                      className="pop-in absolute top-[calc(100%+6px)] left-0 right-0 z-20 rounded-[10px] border-[0.5px] p-1.5 flex flex-col gap-0.5"
                      style={{ borderColor: 'var(--border-2)', background: 'var(--surface-modal)', boxShadow: 'var(--shadow-lifted)' }}
                    >
                      {TARGETS.map((t) => (
                        <button
                          key={t.key}
                          role="option"
                          aria-selected={t.key === sel}
                          onClick={() => {
                            setSel(t.key)
                            setDdOpen(false)
                          }}
                          className="flex items-center gap-2.5 text-left rounded-md px-2.5 py-2 hover:bg-[var(--sand-hover)] transition-colors"
                        >
                          <span className="w-3.5 shrink-0 text-ink">
                            {t.key === sel && <Check size={14} weight="bold" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] text-ink leading-tight">{t.title}</span>
                            <span className="block text-[11px] text-ink-3 leading-tight">{t.sub}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Controls — adapt to the target */}
              {isBrief ? (
                <div className="flex items-end gap-5">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-ink-3 font-semibold">Format</span>
                    <span className="inline-flex items-center h-[30px] px-3 text-[12px] text-ink-2 rounded-md border-[0.5px] bg-surface-2" style={{ borderColor: 'var(--border-2)' }}>
                      PDF
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-ink-3 font-semibold">Output theme</span>
                    <Seg
                      options={[
                        ['light', <span key="l" className="inline-flex items-center gap-1.5"><Sun size={13} /> Light</span>],
                        ['dark', <span key="d" className="inline-flex items-center gap-1.5"><Moon size={13} /> Dark</span>],
                      ]}
                      value={briefTheme}
                      onChange={setBriefTheme}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-end gap-5">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-3 font-semibold">Format</span>
                      <Seg options={[['png', 'PNG'], ['pdf', 'PDF']]} value={format} onChange={setFormat} />
                    </div>
                    <div className={`flex flex-col gap-1.5 transition-opacity ${format === 'pdf' ? 'opacity-40 pointer-events-none' : ''}`}>
                      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-3 font-semibold">Scale</span>
                      <Seg options={[[1, '1×'], [2, '2×']]} value={scale} onChange={setScale} />
                    </div>
                  </div>
                  {/* Focus exports carry a light/dark theme, like the Process Brief;
                      a PDF is one styled landscape page per zone, notes included. */}
                  {sel === 'focus' && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-3 font-semibold">Output theme</span>
                      <Seg
                        options={[
                          ['light', <span key="l" className="inline-flex items-center gap-1.5"><Sun size={13} /> Light</span>],
                          ['dark', <span key="d" className="inline-flex items-center gap-1.5"><Moon size={13} /> Dark</span>],
                        ]}
                        value={focusTheme}
                        onChange={setFocusTheme}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Focus zone picker — choose which zones make it into the export. */}
              {sel === 'focus' && zones.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-ink-3 font-semibold">Zones</span>
                    <button onClick={toggleAllZones} className="text-[11px] text-ink-3 hover:text-ink transition-colors">
                      {allZonesOn ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5 max-h-[168px] overflow-y-auto -mx-1 px-1">
                    {zones.map((z) => {
                      const on = zoneSel.has(z.id)
                      return (
                        <button
                          key={z.id}
                          onClick={() => toggleZone(z.id)}
                          className="flex items-center gap-2.5 text-left rounded-md px-2 py-1.5 hover:bg-[var(--sand-hover)] transition-colors"
                        >
                          <span
                            className="grid place-items-center w-4 h-4 rounded-[4px] shrink-0 border-[0.5px]"
                            style={{
                              borderColor: on ? 'var(--accent)' : 'var(--border-2)',
                              background: on ? 'var(--accent)' : 'transparent',
                            }}
                          >
                            {on && <Check size={11} weight="bold" style={{ color: 'var(--accent-fg)' }} />}
                          </span>
                          <span className="text-[13px] text-ink truncate">{z.name || 'Zone'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t-[0.5px]" style={{ borderColor: 'var(--border)' }}>
              <button onClick={onClose} className="h-8 px-3.5 rounded-md text-[12px] text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors">
                Cancel
              </button>
              <button
                onClick={run}
                disabled={busy || (sel === 'focus' && zoneSel.size === 0)}
                className="h-8 px-4 rounded-md text-[12px] font-medium bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {busy ? 'Exporting…' : 'Export'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-md border-[0.5px] overflow-hidden" style={{ borderColor: 'var(--border-2)' }}>
      {options.map(([v, label], i) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className={`h-[30px] px-3 text-[12px] transition-colors ${i > 0 ? 'border-l-[0.5px]' : ''} ${
            value === v ? 'bg-accent text-accent-fg font-medium' : 'text-ink-2 hover:bg-[var(--sand-hover)]'
          }`}
          style={{ borderColor: 'var(--border-2)' }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
