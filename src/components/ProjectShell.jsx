import { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Check, CircleNotch } from '@phosphor-icons/react'
import PageView from './PageView.jsx'
import Topbar from './Topbar.jsx'
import ModuleTabBar from './ModuleTabBar.jsx'
import ExportModal from './ExportModal.jsx'
import { useProjectStore } from '../store/projectStore.js'
import { useSession } from '../hooks/useSession.js'

import DumpBoard from '../modules/dumpboard/DumpBoard.jsx'
import MoodBoard from '../modules/moodboard/MoodBoard.jsx'
import Scratchpad from '../modules/scratchpad/Scratchpad.jsx'

// Motion Refs and Bento are dropped from the product. Project Skin is no longer
// a standalone tab — it lives as the Skin panel inside the Focus area; the
// `projectskin` route now redirects there (see below). Their files/slots may
// linger but they're not wired here.
const TABS = [
  { key: 'dumpboard', label: 'Dump Board' },
  { key: 'moodboard', label: 'Focus' },
  { key: 'scratchpad', label: 'Scratchpad' },
]

const REGISTRY = {
  dumpboard: DumpBoard,
  moodboard: MoodBoard,
  scratchpad: Scratchpad,
}

function SaveStatus({ status }) {
  if (status === 'saved')
    return (
      <span className="flex items-center gap-1 text-[11px] text-ink-3">
        <Check size={12} weight="bold" /> Saved
      </span>
    )
  if (status === 'saving')
    return (
      <span className="flex items-center gap-1 text-[11px] text-ink-3">
        <CircleNotch size={12} className="animate-spin" /> Saving
      </span>
    )
  return <span className="text-[11px] text-ink-3">Editing…</span>
}

export default function ProjectShell() {
  const { id, module } = useParams()
  const navigate = useNavigate()
  const openProject = useProjectStore((s) => s.openProject)
  const project = useProjectStore((s) => s.projectById(id))

  // bump lastOpened once when entering the project
  useEffect(() => {
    if (project) openProject(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const { session, status } = useSession(id, module)
  const [exportOpen, setExportOpen] = useState(false)

  // Project Skin merged into the Focus area — redirect its old route there.
  if (module === 'projectskin') return <Navigate to={`/project/${id}/moodboard`} replace />
  if (!REGISTRY[module]) return <Navigate to={`/project/${id}/dumpboard`} replace />
  if (!project && !session) return <Navigate to="/dashboard" replace />

  const Module = REGISTRY[module]
  const name = project?.name || session?.name || 'Untitled'

  return (
    <PageView>
      <Topbar
        crumbs={[
          { label: 'Projects', to: '/dashboard' },
          { label: name },
        ]}
        right={<SaveStatus status={status} />}
      />
      <ModuleTabBar projectId={id} tabs={TABS} />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <Module projectId={id} onOpenExport={() => setExportOpen(true)} />
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} context={module} />
    </PageView>
  )
}
