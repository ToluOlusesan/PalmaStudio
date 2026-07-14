import { useMemo, useState, useDeferredValue, memo, useRef, useEffect } from 'react'
import { Stack, MagnifyingGlass, ImageBroken, X, Export, VideoCamera, Play } from '@phosphor-icons/react'
import PageView from '../../components/PageView.jsx'
import Topbar from '../../components/Topbar.jsx'
import { useProjectStore } from '../../store/projectStore.js'
import { sessionIO } from '../../utils/sessionIO.js'
import { appendBoardItem } from '../../utils/boardOps.js'
import { isDiskPath, copyAsset, saveAsset, toAssetUrl } from '../../utils/platform.js'
import { basename } from '../../utils/pathUtils.js'
import { uid } from '../../utils/id.js'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Video' },
]

// Library — a cross-project asset shelf and consolidator. Sweeps every project's
// session for the media it references and lays it out as one shelf. Assets are
// view-only: clicking one opens a viewer (not its project). "Export to project"
// copies an asset into any project's board.
export default function Library() {
  const projects = useProjectStore((s) => s.projects)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [viewer, setViewer] = useState(null) // asset shown full-size
  const [exportFor, setExportFor] = useState(null) // asset awaiting a destination
  const [toast, setToast] = useState(null)

  const assets = useMemo(() => {
    const out = []
    for (const p of projects) {
      if (p.deleted) continue // trashed projects don't contribute to the Library
      const session = sessionIO.readSession(p.id)
      if (!session) continue
      const items = [
        ...(session.modules?.dumpboard?.items || []),
        ...(session.modules?.moodboard?.items || []),
      ]
      const seen = new Set()
      for (const it of items) {
        if (it.type !== 'image' && it.type !== 'video') continue
        const key = it.sourceId || it.id
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ ...it, projectId: p.id, projectName: p.name })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, refresh])

  // Defer filtering off the live query so typing stays responsive: React keeps
  // the input snappy and re-renders the (expensive) grid at a lower priority.
  const deferredQuery = useDeferredValue(query)
  const shown = useMemo(
    () =>
      assets.filter(
        (a) =>
          (filter === 'all' || a.type === filter) &&
          (!deferredQuery || (a.label || '').toLowerCase().includes(deferredQuery.toLowerCase()))
      ),
    [assets, filter, deferredQuery]
  )

  // Copy an asset into a destination project's board. The file is duplicated into
  // that project's assets/ so it's self-contained.
  const exportAsset = async (asset, target) => {
    let src = asset.src
    let path = asset.path
    if (isDiskPath(asset.path) && target.folder) {
      const np = await copyAsset(asset.path, target.folder, `assets/${basename(asset.path)}`)
      if (np) {
        const u = await toAssetUrl(np)
        if (u) {
          src = u
          path = np
        }
      }
    } else if (typeof asset.src === 'string' && asset.src.startsWith('data:') && target.folder) {
      const ext = (/^data:image\/([^;]+)/.exec(asset.src)?.[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0]
      const saved = await saveAsset(target.folder, `assets/item_${uid('img')}.${ext}`, asset.src)
      if (saved) {
        const u = await toAssetUrl(saved)
        if (u) {
          src = u
          path = saved
        }
      }
    }
    appendBoardItem(target.id, {
      type: asset.type,
      src,
      path,
      label: asset.label || basename(path),
      width: asset.width || 200,
      height: asset.height || (asset.type === 'video' ? 140 : 226),
      missing: false,
      ...(asset.type === 'video' ? { pinnedFrames: [], sequences: [] } : {}),
    })
    setExportFor(null)
    setRefresh((r) => r + 1)
    setToast(`Exported to ${target.name}`)
    setTimeout(() => setToast(null), 2400)
  }

  return (
    <PageView>
      <Topbar
        title="Library"
        right={
          <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-surface-2 border-[0.5px] border-[var(--border)] focus-within:border-[var(--border-2)] transition-colors">
            <MagnifyingGlass size={13} className="text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search assets"
              className="bg-transparent text-[12px] text-ink placeholder:text-ink-3 w-[130px]"
            />
          </div>
        }
      />

      <div data-tut="library-controls" className="px-7 pt-4 flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[12px] rounded-md px-3 py-1 transition-colors ${
              filter === f.key ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-ink-3">{shown.length} assets</span>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5">
        {shown.length === 0 ? (
          <div className="h-full min-h-[40vh] grid place-items-center text-center">
            <div className="max-w-[300px]">
              <Stack size={26} weight="thin" className="text-ink-3 mx-auto mb-3" />
              <p className="text-[13px] text-ink-3 font-light leading-relaxed">
                {assets.length === 0
                  ? 'No assets yet. Drop images and video onto a project to fill the shelf.'
                  : 'Nothing matches that filter.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
            {shown.map((a) => (
              <AssetCard key={`${a.projectId}:${a.id}`} asset={a} onOpen={setViewer} onExport={setExportFor} />
            ))}
          </div>
        )}
      </div>

      {/* Full-size viewer */}
      {viewer && <Lightbox asset={viewer} onClose={() => setViewer(null)} />}

      {/* Export-to-project picker */}
      {exportFor && (
        <ExportPicker
          asset={exportFor}
          projects={projects}
          onPick={(target) => exportAsset(exportFor, target)}
          onClose={() => setExportFor(null)}
        />
      )}

      {toast && (
        <div className="glass-bar fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] rounded-full px-4 py-2 text-[12px] text-ink pointer-events-none">
          {toast}
        </div>
      )}
    </PageView>
  )
}

// One asset cell. Memoised so re-rendering Library (e.g. on every search
// keystroke) never re-renders unchanged cells; combined with the `lib-cell`
// class (content-visibility: auto), the browser also skips layout/paint for
// cells scrolled out of view. These two, plus static video thumbnails below,
// are what keep a large shelf smooth. Callbacks are the stable useState setters,
// so memo actually holds.
const AssetCard = memo(function AssetCard({ asset, onOpen, onExport }) {
  // Window the image mount: only hold a decoded bitmap while the cell is within
  // ~800px of the viewport. The observer sits on the .lib-cell (stable geometry
  // even under content-visibility) so it fires reliably as cells approach.
  const ref = useRef(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className="group lib-cell">
      <div
        onClick={() => onOpen(asset)}
        className="relative aspect-square rounded-[8px] overflow-hidden border-[0.5px] border-[var(--border)] bg-surface-2 group-hover:border-[var(--border-2)] transition-colors cursor-zoom-in"
        title={`${asset.label} · ${asset.projectName}`}
      >
        <AssetThumb asset={asset} near={near} />
        <button
          onClick={(e) => {
            e.stopPropagation()
            onExport(asset)
          }}
          title="Export to project"
          aria-label="Export to project"
          className="absolute top-1.5 right-1.5 grid place-items-center w-7 h-7 rounded-md bg-[rgba(10,10,10,0.72)] text-white/80 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
        >
          <Export size={15} />
        </button>
      </div>
      <div className="mt-1.5 text-[11px] text-ink-2 truncate">{asset.label}</div>
      <div className="font-serif text-[12px] text-ink-3 truncate">{asset.projectName}</div>
    </div>
  )
})

function PlayBadge() {
  return (
    <div className="absolute bottom-1 right-1 grid place-items-center w-5 h-5 rounded-full bg-[rgba(10,10,10,0.6)] pointer-events-none">
      <Play size={10} weight="fill" className="text-white/90" />
    </div>
  )
}

// Object URLs don't survive a reload, so an asset may not resolve — fall back to
// a labelled placeholder rather than a broken image. Videos render a STATIC
// thumbnail (the cached poster frame, or a film-icon placeholder) plus a play
// badge — never a live <video>. A shelf of dozens of <video> elements each
// spins up a media pipeline, which is the main cause of the Library getting
// laggy; the Lightbox still plays the real clip on click.
//
// Windowed: the actual <img> is only mounted while its cell is within ~800px of
// the viewport (IntersectionObserver), and unmounted once it scrolls far away.
// This bounds how many full-resolution bitmaps stay decoded in memory at once —
// the real cause of the shelf getting heavy once *every* image had loaded. It
// pairs with content-visibility (paint skipping) and memoised cells; together a
// large shelf stays light no matter how far you've scrolled.
function AssetThumb({ asset, near }) {
  const [broken, setBroken] = useState(false)
  const isVideo = asset.type === 'video'
  const thumbSrc = isVideo ? asset.poster : asset.src
  const showImg = near && thumbSrc && !broken

  return (
    <div className="w-full h-full relative bg-surface">
      {showImg ? (
        <img src={thumbSrc} alt={asset.label} loading="lazy" decoding="async" onError={() => setBroken(true)} className="w-full h-full object-cover" />
      ) : thumbSrc && !broken ? (
        // Reserved-but-not-yet-loaded (far from viewport): keep the cell empty so
        // no bitmap is held. A hairline neutral fill stands in for the image.
        <div className="w-full h-full" />
      ) : (
        <div className="w-full h-full grid place-items-center p-2 text-center">
          {isVideo ? (
            <VideoCamera size={20} className="text-ink-3" />
          ) : (
            <div>
              <ImageBroken size={18} className="text-ink-3 mx-auto mb-1" />
              <div className="text-[9px] text-ink-3 break-all leading-tight">{asset.label}</div>
            </div>
          )}
        </div>
      )}
      {isVideo && <PlayBadge />}
    </div>
  )
}

// View-only full-size overlay.
function Lightbox({ asset, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[140] flex flex-col items-center justify-center p-10"
      style={{ background: 'rgba(8,8,8,0.86)' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-5 right-5 grid place-items-center w-9 h-9 rounded-full text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors"
      >
        <X size={20} />
      </button>
      <div className="max-w-[90vw] max-h-[82vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {asset.type === 'image' ? (
          <img src={asset.src} alt={asset.label} className="max-w-full max-h-[82vh] object-contain rounded-[6px]" />
        ) : (
          <video src={asset.src} controls autoPlay className="max-w-full max-h-[82vh] rounded-[6px]" />
        )}
      </div>
      <div className="mt-4 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-[13px] text-ink">{asset.label}</div>
        <div className="font-serif text-[12px] text-ink-3 mt-0.5">{asset.projectName}</div>
      </div>
    </div>
  )
}

// Destination chooser for "Export to project".
function ExportPicker({ asset, projects, onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center" style={{ background: 'rgba(8,8,8,0.6)' }} onClick={onClose}>
      <div className="glass-bar w-[300px] max-w-[90%] rounded-[12px] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="font-serif text-[15px] text-ink mb-1">Export to project</div>
        <div className="text-[11px] text-ink-3 mb-3 truncate">{asset.label}</div>
        <div className="flex flex-col gap-0.5 max-h-[320px] overflow-y-auto -mx-1">
          {projects.length === 0 ? (
            <div className="text-[12px] text-ink-3 px-1 py-2">No projects yet.</div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md text-left hover:bg-[var(--sand-hover)] transition-colors"
              >
                <span
                  className="w-3.5 h-3.5 rounded-[3px] shrink-0"
                  style={{ background: p.palette?.[0] || 'var(--surface-3)', border: '0.5px solid var(--border-2)' }}
                />
                <span className="text-[13px] text-ink truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
