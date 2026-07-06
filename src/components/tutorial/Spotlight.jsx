import { useLayoutEffect, useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, ArrowRight } from '@phosphor-icons/react'
import TutorialScene from './scenes.jsx'

// A single coachmark: dims the whole window except a cutout around the target
// element (the live control being taught), and floats a card — animated
// caricature + control notes — beside it. The cutout is a transparent box with a
// huge spread shadow, so the real control stays lit and even clickable while
// everything else is dimmed.

const CARD_W = 340
const GAP = 16 // space between cutout and card
const MARGIN = 12 // keep the card this far from the viewport edges
const PAD = 8 // cutout padding around the target

// Choose where the card sits relative to the target, and clamp to the viewport.
function place(rect, cardH, vw, vh) {
  if (!rect) {
    return { left: (vw - CARD_W) / 2, top: (vh - cardH) / 2 }
  }
  const below = rect.bottom + GAP + cardH <= vh - MARGIN
  const above = rect.top - GAP - cardH >= MARGIN
  const right = rect.right + GAP + CARD_W <= vw - MARGIN

  let top
  let left
  if (below || above) {
    top = below ? rect.bottom + GAP : rect.top - GAP - cardH
    left = rect.left + rect.width / 2 - CARD_W / 2
  } else {
    left = right ? rect.right + GAP : rect.left - GAP - CARD_W
    top = rect.top + rect.height / 2 - cardH / 2
  }
  left = Math.min(Math.max(left, MARGIN), vw - CARD_W - MARGIN)
  top = Math.min(Math.max(top, MARGIN), vh - cardH - MARGIN)
  return { left, top }
}

export default function Spotlight({ scene, step, title, bullets, onDismiss, onSkip }) {
  const [rect, setRect] = useState(null)
  const cardRef = useRef(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })

  // Track the target rect. The controller passes it via a data attribute lookup
  // done here so a late-mounting toolbar is still found and re-measured on resize.
  const targetSel = step?.selector
  useLayoutEffect(() => {
    let raf
    let tries = 0
    const measure = () => {
      const el = targetSel ? document.querySelector(targetSel) : null
      if (el) {
        setRect(el.getBoundingClientRect())
      } else if (tries++ < 90) {
        raf = requestAnimationFrame(measure) // wait for the module to mount
        return
      } else {
        setRect(null) // give up → centred card, full dim
      }
    }
    measure()
    const onResize = () => {
      const el = targetSel ? document.querySelector(targetSel) : null
      setRect(el ? el.getBoundingClientRect() : null)
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [targetSel])

  // Position the card once it (and the target) are measured.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight || 300
    setPos(place(rect, h, window.innerWidth, window.innerHeight))
  }, [rect, bullets, title])

  // Esc dismisses.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  const cut = rect
    ? {
        left: rect.left - PAD,
        top: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label={title}>
      {/* Dim + cutout. When there's no target, a plain full-screen scrim. The
          cutout div has pointer-events:none so the highlighted control beneath
          stays interactive. */}
      {cut ? (
        <motion.div
          className="absolute rounded-[10px] pointer-events-none"
          style={{
            left: cut.left,
            top: cut.top,
            width: cut.width,
            height: cut.height,
            boxShadow: '0 0 0 9999px rgba(10,10,10,0.62)',
            outline: '2px solid rgba(255,255,255,0.9)',
            outlineOffset: 2,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : (
        <motion.div
          className="absolute inset-0"
          style={{ background: 'rgba(10,10,10,0.62)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}

      {/* Teaching card */}
      <motion.div
        ref={cardRef}
        className="absolute rounded-[14px] overflow-hidden pointer-events-auto"
        style={{
          left: pos.left,
          top: pos.top,
          width: CARD_W,
          background: 'var(--surface-modal)',
          border: '0.5px solid var(--border-2)',
          boxShadow: '0 12px 40px -8px rgba(0,0,0,0.4)',
        }}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Animated caricature — always a light art panel so it reads in any theme */}
        <div className="relative aspect-[16/9] overflow-hidden" style={{ background: '#f2f2f2', borderBottom: '0.5px solid var(--border-2)' }}>
          <TutorialScene id={scene} />
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="absolute top-2 right-2 grid place-items-center w-6 h-6 rounded-full text-[#0a0a0a]/50 hover:text-[#0a0a0a] transition-colors"
            style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)' }}
          >
            <X size={13} weight="bold" />
          </button>
        </div>

        <div className="p-5">
          {step?.label && (
            <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-1.5">{step.label}</div>
          )}
          <h3 className="font-serif text-[19px] text-ink leading-tight">{title}</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] text-ink-2 leading-relaxed">
                <span className="mt-[6px] w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--ink-3)' }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-between">
            <button onClick={onSkip} className="text-[11px] text-ink-3 hover:text-ink-2 transition-colors">
              Skip tour
            </button>
            <button
              onClick={onDismiss}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-accent text-accent-fg text-[12px] font-medium hover:opacity-90 transition-opacity active:scale-[0.98]"
            >
              Got it <ArrowRight size={13} weight="bold" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
