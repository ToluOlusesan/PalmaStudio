import { useMemo, useState } from 'react'
import { Plus, FilmSlate, Export } from '@phosphor-icons/react'
import {
  useStoryboardStore,
  ASPECTS,
  panelBox,
  formatRuntime,
} from '../../store/storyboardStore.js'
import PanelCard from './PanelCard.jsx'

// Storyboard — the sequence view. Unlike the Dump Board (an infinite canvas) and
// Focus (zones in world space), this is a plain reflowing document: panels wrap
// into rows at the viewport width and their order IS the story. That's the whole
// reason it isn't a canvas — on a canvas you can nudge a shot half a pixel out
// of line and lose the sequence; here the layout enforces it and the numbers can
// never disagree with what you're looking at.
//
// Panels arrive by Send to Storyboard from the Dump Board (Ctrl B / right-click),
// landing at the end, and are dragged into position from there.
export default function StoryBoard({ onOpenExport }) {
  const aspect = useStoryboardStore((s) => s.aspect)
  const panelSize = useStoryboardStore((s) => s.panelSize)
  const panels = useStoryboardStore((s) => s.panels)
  const setAspect = useStoryboardStore((s) => s.setAspect)
  const setPanelSize = useStoryboardStore((s) => s.setPanelSize)
  const addEmptyPanel = useStoryboardStore((s) => s.addEmptyPanel)
  const movePanel = useStoryboardStore((s) => s.movePanel)

  // Index of the panel being dragged, and the slot the caret is showing.
  const [dragFrom, setDragFrom] = useState(null)
  const [dropAt, setDropAt] = useState(null)

  const box = panelBox(aspect, panelSize)
  const runtime = useMemo(() => panels.reduce((t, p) => t + (Number(p.duration) || 0), 0), [panels])

  const endDrag = () => {
    setDragFrom(null)
    setDropAt(null)
  }

  // Which side of a panel the pointer is on decides whether the caret sits
  // before or after it — the usual insert-between-two-things gesture.
  const overPanel = (e, index) => {
    if (dragFrom === null) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    setDropAt(e.clientX < r.left + r.width / 2 ? index : index + 1)
  }

  // stopPropagation matters: this same handler is bound on the panel, on the
  // tail spacer AND on the scroll container, so without it a drop onto a panel
  // also fires the container's copy. Both calls run inside one React batch and
  // therefore both still see the pre-drop dragFrom/dropAt — applying the move
  // twice and landing the panel somewhere nobody asked for.
  const drop = (e) => {
    e.stopPropagation()
    if (dragFrom === null || dropAt === null) return endDrag()
    e.preventDefault()
    movePanel(dragFrom, dropAt)
    endDrag()
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div
        className="h-11 shrink-0 flex items-center gap-3 px-3 bg-surface border-b-[0.5px]"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-[11px] text-ink-3 tabular-nums">
          {panels.length} {panels.length === 1 ? 'panel' : 'panels'}
        </span>
        <Sep />
        <span className="text-[11px] text-ink-2 tabular-nums" title="Total runtime">
          {formatRuntime(runtime)}
        </span>

        <div className="flex-1" />

        <Segmented
          label="Frame"
          value={aspect}
          options={ASPECTS.map((a) => ({ value: a.key, label: a.label }))}
          onChange={setAspect}
        />
        <Sep />
        <Segmented
          label="Size"
          value={panelSize}
          options={[
            { value: 'sm', label: 'S' },
            { value: 'md', label: 'M' },
            { value: 'lg', label: 'L' },
          ]}
          onChange={setPanelSize}
        />
        <Sep />
        <button
          onClick={() => addEmptyPanel()}
          title="Add an empty panel"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors"
        >
          <Plus size={14} />
          Add panel
        </button>
        <Sep />
        <button
          onClick={onOpenExport}
          title="Export Process Brief"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors"
        >
          <Export size={14} /> Export
        </button>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ background: 'var(--bg)' }}
        onDragOver={(e) => dragFrom !== null && e.preventDefault()}
        onDrop={drop}
      >
        {panels.length === 0 ? (
          <EmptyState onAdd={() => addEmptyPanel()} />
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-6 p-6">
            {panels.map((p, i) => (
              <PanelCard
                key={p.id}
                panel={p}
                index={i}
                box={box}
                isDropBefore={dropAt === i && dragFrom !== null}
                onDragStart={(e) => {
                  setDragFrom(i)
                  e.dataTransfer.effectAllowed = 'move'
                  // Firefox refuses to start a drag without payload; the index
                  // in component state is what we actually read on drop.
                  e.dataTransfer.setData('text/plain', String(i))
                }}
                onDragOver={(e) => overPanel(e, i)}
                onDrop={drop}
                onDragEnd={endDrag}
              />
            ))}
            {/* Tail target so a panel can be dropped after the last one. */}
            <div
              className="shrink-0 w-6 self-stretch"
              onDragOver={(e) => {
                if (dragFrom === null) return
                e.preventDefault()
                setDropAt(panels.length)
              }}
              onDrop={drop}
            >
              {dropAt === panels.length && dragFrom !== null && (
                <span
                  className="block w-[2px] h-full rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Sep() {
  return <span className="w-px h-5 bg-[var(--border)] shrink-0" />
}

// A small segmented control — the board-wide settings are a short closed list,
// so showing them all beats hiding them behind a dropdown.
function Segmented({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</span>
      <div
        className="flex items-center rounded-lg p-0.5 gap-0.5"
        style={{ background: 'var(--sand)' }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`h-6 px-2 rounded-md text-[11px] tabular-nums transition-colors ${
              value === o.value
                ? 'bg-accent text-accent-fg font-medium'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ onAdd }) {
  return (
    <div className="h-full grid place-items-center px-8">
      <div className="text-center max-w-[380px]">
        <FilmSlate size={26} className="text-ink-3 mx-auto mb-3" />
        <p className="font-serif text-[17px] text-ink mb-1.5">Build the sequence</p>
        <p className="text-[12px] text-ink-3 font-light leading-relaxed mb-4">
          Send references from the Dump Board with{' '}
          <span className="font-mono text-[11px] text-ink-2">Ctrl B</span> — each one lands as the
          next shot. Or block the story out first with empty panels and fill them in later.
        </p>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] bg-accent text-accent-fg font-medium"
        >
          <Plus size={14} />
          Add a panel
        </button>
      </div>
    </div>
  )
}
