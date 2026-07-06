import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { X } from '@phosphor-icons/react'

// Minimal centred modal. Quiet scrim, surface panel, hairline border. Used for
// new-project naming and confirm-delete. Esc / scrim click closes.
export default function Modal({ open, onClose, title, children, footer }) {
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
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-[380px] rounded-[12px] border-[0.5px] overflow-hidden"
            style={{ borderColor: 'var(--border-2)', background: 'var(--surface-modal)', boxShadow: 'var(--shadow-lifted)' }}
            initial={{ y: 8, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 6, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {title && (
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b-[0.5px]">
                <h2 className="font-serif text-[18px] text-ink leading-none">{title}</h2>
                <button
                  onClick={onClose}
                  className="text-ink-3 hover:text-ink transition-colors -mr-1 p-1"
                >
                  <X size={15} weight="regular" />
                </button>
              </div>
            )}
            <div className="px-5 py-4">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t-[0.5px]">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
