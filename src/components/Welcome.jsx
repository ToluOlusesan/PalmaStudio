import { motion } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'
import Logo from './Logo.jsx'
import Button from './Button.jsx'
import { useSettingsStore } from '../store/settingsStore.js'

// First-launch welcome — a quiet brand moment. Folders are chosen per project
// when you create one, so this just sets the tone and enters the app.
export default function Welcome() {
  const complete = useSettingsStore((s) => s.completeOnboarding)

  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-items-center bg-[var(--bg)] px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <motion.div
        className="w-full max-w-[400px] text-center"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      >
        <span className="inline-block text-accent mb-6">
          <Logo width={72} height={56} />
        </span>
        <h1 className="font-serif text-[36px] text-ink leading-tight">Welcome to Palma</h1>
        <p className="text-[13px] text-ink-2 font-light leading-relaxed mt-3 mb-9 max-w-[330px] mx-auto">
          Your creative ground. Gather references, video, and notes for a project in one
          quiet place. Each project points at its own folder on disk — your source files
          stay where they are, in your hands.
        </p>
        <Button variant="primary" icon={ArrowRight} iconRight onClick={complete}>
          Enter Palma
        </Button>
      </motion.div>
    </motion.div>
  )
}
