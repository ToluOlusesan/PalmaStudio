import { motion } from 'framer-motion'

// Wraps a routed view in a 160ms fade-in on mount. No exit fade — pages are
// swapped instantly so switching projects doesn't show a blank gap while the old
// view animates out (see App.jsx; this pairs with dropping mode="wait").
// Collapses to instant under prefers-reduced-motion (handled globally in CSS).
export default function PageView({ children, className = '' }) {
  return (
    <motion.div
      className={`flex-1 min-h-0 flex flex-col overflow-hidden ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
