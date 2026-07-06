import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import AppLayout from './components/AppLayout.jsx'
import Welcome from './components/Welcome.jsx'
import Dashboard from './modules/dashboard/Dashboard.jsx'
import Library from './modules/library/Library.jsx'
import Trash from './modules/trash/Trash.jsx'
import ProjectShell from './components/ProjectShell.jsx'
import { useSettingsStore } from './store/settingsStore.js'
import { useSessionStore } from './store/sessionStore.js'

// Top-level routing. The shell (sidebar) is persistent; only the main column
// swaps. New views fade in on mount; we deliberately do NOT use mode="wait" (it
// fully fades the old view out before mounting the new one, which reads as a
// blank pause before a project loads) — the old view is dropped at once and the
// new one fades straight in.
export default function App() {
  const location = useLocation()
  const onboarded = useSettingsStore((s) => s.onboarded)
  const darkMode = useSettingsStore((s) => s.darkMode)

  // App-wide dark theme: mirror the persisted setting onto <html> so every
  // token-based surface flips. This is user-controlled (sidebar switch) and
  // sticky across routes — the Focus board only *dims* (see MoodBoard), it no
  // longer forces a theme change, so navigating never flashbangs.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Persist immediately when the window is closing/hidden — the 2s autosave
  // debounce otherwise loses any change made just before quitting (the cause of
  // testers' "nothing saves"). flush() is a synchronous localStorage write.
  useEffect(() => {
    const save = () => {
      try {
        useSessionStore.getState().flush()
      } catch {
        /* nothing to flush */
      }
    }
    window.addEventListener('beforeunload', save)
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save()
    })
    return () => {
      window.removeEventListener('beforeunload', save)
      window.removeEventListener('pagehide', save)
    }
  }, [])

  return (
    <AppLayout>
      <AnimatePresence>{!onboarded && <Welcome key="welcome" />}</AnimatePresence>
      <AnimatePresence>
        <Routes location={location} key={location.pathname.split('/').slice(0, 3).join('/')}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/library" element={<Library />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/project/:id" element={<Navigate to="dumpboard" replace />} />
          <Route path="/project/:id/:module" element={<ProjectShell />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AnimatePresence>
    </AppLayout>
  )
}
