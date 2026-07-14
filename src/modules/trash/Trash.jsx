import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowCounterClockwise, Trash as TrashIcon, Warning, Eye, FolderOpen, X, ImageBroken, VideoCamera, Play } from '@phosphor-icons/react'
import PageView from '../../components/PageView.jsx'
import Topbar from '../../components/Topbar.jsx'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import { useProjectStore } from '../../store/projectStore.js'
import { isDesktop, isElectron, openPath } from '../../utils/platform.js'
import { sessionIO } from '../../utils/sessionIO.js'
import { relativeDate, thumbTint, seededColor } from '../../utils/format.js'

// Collect a trashed project's image/video assets straight from its saved
// session — a quick 'what was in here' glance without restoring it first.
// De-duped by source id so the same reference placed twice shows once.
function projectAssets(projectId) {
  const session = sessionIO.readSession(projectId)
  if (!session) return []
  const items = [
    ...(session.modules?.dumpboard?.items || []),
    ...(session.modules?.moodboard?.items || []),
  ]
  const seen = new Set()
  const out = []
  for (const it of items) {
    if (it.type !== 'image' && it.type !== 'video') continue
    const key = it.sourceId || it.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

// Trash — soft-deleted projects live here, out of the way of the dashboard.
// Restore drops one back onto the board; Purge removes it for good, with an
// opt-in to also wipe its images from the Library (its assets/ folder) and,
// escalating from that, its whole project folder on disk.
export default function Trash() {
  const projects = useProjectStore((s) => s.projects)
  const restoreProject = useProjectStore((s) => s.restoreProject)
  const purgeProject = useProjectStore((s) => s.purgeProject)

  const [purging, setPurging] = useState(null) // project awaiting purge confirmation
  const [preview, setPreview] = useState(null) // trashed project whose assets are shown

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
                  onPreview={() => setPreview(p)}
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

      {preview && <PreviewModal project={preview} onClose={() => setPreview(null)} />}
    </PageView>
  )
}

function TrashRow({ project, onPreview, onRestore, onPurge }) {
  const swatch = thumbTint(project.thumbColor) || project.palette?.[0] || seededColor(project.name)
  const canReveal = isElectron() && project.folder
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
      {canReveal && (
        <Button variant="ghost" icon={FolderOpen} title="Reveal in Explorer" onClick={() => openPath(project.folder)} />
      )}
      <Button icon={Eye} onClick={onPreview}>
        Preview
      </Button>
      <Button icon={ArrowCounterClockwise} onClick={onRestore}>
        Restore
      </Button>
      <Button icon={TrashIcon} onClick={onPurge}>
        Purge
      </Button>
    </motion.div>
  )
}

// Read-only look at what a trashed project holds — an asset grid; click any
// thumbnail to open it full-size. Purely for posterity, before deciding whether
// to restore or purge.
function PreviewModal({ project, onClose }) {
  const assets = useMemo(() => projectAssets(project.id), [project.id])
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (lightbox ? setLightbox(null) : onClose())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, onClose])

  return (
    <div className="fixed inset-0 z-[140] flex flex-col" style={{ background: 'rgba(8,8,8,0.72)' }} onClick={onClose}>
      <motion.div
        className="m-auto w-[min(880px,92vw)] max-h-[86vh] flex flex-col rounded-[14px] border-[0.5px] overflow-hidden"
        style={{ borderColor: 'var(--border-2)', background: 'var(--surface-modal)' }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15, ease: [0.25, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b-[0.5px] shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0">
            <div className="font-serif text-[16px] text-ink truncate">{project.name}</div>
            <div className="text-[11px] text-ink-3">
              {assets.length} {assets.length === 1 ? 'asset' : 'assets'} · deleted {relativeDate(project.deleted)}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink transition-colors -mr-1 p-1">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {assets.length === 0 ? (
            <div className="min-h-[30vh] grid place-items-center text-center">
              <p className="text-[13px] text-ink-3 font-light max-w-[280px]">
                No images or videos in this project — its notes and layout are still here if you restore it.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
              {assets.map((a) => (
                <PreviewThumb key={a.id} asset={a} onOpen={() => setLightbox(a)} />
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {lightbox && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-10" style={{ background: 'rgba(6,6,6,0.9)' }} onClick={() => setLightbox(null)}>
          <div className="max-w-[90vw] max-h-[84vh]" onClick={(e) => e.stopPropagation()}>
            {lightbox.type === 'image' ? (
              <img src={lightbox.src} alt={lightbox.label} className="max-w-full max-h-[84vh] object-contain rounded-[6px]" />
            ) : (
              <video src={lightbox.src} controls autoPlay className="max-w-full max-h-[84vh] rounded-[6px]" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// One preview cell — static thumbnail (poster for videos), falling back to a
// placeholder when the source didn't survive (e.g. a dead object URL).
function PreviewThumb({ asset, onOpen }) {
  const [broken, setBroken] = useState(false)
  const isVideo = asset.type === 'video'
  const thumbSrc = isVideo ? asset.poster : asset.src
  return (
    <button
      onClick={onOpen}
      title={asset.label}
      className="group relative aspect-square rounded-[8px] overflow-hidden border-[0.5px] border-[var(--border)] bg-surface-2 hover:border-[var(--border-2)] transition-colors cursor-zoom-in"
    >
      {!thumbSrc || broken ? (
        <div className="w-full h-full grid place-items-center bg-surface text-ink-3">
          {isVideo ? <VideoCamera size={20} /> : <ImageBroken size={18} />}
        </div>
      ) : (
        <img src={thumbSrc} alt={asset.label} loading="lazy" decoding="async" onError={() => setBroken(true)} className="w-full h-full object-cover" />
      )}
      {isVideo && (
        <span className="absolute bottom-1 right-1 grid place-items-center w-5 h-5 rounded-full bg-[rgba(10,10,10,0.6)] pointer-events-none">
          <Play size={10} weight="fill" className="text-white/90" />
        </span>
      )}
    </button>
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
