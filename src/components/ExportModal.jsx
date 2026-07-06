import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import { useSessionStore } from '../store/sessionStore.js'
import { useFocusStore } from '../store/focusStore.js'
import { saveDataUrl } from '../utils/platform.js'
import { exportBoardImage, boardToPdfDataUri } from '../utils/captureBoard.js'
import { renderFocusBoard, focusBoardPdf, processBriefPdf } from '../utils/focusExport.js'

// Unified export: Dump Board, Focus Board, or a multi-page Process Brief PDF.
// Pre-selects the row matching the view it was opened from (never the Brief).
export default function ExportModal({ open, onClose, context }) {
  const placedCount = useFocusStore((s) => s.placed.length)
  const focusReady = placedCount > 0

  const [sel, setSel] = useState(context === 'moodboard' ? 'focus' : 'dumpboard')
  const [format, setFormat] = useState('png')
  const [scale, setScale] = useState(2)
  const [briefTheme, setBriefTheme] = useState('light')
  const [busy, setBusy] = useState(false)

  // Re-seed the selection each time it opens (context pre-selection; never Brief,
  // and never a disabled row).
  useEffect(() => {
    if (!open) return
    setSel(context === 'moodboard' && focusReady ? 'focus' : 'dumpboard')
    setFormat('png')
    setScale(2)
    setBriefTheme('light')
  }, [open, context, focusReady])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
        if (format === 'pdf') {
          const uri = await focusBoardPdf(fs.zones, fs.placed, fs.queue, scale)
          if (uri) await saveDataUrl('focus-board.pdf', uri, [{ name: 'PDF', extensions: ['pdf'] }])
        } else {
          const url = await renderFocusBoard(fs.zones, fs.placed, fs.queue, { scale, max: scale >= 2 ? 4000 : 2500 })
          if (url) await saveDataUrl('focus-board.png', url, [{ name: 'PNG Image', extensions: ['png'] }])
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
            className="relative w-full max-w-[420px] rounded-[14px] overflow-hidden border-[0.5px]"
            style={{ borderColor: 'var(--border-2)', background: 'var(--surface-modal)' }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.25, 0, 0, 1] }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b-[0.5px]" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-serif text-[18px] text-ink leading-none">Export</h2>
              <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors -mr-1 p-1">
                <X size={15} />
              </button>
            </div>

            <div className="px-3 py-3 flex flex-col gap-1.5">
              <Row
                id="dumpboard"
                title="Dump Board"
                subtitle="Full canvas snapshot"
                active={sel === 'dumpboard'}
                onSelect={() => setSel('dumpboard')}
                controls={<FormatControls format={format} setFormat={setFormat} scale={scale} setScale={setScale} />}
              />
              <Row
                id="focus"
                title="Focus Board"
                subtitle="Zones and references"
                active={sel === 'focus'}
                disabled={!focusReady}
                disabledHint="Add references to Focus first"
                onSelect={() => setSel('focus')}
                controls={<FormatControls format={format} setFormat={setFormat} scale={scale} setScale={setScale} />}
              />
              <Row
                id="brief"
                title="Process Brief"
                subtitle="Dump Board → Focus → Notes"
                active={sel === 'brief'}
                disabled={!focusReady}
                disabledHint="Add references to Focus first"
                onSelect={() => setSel('brief')}
                controls={
                  <div className="flex items-center gap-3">
                    <Seg options={[['light', 'Light'], ['dark', 'Dark']]} value={briefTheme} onChange={setBriefTheme} />
                    <span className="text-[11px] text-ink-3">PDF only</span>
                  </div>
                }
              />
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t-[0.5px]" style={{ borderColor: 'var(--border)' }}>
              <button onClick={onClose} className="h-8 px-3.5 rounded-md text-[12px] text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors">
                Cancel
              </button>
              <button
                onClick={run}
                disabled={busy}
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

function Row({ title, subtitle, active, disabled, disabledHint, onSelect, controls }) {
  return (
    <button
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className={`text-left rounded-[8px] px-3 py-2.5 transition-colors ${disabled ? 'opacity-45 cursor-not-allowed' : 'hover:bg-[var(--sand-hover)]'}`}
      style={{ background: active ? 'rgba(10,10,10,0.04)' : 'transparent' }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="shrink-0 grid place-items-center w-4 h-4 rounded-full border-[1.5px]"
          style={{ borderColor: active ? 'var(--accent)' : 'var(--border-2)' }}
        >
          {active && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] text-ink leading-tight">{title}</div>
          <div className="text-[11px] text-ink-3 leading-tight">{subtitle}</div>
        </div>
      </div>
      {active && <div className="mt-2 pl-[26px]" onClick={(e) => e.stopPropagation()}>{controls}</div>}
    </button>
  )
}

function FormatControls({ format, setFormat, scale, setScale }) {
  return (
    <div className="flex items-center gap-3">
      <Seg options={[['png', 'PNG'], ['pdf', 'PDF']]} value={format} onChange={setFormat} />
      <Seg options={[[1, '1×'], [2, '2×']]} value={scale} onChange={setScale} />
    </div>
  )
}

function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-md border-[0.5px] overflow-hidden" style={{ borderColor: 'var(--border-2)' }}>
      {options.map(([v, label], i) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className={`h-6 px-2.5 text-[11px] transition-colors ${i > 0 ? 'border-l-[0.5px]' : ''} ${
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
