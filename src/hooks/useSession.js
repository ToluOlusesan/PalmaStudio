import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore.js'
import { useCanvasStore } from '../store/canvasStore.js'
import { useFocusStore } from '../store/focusStore.js'
import { useProjectStore } from '../store/projectStore.js'
import { captureBoard } from '../utils/captureBoard.js'

const CANVAS_MODULES = ['dumpboard', 'moodboard']

// On leaving a project, refresh its dashboard card: the ref count and a real
// thumbnail captured from the Dump Board. Object URLs are still live during SPA
// navigation, so capture now (async; written back once ready).
function recordSnapshot(projectId) {
  const { session } = useSessionStore.getState()
  if (!session) return
  const items = session.modules?.dumpboard?.items || []
  if (items.length === 0) return
  const refCount = items.filter((it) => it.type !== 'note').length
  useProjectStore.getState().updateProject(projectId, { refCount })

  captureBoard(items).then((thumbnail) => {
    if (thumbnail) useProjectStore.getState().updateProject(projectId, { thumbnail })
  })
}

// Binds a project + module to the session lifecycle: load on mount/param change,
// and on canvas modules, schedule a debounced save whenever items/view change.
export function useSession(projectId, moduleKey) {
  const loadSession = useSessionStore((s) => s.loadSession)
  const switchModule = useSessionStore((s) => s.switchModule)
  const scheduleSave = useSessionStore((s) => s.scheduleSave)
  const flush = useSessionStore((s) => s.flush)
  const session = useSessionStore((s) => s.session)
  const status = useSessionStore((s) => s.status)

  // Load when the project changes; switch board when only the module changes.
  useEffect(() => {
    const { currentId } = useSessionStore.getState()
    if (currentId !== projectId) loadSession(projectId, moduleKey)
    else switchModule(moduleKey)
    // flush pending saves and refresh the dashboard card snapshot on leave.
    return () => {
      flush()
      recordSnapshot(projectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, moduleKey])

  // Keep the Focus board (zones / queue / placed) hydrated for the open project
  // so Send-to-Focus and the "sent" indicator work even from the Dump Board.
  useEffect(() => {
    if (session) useFocusStore.getState().loadFromSession(session)
  }, [session?.id])

  // Autosave: subscribe to canvas mutations on canvas-backed modules.
  useEffect(() => {
    if (!CANVAS_MODULES.includes(moduleKey)) return
    let first = true
    const unsub = useCanvasStore.subscribe((state, prev) => {
      if (first) {
        first = false
        return
      }
      if (
        state.items !== prev.items ||
        state.edges !== prev.edges ||
        state.panX !== prev.panX ||
        state.panY !== prev.panY ||
        state.zoom !== prev.zoom
      ) {
        scheduleSave()
      }
    })
    return unsub
  }, [moduleKey, scheduleSave])

  return { session, status }
}
