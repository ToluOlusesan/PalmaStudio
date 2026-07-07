import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { DotsThree, PencilSimple, FolderOpen, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import Thumb from '../../components/Thumb.jsx'
import ContextMenu from '../../components/ContextMenu.jsx'
import { useProjectStore } from '../../store/projectStore.js'
import { isElectron, openPath } from '../../utils/platform.js'
import { relativeDate, seededGradient, THUMB_TINTS } from '../../utils/format.js'

// Portrait project card. 3:4 full-bleed thumbnail + hairline meta strip.
// Rises + fades in on mount (the parent grid staggers these), and hover lifts
// 2px while lightening the border (150ms ease).
const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } },
}

export default function ProjectCard({ project, onDelete }) {
  const navigate = useNavigate()
  const updateProject = useProjectStore((s) => s.updateProject)
  const renameProject = useProjectStore((s) => s.renameProject)
  const [menu, setMenu] = useState(false)
  const [ctx, setCtx] = useState(null) // { x, y } right-click menu
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')

  const setTint = (key) => {
    updateProject(project.id, { thumbColor: key })
    setMenu(false)
  }

  const startRename = () => {
    setDraft(project.name || '')
    setRenaming(true)
  }
  const commitRename = () => {
    const name = draft.trim()
    if (name && name !== project.name) renameProject(project.id, name)
    setRenaming(false)
  }

  return (
    <motion.div
      className="group relative rounded-[8px] overflow-hidden bg-surface-2 cursor-pointer"
      style={{ border: '0.5px solid var(--border)' }}
      variants={cardVariants}
      whileHover={{ y: -2, borderColor: 'rgba(10,10,10,0.2)' }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onClick={() => {
        if (ctx || renaming) return
        navigate(`/project/${project.id}/dumpboard`)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu(false)
        setCtx({ x: e.clientX, y: e.clientY })
      }}
    >
      <div className="aspect-[3/4] overflow-hidden">
        <Thumb project={project} />
      </div>

      {/* per-card menu */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          setMenu((v) => !v)
        }}
        className="absolute top-2 right-2 w-6 h-6 grid place-items-center rounded-md bg-[rgba(10,10,10,0.7)] text-white/80 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity backdrop-blur-sm"
      >
        <DotsThree size={16} weight="bold" />
      </button>
      {menu && (
        <div
          className="absolute top-9 right-2 z-10 rounded-md bg-surface-3 border-[0.5px] py-1.5 min-w-[168px]"
          style={{ borderColor: 'var(--border-2)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 pb-1">
            <div className="text-[10px] uppercase tracking-[0.1em] text-ink-3 mb-1.5">Colour</div>
            <div className="flex flex-wrap gap-1.5">
              {/* Auto (clear override) — previews the chip's palette fallback */}
              <button
                title="Default (auto)"
                onClick={() => setTint(null)}
                className="w-5 h-5 rounded-full border-[0.5px] border-[var(--border-2)] transition-transform hover:scale-110"
                style={{
                  background: project.palette?.[0] || seededGradient(project.id || project.name),
                  outline: !project.thumbColor ? '2px solid var(--ink)' : 'none',
                  outlineOffset: '1px',
                }}
              />
              {THUMB_TINTS.map((t) => (
                <button
                  key={t.key}
                  title={t.label}
                  onClick={() => setTint(t.key)}
                  className="w-5 h-5 rounded-full border-[0.5px] border-[var(--border-2)] transition-transform hover:scale-110"
                  style={{
                    background: t.css,
                    outline: project.thumbColor === t.key ? '2px solid var(--ink)' : 'none',
                    outlineOffset: '1px',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="my-1 border-t-[0.5px]" style={{ borderColor: 'var(--border)' }} />
          <button
            className="w-full text-left px-3 py-1.5 text-[12px] text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)]"
            onClick={() => {
              setMenu(false)
              onDelete?.(project)
            }}
          >
            Delete
          </button>
        </div>
      )}

      <div
        className="px-3 pt-2.5 pb-3 border-t-[0.5px]"
        style={{ borderColor: 'var(--border)' }}
      >
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') setRenaming(false)
            }}
            className="w-full font-serif text-[13px] text-ink leading-tight bg-transparent border-b-[0.5px] border-[var(--accent)] outline-none"
          />
        ) : (
          <div className="font-serif text-[13px] text-ink truncate leading-tight">
            {project.name || 'Untitled'}
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
          <span>{relativeDate(project.lastOpened)}</span>
          {project.refCount > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span>{project.refCount} refs</span>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {ctx && (
          <ContextMenu
            key="project-menu"
            x={ctx.x}
            y={ctx.y}
            items={[
              { label: 'Rename', icon: PencilSimple, onClick: startRename },
              ...(isElectron() && project.folder
                ? [{ label: 'Reveal in Explorer', icon: FolderOpen, onClick: () => openPath(project.folder) }]
                : []),
              { separator: true },
              { label: 'Delete', icon: Trash, danger: true, onClick: () => onDelete?.(project) },
            ]}
            onClose={() => setCtx(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
