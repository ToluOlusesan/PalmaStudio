import { useEffect, useState } from 'react'
import { useLocation, matchPath } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Spotlight from './tutorial/Spotlight.jsx'
import { useSettingsStore } from '../store/settingsStore.js'

// The tutorial controller. One-time, context-aware coachmarks: on first launch
// it teaches creating a project (on the Dashboard), then teaches each module's
// controls the first time that module is opened. Each tip shows once (tracked in
// settingsStore.seenTips) and spotlights the real UI element it's about.

// tip id → { scene, title, bullets, selector (the live element to spotlight),
// match (route test), label }. `selector` targets a data-tut attribute added to
// the real control in the app.
const TIPS = [
  {
    id: 'project',
    scene: 'project',
    label: 'Getting started',
    title: 'Create your first project',
    bullets: [
      'Click New project to begin.',
      'Give it a name and point it at a folder on disk.',
      'Your source files stay where they are — Palma only references them.',
    ],
    selector: '[data-tut="new-project"]',
    test: (p) => p === '/dashboard',
  },
  {
    id: 'dumpboard',
    scene: 'dumpboard',
    label: 'Dump Board',
    title: 'Your creative inbox',
    bullets: [
      'Drag in images and video, or paste screenshots and links.',
      'Double-click for a note; drag the top dot to connect items.',
      'Select a few and hit Tidy to auto-arrange the pile.',
      'Right-click a reference → Send to Focus (or Ctrl F).',
    ],
    selector: '[data-tut="dump-toolbar"]',
    test: (p) => !!matchPath('/project/:id/dumpboard', p),
  },
  {
    id: 'focus',
    scene: 'focus',
    label: 'Focus',
    title: 'Sort into a direction',
    bullets: [
      'Add Zone to group references — by colour, texture, motion…',
      'Drag cards from the Queue on the right into a zone.',
      'Pin a comment to a zone, and set the Direction up top.',
    ],
    selector: '[data-tut="focus-toolbar"]',
    test: (p) => !!matchPath('/project/:id/moodboard', p),
  },
  {
    id: 'scratchpad',
    scene: 'scratchpad',
    label: 'Notes',
    title: 'Write the brief',
    bullets: [
      'A per-project notebook, right beside the board.',
      'Format with the bar: bold, italic, quotes, lists, and checklists.',
      'It autosaves and flows into the exported Process Brief.',
    ],
    selector: '[data-tut="scratch-toolbar"]',
    test: (p) => !!matchPath('/project/:id/scratchpad', p),
  },
  {
    id: 'library',
    scene: 'library',
    label: 'Library',
    title: 'Every asset, one shelf',
    bullets: [
      "Every project's images and video, gathered in one place.",
      'Search and filter by type.',
      'Hover an asset and Export it into any project.',
    ],
    selector: '[data-tut="library-controls"]',
    test: (p) => p === '/library',
  },
]

export default function Tutorial() {
  const location = useLocation()
  const onboarded = useSettingsStore((s) => s.onboarded)
  const tipsOff = useSettingsStore((s) => s.tipsOff)
  const seenTips = useSettingsStore((s) => s.seenTips)
  const markTipSeen = useSettingsStore((s) => s.markTipSeen)
  const skipTips = useSettingsStore((s) => s.skipTips)

  // The tip that applies to the current route (if any, and not yet seen).
  const active = TIPS.find((t) => t.test(location.pathname))

  // Small settle delay so the view has mounted before we spotlight it (and so
  // the tip doesn't flash over the welcome splash on first launch).
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(false)
    if (!active) return
    const t = setTimeout(() => setReady(true), 450)
    return () => clearTimeout(t)
  }, [active?.id])

  const show = onboarded && !tipsOff && ready && active && !seenTips[active.id]

  return (
    <AnimatePresence>
      {show && (
        <Spotlight
          key={active.id}
          scene={active.scene}
          step={{ label: active.label, selector: active.selector }}
          title={active.title}
          bullets={active.bullets}
          onDismiss={() => markTipSeen(active.id)}
          onSkip={skipTips}
        />
      )}
    </AnimatePresence>
  )
}
