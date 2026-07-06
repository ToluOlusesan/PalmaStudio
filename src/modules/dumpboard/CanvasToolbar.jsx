import { useRef } from 'react'
import {
  Cursor, Hand, Image as ImageIcon, VideoCamera, NotePencil, ChatCircle,
  SquaresFour, Export,
} from '@phosphor-icons/react'
import { useCanvasStore } from '../../store/canvasStore.js'

// Vibrant, distinct hue per tool — the one deliberate splash of colour in the
// monochrome shell, so the dock reads at a glance.
const TOOL_COLORS = {
  select: '#3B82F6', // blue
  pan: '#22C55E', // green
  photo: '#F59E0B', // amber
  video: '#EC4899', // pink
  note: '#EF4444', // red
  comment: '#8B5CF6', // violet
  tidy: '#14B8A6', // teal
  export: '#6366F1', // indigo
}

function Sep({ big = false }) {
  return <span className={`w-px ${big ? 'h-7' : 'h-5'} mx-1 bg-[var(--border)] shrink-0`} />
}

// One muted hue per tool so the bar reads at a glance. The glyph carries the
// colour; the label stays neutral ink. When a tool is active it becomes a solid
// ink chip with a light glyph, so the colour only shows in the resting state.
// `big` is the roomier size used by the floating ToolDock; the slim top-bar
// Export keeps the default.
function ToolBtn({ icon: Icon, label, active, onClick, color, big = false, className = '', children }) {
  const h = big ? 'h-10' : 'h-7'
  const pad = children ? (big ? 'px-3.5' : 'px-2.5') : big ? 'px-2.5' : 'px-2'
  const text = big ? 'text-[13px]' : 'text-[12px]'
  const gap = big ? 'gap-2' : 'gap-1.5'
  // Concentric with the dock pill: pill radius (20) − pill padding (8) = 12.
  const radius = big ? 'rounded-xl' : 'rounded-lg'
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex items-center ${gap} ${h} ${pad} ${radius} ${text} transition-colors duration-[120ms] ` +
        (active
          ? 'bg-accent text-accent-fg font-medium border-[0.5px] border-transparent'
          : 'text-ink-2 hover:bg-surface-3 hover:text-ink border-[0.5px] border-transparent') +
        ` ${className}`}
    >
      {Icon && (
        <Icon size={big ? 22 : 16} weight="regular" style={!active && color ? { color } : undefined} />
      )}
      {children}
    </button>
  )
}

// Slim top strip — export lives here now (icon + label), plus the item count.
// The drawing tools moved down into the floating ToolDock (see below).
export default function CanvasToolbar({ count, onExport }) {
  return (
    <div
      data-tut="dump-export"
      className="h-11 shrink-0 flex items-center justify-end gap-2 px-3 bg-surface border-b-[0.5px]"
      style={{ borderColor: 'var(--border)' }}
    >
      <span className="text-[11px] text-ink-3 tabular-nums">
        {count} {count === 1 ? 'item' : 'items'}
      </span>
      <Sep />
      <ToolBtn icon={Export} label="Export board" color={TOOL_COLORS.export} onClick={onExport}>
        Export
      </ToolBtn>
    </div>
  )
}

// Floating drawing-tool dock — pinned bottom-centre over the canvas. Holds the
// selection/pan tools and the add-content actions. Sits where the zoom pill
// used to live; zoom is now the vertical stack at the bottom-right.
export function ToolDock({ onAddNote, onAddComment, onAddFiles, onTidy, extra }) {
  const tool = useCanvasStore((s) => s.tool)
  const setTool = useCanvasStore((s) => s.setTool)
  const photoRef = useRef(null)
  const videoRef = useRef(null)

  const pickFiles = (ref) => ref.current?.click()
  const onFiles = (e) => {
    if (e.target.files?.length) onAddFiles?.(e.target.files)
    e.target.value = ''
  }

  return (
    <div
      data-tut="dump-toolbar"
      className="pop-in glass-bar absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-[20px] p-2"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ToolBtn big icon={Cursor} label="Select" color={TOOL_COLORS.select} active={tool === 'select'} onClick={() => setTool('select')} />
      <ToolBtn big icon={Hand} label="Pan" color={TOOL_COLORS.pan} active={tool === 'pan'} onClick={() => setTool('pan')} />
      <Sep big />
      <ToolBtn big icon={ImageIcon} label="Add photo" color={TOOL_COLORS.photo} onClick={() => pickFiles(photoRef)} />
      <ToolBtn big icon={VideoCamera} label="Add video" color={TOOL_COLORS.video} onClick={() => pickFiles(videoRef)} />
      <ToolBtn big icon={NotePencil} label="Add note" color={TOOL_COLORS.note} onClick={onAddNote} />
      <ToolBtn big icon={ChatCircle} label="Add comment" color={TOOL_COLORS.comment} onClick={onAddComment} />
      <Sep big />
      <ToolBtn big icon={SquaresFour} label="Tidy" color={TOOL_COLORS.tidy} onClick={onTidy}>Tidy</ToolBtn>
      {extra && (
        <>
          <Sep big />
          {extra}
        </>
      )}

      <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
      <input ref={videoRef} type="file" accept="video/*" multiple className="hidden" onChange={onFiles} />
    </div>
  )
}
