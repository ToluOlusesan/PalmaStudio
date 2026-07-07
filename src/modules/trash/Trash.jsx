import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowCounterClockwise, Trash as TrashIcon, Warning } from '@phosphor-icons/react'
import PageView from '../../components/PageView.jsx'
import Topbar from '../../components/Topbar.jsx'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import { useProjectStore } from '../../store/projectStore.js'
import { isDesktop } from '../../utils/platform.js'
import { relativeDate, thumbTint, seededColor } from '../../utils/format.js'

// Trash — soft-deleted projects live here, out of the way of the dashboard.
// Restore drops one back onto the board; Purge removes it for good, with an
// opt-in to also wipe its images from the Library (its assets/ folder) and,
// escalating from that, its whole project folder on disk.
export default function Trash() {
  const projects = useProjectStore((s) => s.projects)
  const restoreProject = useProjectStore((s) => s.restoreProject)
  const purgeProject = useProjectStore((s) => s.purgeProject)

  const [purging, setPurging] = useState(null) // project awaiting purge confirmation

  const trashed = [...projects]
    .filter((p) => p.deleted)
    .sort((a, b) => new Date(b.deleted) - new Date(a.deleted))

  return (
    <PageView>
      <Topbar title="Trash" />

      <div className="flex-1 overflow-y-auto px-7 py-7">
        {trashed.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <p className="text-[12px] text-ink-3 font-light mb-4 max-w-[560px]">
              Deleted projects rest here. Restore one to bring it back, or purge it to
              remove it for good — you choose whether its files on disk go too.
            </p>
            <motion.div
              className="flex flex-col gap-2 max-w-[640px]"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
              initial="hidden"
              animate="show"
            >
              {trashed.map((p) => (
                <TrashRow
                  key={p.id}
                  project={p}
                  onRestore={() => restoreProject(p.id)}
                  onPurge={() => setPurging(p)}
                />
              ))}
            </motion.div>
          </>
        )}
      </div>

      <PurgeModal
        project={purging}
        onClose={() => setPurging(null)}
        onConfirm={(opts) => {
          purgeProject(purging.id, opts)
          setPurging(null)
        }}
      />
    </PageView>
  )
}

function TrashRow({ project, onRestore, onPurge }) {
  const swatch = thumbTint(project.thumbColor) || project.palette?.[0] || seededColor(project.name)
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
      className="flex items-center gap-3 h-14 px-3 rounded-lg bg-surface-2 border-[0.5px] border-[var(--border)]"
    >
      <span
        className="block w-8 h-8 rounded-[5px] shrink-0"
        style={{ background: swatch, border: '0.5px solid var(--border-2)' }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink font-medium truncate">{project.name}</div>
        <div className="text-[11px] text-ink-3 truncate">
          Deleted {relativeDate(project.deleted)}
          {project.folder ? ` · ${project.folder}` : ''}
        </div>
      </div>
      <Button icon={ArrowCounterClockwise} onClick={onRestore}>
        Restore
      </Button>
      <Button icon={TrashIcon} onClick={onPurge}>
        Purge
      </Button>
    </motion.div>
  )
}

// Purge confirmation — two escalating, opt-in disk wipes. Both default OFF so a
// plain purge only forgets the project (removes the session), leaving every file
// on disk. Checking "wipe from disk" is what removes the whole folder.
function PurgeModal({ project, onClose, onConfirm }) {
  const [wipeAssets, setWipeAssets] = useState(false)
  const [wipeFolder, setWipeFolder] = useState(false)
  const desktop = isDesktop()

  // Reset the opt-in wipes each time a fresh project opens the modal, so choices
  // never carry over from a previous purge. (The modal stays mounted for its
  // exit animation, so we key off the project id rather than remounting.)
  useEffect(() => {
    if (project) {
      setWipeAssets(false)
      setWipeFolder(false)
    }
  }, [project?.id])

  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title="Purge project"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={TrashIcon}
            onClick={() => onConfirm({ wipeAssets: wipeAssets || wipeFolder, wipeFolder })}
          >
            Purge for good
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-ink-2 leading-relaxed font-light">
        Permanently remove{' '}
        <span className="font-serif text-ink">{project?.name}</span> from Palma? This can't
        be undone.
      </p>

      {desktop && project?.folder && (
        <div className="mt-4 flex flex-col gap-2">
          <Check
            checked={wipeAssets || wipeFolder}
            disabled={wipeFolder}
            onChange={setWipeAssets}
            label="Wipe its images from the Library"
            hint="Deletes the media copied into this project's assets folder."
          />
          <Check
            checked={wipeFolder}
            onChange={(v) => {
              setWipeFolder(v)
              if (v) setWipeAssets(true)
            }}
            label="Also delete its whole folder from disk"
            hint={project?.folder}
          />
        </div>
      )}

      {wipeFolder && (
        <div
          className="mt-3 flex items-start gap-2 rounded-md px-2.5 py-2 text-[11px] text-ink-2 leading-relaxed"
          style={{ background: 'var(--warning-bg)', border: '0.5px solid var(--warning-border)' }}
        >
          <Warning size={14} weight="fill" className="shrink-0 mt-px text-ink" />
          <span>
            Everything inside this folder is erased, including any files you added there
            yourself. Files kept elsewhere on disk are untouched.
          </span>
        </div>
      )}
    </Modal>
  )
}

function Check({ checked, onChange, disabled, label, hint }) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-md px-2.5 py-2 border-[0.5px] cursor-pointer transition-colors ${
        checked ? 'bg-surface-3' : 'hover:bg-[var(--sand-hover)]'
      } ${disabled ? 'opacity-55 pointer-events-none' : ''}`}
      style={{ borderColor: checked ? 'var(--warning-border)' : 'var(--border)' }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[12px] text-ink leading-tight">{label}</span>
        {hint && <span className="block text-[11px] text-ink-3 truncate mt-0.5">{hint}</span>}
      </span>
    </label>
  )
}

function EmptyState() {
  return (
    <div className="h-full min-h-[50vh] grid place-items-center text-center">
      <div className="max-w-[320px]">
        <span className="inline-grid place-items-center w-11 h-11 rounded-full bg-surface-3 text-ink-3 mb-3">
          <TrashIcon size={20} weight="regular" />
        </span>
        <div className="font-serif text-[24px] text-ink leading-tight mb-2">Trash is empty</div>
        <p className="text-[13px] text-ink-3 font-light leading-relaxed">
          Deleted projects land here so you can restore them — or clear them out for good.
        </p>
      </div>
    </div>
  )
}
