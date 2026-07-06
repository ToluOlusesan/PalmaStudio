import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, MagnifyingGlass, FolderOpen } from '@phosphor-icons/react'
import PageView from '../../components/PageView.jsx'
import Topbar from '../../components/Topbar.jsx'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import ProjectCard from './ProjectCard.jsx'
import { useProjectStore } from '../../store/projectStore.js'
import { isDesktop, pickDirectory, ensureProject, scanProjects, getDefaultProjectDir } from '../../utils/platform.js'

export default function Dashboard() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const projects = useProjectStore((s) => s.projects)
  const createProject = useProjectStore((s) => s.createProject)
  const trashProject = useProjectStore((s) => s.trashProject)
  const importProjects = useProjectStore((s) => s.importProjects)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [query, setQuery] = useState('')
  const [importMsg, setImportMsg] = useState('')

  // The sidebar "New project" button routes here with ?new=1.
  useEffect(() => {
    if (params.get('new')) {
      setCreating(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const sorted = [...projects]
    .filter((p) => !p.deleted)
    .sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened))
  const filtered = query
    ? sorted.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : sorted

  const chooseFolder = async () => {
    const dir = await pickDirectory(`Folder for ${name.trim() || 'this project'}`)
    if (dir) setFolder(dir)
  }

  // Project discovery: scan a chosen folder (and its subfolders) for palma.json
  // and bring those projects onto the dashboard.
  const importFromDisk = async () => {
    const root = await pickDirectory('Choose a folder to scan for Palma projects')
    if (!root) return
    const sessions = await scanProjects(root)
    const added = importProjects(sessions)
    setImportMsg(
      sessions.length ? `Found ${sessions.length} · ${added} new` : 'No projects found here'
    )
    setTimeout(() => setImportMsg(''), 3200)
  }

  const create = async () => {
    let f = folder.trim()
    if (!f && isDesktop()) f = (await getDefaultProjectDir(name.trim() || 'Untitled')) || ''
    const id = createProject(name.trim() || 'Untitled', f)
    if (f) ensureProject(f) // create assets/ scaffold on disk
    setCreating(false)
    setName('')
    setFolder('')
    navigate(`/project/${id}/dumpboard`)
  }

  return (
    <PageView>
      <Topbar
        title="Projects"
        right={
          <>
            {importMsg && <span className="text-[11px] text-ink-3 mr-1">{importMsg}</span>}
            <div className="hidden md:flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-surface-2 border-[0.5px] border-[var(--border)] focus-within:border-[var(--border-2)] transition-colors">
              <MagnifyingGlass size={13} className="text-ink-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="bg-transparent text-[12px] text-ink placeholder:text-ink-3 w-[120px]"
              />
            </div>
            {isDesktop() && (
              <Button icon={FolderOpen} onClick={importFromDisk}>
                Import
              </Button>
            )}
            <Button data-tut="new-project" variant="primary" icon={Plus} iconWeight="bold" onClick={() => setCreating(true)}>
              New project
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-7 py-7">
        {filtered.length === 0 ? (
          <EmptyState hasProjects={sorted.length > 0} onNew={() => setCreating(true)} />
        ) : (
          <motion.div
            className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(170px,1fr))]"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035 } } }}
            initial="hidden"
            animate="show"
          >
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={setConfirmDelete} />
            ))}
          </motion.div>
        )}
      </div>

      {/* New project */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New project"
        footer={
          <>
            <Button onClick={() => { setCreating(false); setFolder('') }}>Cancel</Button>
            <Button variant="primary" onClick={create}>
              Create
            </Button>
          </>
        }
      >
        <label className="block text-[11px] text-ink-2 mb-2">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Untitled"
          className="w-full h-9 px-3 rounded-md bg-surface-2 border-[0.5px] border-[var(--border-2)] text-[13px] text-ink placeholder:text-ink-3 focus:border-[var(--accent)]"
        />

        <label className="block text-[11px] text-ink-2 mt-4 mb-2">Project folder</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-md bg-surface-2 border-[0.5px] border-[var(--border-2)] focus-within:border-[var(--accent)]">
            <FolderOpen size={14} className="text-ink-3 shrink-0" />
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              readOnly={isDesktop()}
              placeholder={isDesktop() ? 'Choose a folder…' : '~/Projects/Palma/amo-y-muerte'}
              spellCheck="false"
              className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-3"
            />
          </div>
          {isDesktop() && (
            <Button onClick={chooseFolder}>Choose…</Button>
          )}
        </div>
        <p className="text-[11px] text-ink-3 font-light mt-2">
          Where this project's assets live. Source files stay here — Palma never moves them.
        </p>
      </Modal>

      {/* Confirm delete — soft delete into Trash, reversible. */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Move to Trash"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                trashProject(confirmDelete.id)
                setConfirmDelete(null)
              }}
            >
              Move to Trash
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2 leading-relaxed font-light">
          Move{' '}
          <span className="font-serif text-ink">{confirmDelete?.name}</span> to the Trash?
          It leaves your projects but nothing is deleted — restore it any time, or purge
          it for good from the Trash. Files on disk are untouched.
        </p>
      </Modal>
    </PageView>
  )
}

function EmptyState({ hasProjects, onNew }) {
  return (
    <div className="h-full min-h-[50vh] grid place-items-center text-center">
      <div className="max-w-[320px]">
        <div className="font-serif text-[28px] text-ink leading-tight mb-2">
          {hasProjects ? 'No matches' : 'Your creative ground'}
        </div>
        <p className="text-[13px] text-ink-3 font-light leading-relaxed mb-5">
          {hasProjects
            ? 'Nothing here by that name.'
            : 'Start a project. Drag in references, video, and notes — everything in one session.'}
        </p>
        {!hasProjects && (
          <Button variant="primary" icon={Plus} iconWeight="bold" onClick={onNew}>
            New project
          </Button>
        )}
      </div>
    </div>
  )
}
