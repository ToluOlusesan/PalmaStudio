import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { X } from '@phosphor-icons/react'

// A large floating window for Creation Bench tools — bigger than Modal, with a
// titled header and an optional footer action bar. Quiet scrim, surface panel,
// hairline border. Esc / scrim click closes.
export default function ToolWindow({ open, onClose, title, subtitle, icon: Icon, footer, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-[860px] h-[78vh] flex flex-col rounded-[12px] bg-surface overflow-hidden"
            style={{ border: '0.5px solid var(--border-2)' }}
            initial={{ y: 10, opacity: 0, scale: 0.99 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="h-[52px] shrink-0 flex items-center justify-between px-5 border-b-[0.5px]">
              <div className="flex items-center gap-2.5 min-w-0">
                {Icon && (
                  <span className="text-ink-2">
                    <Icon size={17} weight="regular" />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-serif text-[18px] text-ink leading-none">{title}</div>
                  {subtitle && <div className="text-[11px] text-ink-3 mt-0.5 truncate">{subtitle}</div>}
                </div>
              </div>
              <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors -mr-1 p-1">
                <X size={16} weight="regular" />
              </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">{children}</div>

            {footer && (
              <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-t-[0.5px]">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
