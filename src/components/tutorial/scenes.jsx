// Tutorial caricatures — monochrome SVG miniatures of the Palma app performing
// each action, ported from the marketing site (website/src/components/
// ToolCaricatures.tsx) and adapted to the current build: no external image
// assets (placeholder thumbs instead), and the real current toolbars/tabs
// (Scratchpad has no H1/H2 anymore; the Dump tools live in a floating bottom
// dock + a vertical zoom control bottom-right, matching CanvasToolbar/DumpBoard).
// Motion lives in the tc-* classes in index.css. Each scene renders at a fixed
// 480×270 (16:9) viewBox; the spotlight card scales it to fit.

const INK = '#0a0a0a'
const CARD = '#e5e5e5'
const CANVAS = '#f2f2f2'
const SIDEBAR = '#f7f7f7'
const BAR = '#ffffff'

const W = 480
const H = 270
const SBW = 60
const CX0 = SBW
const CW = W - SBW

const SERIF = { fontFamily: 'var(--font-serif)' }

// Insert-tool accent hues, matching CanvasToolbar's TOOL_COLORS.
const TOOL = {
  select: '#3B82F6',
  pan: '#22C55E',
  photo: '#F59E0B',
  video: '#EC4899',
  note: '#EF4444',
  comment: '#8B5CF6',
  tidy: '#14B8A6',
}

// Phosphor (256×256) icon paths, inlined.
const IC = {
  cursor:
    'M168,132.69,214.08,115l.33-.13A16,16,0,0,0,213,85.07L52.92,32.8A15.95,15.95,0,0,0,32.8,52.92L85.07,213a15.82,15.82,0,0,0,14.41,11l.78,0a15.84,15.84,0,0,0,14.61-9.59l.13-.33L132.69,168,184,219.31a16,16,0,0,0,22.63,0l12.68-12.68a16,16,0,0,0,0-22.63ZM195.31,208,144,156.69a16,16,0,0,0-26,4.93c0,.11-.09.22-.13.32l-17.65,46L48,48l159.85,52.2-45.95,17.64-.32.13a16,16,0,0,0-4.93,26h0L208,195.31Z',
  hand:
    'M188,48a27.75,27.75,0,0,0-12,2.71V44a28,28,0,0,0-54.65-8.6A28,28,0,0,0,80,60v64l-3.82-6.13a28,28,0,0,0-48.6,27.82c16,33.77,28.93,57.72,43.72,72.69C86.24,233.54,103.2,240,128,240a88.1,88.1,0,0,0,88-88V76A28,28,0,0,0,188,48Zm12,104a72.08,72.08,0,0,1-72,72c-20.38,0-33.51-4.88-45.33-16.85C69.44,193.74,57.26,171,41.9,138.58a6.36,6.36,0,0,0-.3-.58,12,12,0,0,1,20.79-12,1.76,1.76,0,0,0,.14.23l18.67,30A8,8,0,0,0,96,152V60a12,12,0,0,1,24,0v60a8,8,0,0,0,16,0V44a12,12,0,0,1,24,0v76a8,8,0,0,0,16,0V76a12,12,0,0,1,24,0Z',
  image:
    'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z',
  video:
    'M251.77,73a8,8,0,0,0-8.21.39L208,97.05V72a16,16,0,0,0-16-16H32A16,16,0,0,0,16,72V184a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V159l35.56,23.71A8,8,0,0,0,248,184a8,8,0,0,0,8-8V80A8,8,0,0,0,251.77,73ZM192,184H32V72H192V184Zm48-22.95-32-21.33V116.28L240,95Z',
  notePencil:
    'M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM51.31,160,136,75.31,152.69,92,68,176.68ZM48,179.31,76.69,208H48Zm48,25.38L79.31,188,164,103.31,180.69,120Zm96-96L147.31,64l24-24L216,84.68Z',
  chat:
    'M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z',
  chatFill:
    'M232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Z',
  squares:
    'M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48Z',
  stack:
    'M230.91,172A8,8,0,0,1,228,182.91l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,36,169.09l92,53.65,92-53.65A8,8,0,0,1,230.91,172ZM220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09ZM24,80a8,8,0,0,1,4-6.91l96-56a8,8,0,0,1,8.06,0l96,56a8,8,0,0,1,0,13.82l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,24,80Zm23.88,0L128,126.74,208.12,80,128,33.26Z',
  search:
    'M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z',
  export:
    'M216,112v96a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V112A16,16,0,0,1,56,96H80a8,8,0,0,1,0,16H56v96H200V112H176a8,8,0,0,1,0-16h24A16,16,0,0,1,216,112ZM93.66,69.66,120,43.31V136a8,8,0,0,0,16,0V43.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,69.66Z',
  bold:
    'M178.48,115.7A44,44,0,0,0,148,40H80a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8h80a48,48,0,0,0,18.48-92.3ZM88,56h60a28,28,0,0,1,0,56H88Zm72,136H88V128h72a32,32,0,0,1,0,64Z',
  italic:
    'M200,56a8,8,0,0,1-8,8H157.77L115.1,192H144a8,8,0,0,1,0,16H64a8,8,0,0,1,0-16H98.23L140.9,64H112a8,8,0,0,1,0-16h80A8,8,0,0,1,200,56Z',
  strike:
    'M224,128a8,8,0,0,1-8,8H175.93c9.19,7.11,16.07,17.2,16.07,32,0,13.34-7,25.7-19.75,34.79C160.33,211.31,144.61,216,128,216s-32.33-4.69-44.25-13.21C71,193.7,64,181.34,64,168a8,8,0,0,1,16,0c0,17.35,22,32,48,32s48-14.65,48-32c0-14.85-10.54-23.58-38.77-32H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM76.33,104a8,8,0,0,0,7.61-10.49A17.3,17.3,0,0,1,83.11,88c0-18.24,19.3-32,44.89-32,18.84,0,34.16,7.42,41,19.85a8,8,0,0,0,14-7.7C173.33,50.52,152.77,40,128,40,93.29,40,67.11,60.63,67.11,88a33.73,33.73,0,0,0,1.62,10.49A8,8,0,0,0,76.33,104Z',
  code:
    'M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z',
  quotes:
    'M100,56H40A16,16,0,0,0,24,72v64a16,16,0,0,0,16,16h60v8a32,32,0,0,1-32,32,8,8,0,0,0,0,16,48.05,48.05,0,0,0,48-48V72A16,16,0,0,0,100,56Zm0,80H40V72h60ZM216,56H156a16,16,0,0,0-16,16v64a16,16,0,0,0,16,16h60v8a32,32,0,0,1-32,32,8,8,0,0,0,0,16,48.05,48.05,0,0,0,48-48V72A16,16,0,0,0,216,56Zm0,80H156V72h60Z',
  list:
    'M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z',
}

function PIcon({ d, x, y, size, op = 0.6, fill = INK }) {
  return <path d={d} transform={`translate(${x} ${y}) scale(${size / 256})`} fill={fill} fillOpacity={op} />
}

const svgProps = { viewBox: `0 0 ${W} ${H}`, role: 'img', width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet', style: { display: 'block' } }

// Shared <defs>: dot-grid pattern + a small connector arrowhead.
function Defs() {
  return (
    <defs>
      <pattern id="tut-dots" width="15" height="15" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.9" fill={INK} fillOpacity="0.05" />
      </pattern>
      <marker id="tut-arrow" markerWidth="7" markerHeight="7" refX="0.4" refY="3" orient="auto-start-reverse">
        <path d="M0 0 L6 3 L0 6 z" fill={INK} fillOpacity="0.4" />
      </marker>
    </defs>
  )
}

/* ---------------------------------------------------------------- chrome */

function Sidebar({ active = 'projects' }) {
  const navRow = (label, iconD, y, on) => (
    <g>
      {on && <rect x="4" y={y - 5.5} width={SBW - 8} height="11" rx="3" fill={INK} fillOpacity="0.06" />}
      <PIcon d={iconD} x={8} y={y - 4.6} size={6.4} op={on ? 0.85 : 0.5} />
      <text x="18" y={y} fontSize="5.2" fill={INK} fillOpacity={on ? 0.95 : 0.62}>{label}</text>
    </g>
  )
  return (
    <g>
      <rect x="0" y="0" width={SBW} height={H} fill={SIDEBAR} />
      <line x1={SBW} y1="0" x2={SBW} y2={H} stroke={INK} strokeOpacity="0.08" />
      {/* brand */}
      <circle cx="12" cy="10" r="4" fill={INK} />
      <text x={21} y={13} fontSize="7.5" fill={INK} style={SERIF}>Palma</text>
      {/* nav */}
      {navRow('Projects', IC.squares, 33, active === 'projects')}
      {navRow('Library', IC.stack, 46, active === 'library')}
      <text x="8" y="66" fontSize="4.3" fontWeight="600" letterSpacing="0.6" fill={INK} fillOpacity="0.38">RECENT</text>
      <rect x="8" y="71.8" width="5" height="5" rx="1.8" fill="#9a9a9a" />
      <text x="17" y="76.2" fontSize="5.2" fill={INK} fillOpacity="0.7">On my Way</text>
      <rect x="8" y="85" width="5" height="5" rx="1.8" fill="#bcbcbc" />
      <text x="17" y="89.4" fontSize="5.2" fill={INK} fillOpacity="0.55">Studio 04</text>
      {/* new project */}
      <rect x="6" y="247" width={SBW - 12} height="15" rx="4" fill={INK} />
      <text x={SBW / 2} y="254.6" fontSize="5" fontWeight="500" textAnchor="middle" fill={CANVAS}>+ New project</text>
    </g>
  )
}

function TopBar({ title = 'On my Way', crumb = 'Projects ›' }) {
  return (
    <g>
      <rect x={CX0} y="0" width={CW} height="18" fill={BAR} />
      <line x1={CX0} y1="18" x2={W} y2="18" stroke={INK} strokeOpacity="0.07" />
      {crumb && <text x={CX0 + 10} y="11.8" fontSize="5.6" fill={INK} fillOpacity="0.4">{crumb}</text>}
      <text x={CX0 + (crumb ? 42 : 10)} y="12.1" fontSize="6.6" fill={INK} style={SERIF}>{title}</text>
      <text x="440" y="11.8" fontSize="5" textAnchor="end" fill={INK} fillOpacity="0.42">✓ Saved</text>
      <rect x="446" y="4.2" width="28" height="9.6" rx="4.8" fill="none" stroke={INK} strokeOpacity="0.18" strokeWidth="0.8" />
      <text x="460" y="11" fontSize="5" textAnchor="middle" fill={INK} fillOpacity="0.7">Export</text>
    </g>
  )
}

const TAB_DEFS = {
  dump: { x: CX0 + 10, label: 'Dump Board', w: 36 },
  focus: { x: CX0 + 54, label: 'Focus', w: 19 },
  scratchpad: { x: CX0 + 81, label: 'Scratchpad', w: 35 },
}
function Tabs({ active }) {
  return (
    <g>
      <rect x={CX0} y="18" width={CW} height="15" fill={BAR} />
      <line x1={CX0} y1="33" x2={W} y2="33" stroke={INK} strokeOpacity="0.07" />
      {Object.keys(TAB_DEFS).map((k) => {
        const t = TAB_DEFS[k]
        const on = k === active
        return (
          <g key={k}>
            <text x={t.x} y="28.4" fontSize="5.6" fontWeight={on ? 600 : 400} fill={INK} fillOpacity={on ? 1 : 0.4}>{t.label}</text>
            {on && <rect x={t.x - 1} y="32" width={t.w} height="1.6" fill={INK} />}
          </g>
        )
      })}
    </g>
  )
}

// The Dump-Board tools now live in a floating dock pinned bottom-centre over the
// canvas (they left the top bar in 1.1.1). Icons read bold and prominent, one
// muted hue each, with the Select tool shown active.
function BoardDock() {
  const cy = 234
  const btn = (cx, d, { active = false, color = INK } = {}) => (
    <g>
      {active && <rect x={cx - 7} y={cy - 7} width="14" height="14" rx="4.5" fill={INK} />}
      <PIcon d={d} x={cx - 5} y={cy - 5} size={10} op={active ? 1 : color === INK ? 0.7 : 1} fill={active ? CANVAS : color} />
    </g>
  )
  const sep = (x) => <line x1={x} y1={cy - 6.5} x2={x} y2={cy + 6.5} stroke={INK} strokeOpacity="0.14" />
  return (
    <g className="tc-fx tc-pop">
      <rect x={192} y={cy - 13} width={168} height={26} rx={13} fill={BAR} stroke={INK} strokeOpacity="0.14" />
      {btn(208, IC.cursor, { active: true })}
      {btn(226, IC.hand, { color: TOOL.pan })}
      {sep(239)}
      {btn(252, IC.image, { color: TOOL.photo })}
      {btn(268, IC.video, { color: TOOL.video })}
      {btn(284, IC.notePencil, { color: TOOL.note })}
      {btn(300, IC.chat, { color: TOOL.comment })}
      {sep(313)}
      {btn(325, IC.squares, { color: TOOL.tidy })}
      <text x={333} y={cy + 3.4} fontSize="7" fill={INK} fillOpacity="0.72">Tidy</text>
    </g>
  )
}

// Zoom control — vertical stack pinned bottom-right (also moved off the top bar).
function BoardZoom() {
  const cx = 462
  const stroke = { stroke: INK, strokeOpacity: 0.6, strokeWidth: 1.4, strokeLinecap: 'round' }
  return (
    <g>
      <rect x={cx - 10} y={188} width={20} height={66} rx={10} fill={BAR} stroke={INK} strokeOpacity="0.14" />
      {/* + */}
      <line x1={cx - 4} y1={200} x2={cx + 4} y2={200} {...stroke} />
      <line x1={cx} y1={196} x2={cx} y2={204} {...stroke} />
      {/* percent */}
      <text x={cx} y={218.5} fontSize="5.4" fontWeight="600" textAnchor="middle" fill={INK} fillOpacity="0.75">100</text>
      {/* − */}
      <line x1={cx - 4} y1={231} x2={cx + 4} y2={231} {...stroke} />
      {/* divider */}
      <line x1={cx - 5} y1={239} x2={cx + 5} y2={239} stroke={INK} strokeOpacity="0.14" />
      {/* fit-view corners */}
      <path d={`M${cx - 3.5} ${246} h-1.5 v1.5 M${cx + 3.5} ${246} h1.5 v1.5 M${cx - 3.5} ${250.5} h-1.5 v-1.5 M${cx + 3.5} ${250.5} h1.5 v-1.5`} fill="none" {...stroke} />
    </g>
  )
}

function ContentCanvas({ top }) {
  return (
    <>
      <rect x={CX0} y={top} width={CW} height={H - top} fill={CANVAS} />
      <rect x={CX0} y={top} width={CW} height={H - top} fill="url(#tut-dots)" />
    </>
  )
}

/* ----------------------------------------------------------------- pieces */

function Thumb({ x, y, w, h, fill = '#d4d4d4', ...g }) {
  return (
    <g {...g}>
      <rect x={x} y={y} width={w} height={h} rx="7" fill={fill} stroke={INK} strokeOpacity="0.12" />
      <circle cx={x + w * 0.64} cy={y + h * 0.4} r={Math.min(w, h) * 0.18} fill="#fff" fillOpacity="0.28" />
      <rect x={x + w * 0.14} y={y + h * 0.62} width={w * 0.4} height={Math.max(3, h * 0.1)} rx="2" fill="#000" fillOpacity="0.09" />
    </g>
  )
}

function NoteCard({ x, y, w, h, lines = 4, ...g }) {
  const fracs = [0.82, 0.64, 0.9, 0.52, 0.7].slice(0, lines)
  return (
    <g {...g}>
      <rect x={x} y={y} width={w} height={h} rx="7" fill={CARD} stroke={INK} strokeOpacity="0.12" />
      {fracs.map((f, i) => (
        <rect key={i} x={x + 10} y={y + 12 + i * 9} width={(w - 20) * f} height="3.6" rx="1.8" fill={INK} fillOpacity={0.5 - i * 0.07} />
      ))}
    </g>
  )
}

function Arrow({ d }) {
  return <path d={d} fill="none" stroke={INK} strokeOpacity="0.24" strokeWidth="1.2" markerEnd="url(#tut-arrow)" />
}

function ZoneFrame({ x, y, w, h, label, accent, children }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="9" fill={accent} fillOpacity="0.05" stroke={accent} strokeOpacity="0.55" strokeWidth="0.6" />
      <circle cx={x + 9} cy={y + 11} r="1.6" fill={accent} fillOpacity="0.9" />
      <text x={x + 14} y={y + 13} fontSize="5" fontWeight="500" letterSpacing="0.4" fill={accent} fillOpacity="0.85">{label.toUpperCase()}</text>
      {children}
    </g>
  )
}

/* -------------------------------------------------------------- 1 Project */
function ProjectScene() {
  const card = (x, y, name, on) => (
    <g>
      <rect x={x} y={y} width="86" height="60" rx="7" fill={BAR} stroke={INK} strokeOpacity={on ? 0.2 : 0.1} strokeWidth={on ? 1 : 0.6} />
      <rect x={x} y={y} width="86" height="38" rx="7" fill="#dcdcdc" />
      <rect x={x} y={y + 20} width="86" height="18" fill="#dcdcdc" />
      <text x={x + 8} y={y + 50} fontSize="6" fill={INK} style={SERIF}>{name}</text>
      <text x={x + 8} y={y + 57} fontSize="4.4" fill={INK} fillOpacity="0.4">edited today</text>
    </g>
  )
  return (
    <svg {...svgProps} aria-label="Creating a project on the Palma dashboard">
      <Defs />
      <rect x="0" y="0" width={W} height={H} fill={CANVAS} />
      <Sidebar active="projects" />
      <TopBar crumb="" title="Projects" />
      {/* New project button, top-right, with a pulsing ring to draw the eye */}
      <g>
        <rect className="tc-fx tc-pulse" x="398" y="5" width="74" height="14" rx="7" fill={INK} fillOpacity="0.14" />
        <rect x="400" y="6" width="70" height="12" rx="6" fill={INK} />
        <text x="435" y="14.3" fontSize="6" fontWeight="500" textAnchor="middle" fill={CANVAS}>+ New project</text>
      </g>
      {/* existing project cards + one dropping in */}
      {card(CX0 + 14, 40, 'On my Way', true)}
      {card(CX0 + 112, 40, 'Studio 04', false)}
      {card(CX0 + 210, 40, 'Field Notes', false)}
      <g className="tc-fx tc-drop">{card(CX0 + 14, 116, 'Untitled', false)}</g>
      {/* naming line hint */}
      <text x={CX0 + 14} y="205" fontSize="6" fill={INK} fillOpacity="0.55">Name it, point it at a folder on disk — your files stay put.</text>
    </svg>
  )
}

/* ----------------------------------------------------------------- 2 Dump */
function DumpScene() {
  return (
    <svg {...svgProps} aria-label="Images and notes dropped onto the Dump Board">
      <Defs />
      <Sidebar active="projects" />
      <ContentCanvas top={33} />
      <TopBar title="On my Way" crumb="Projects ›" />
      <Tabs active="dump" />
      <Arrow d="M172 96 C 192 98, 200 110, 217 112" />
      <Arrow d="M322 100 C 334 98, 340 95, 349 94" />
      <Thumb x={80} y={60} w={92} h={60} />
      <NoteCard x={84} y={136} w={94} h={62} />
      <Thumb x={218} y={72} w={104} h={74} fill="#cccccc" />
      <Thumb x={350} y={56} w={82} h={58} className="tc-fx tc-drop" />
      <NoteCard x={210} y={166} w={96} h={52} lines={3} className="tc-fx tc-drop" style={{ animationDelay: '2.4s' }} />
      <BoardZoom />
      <BoardDock />
    </svg>
  )
}

/* ---------------------------------------------------------------- 3 Focus */
function FocusScene() {
  const zoneThumbs = (zx, n) =>
    Array.from({ length: n }).map((_, i) => <Thumb key={i} x={zx + 8} y={62 + i * 63} w={92} h={56} fill={i % 2 ? '#cfcfcf' : '#d7d7d7'} />)
  return (
    <svg {...svgProps} aria-label="References sorted into zones on the Focus board">
      <Defs />
      <Sidebar active="projects" />
      <ContentCanvas top={33} />
      <TopBar title="On my Way" crumb="Projects ›" />
      <Tabs active="focus" />
      <ZoneFrame x={72} y={44} w={108} h={212} label="Colour" accent="#f97316">{zoneThumbs(72, 3)}</ZoneFrame>
      <ZoneFrame x={188} y={44} w={108} h={212} label="Texture" accent="#14b8a6">{zoneThumbs(188, 3)}</ZoneFrame>
      <ZoneFrame x={304} y={44} w={108} h={212} label="Motion" accent="#8b5cf6">
        <Thumb x={312} y={62} w={92} h={56} fill="#d7d7d7" />
        <Thumb x={312} y={125} w={92} h={56} fill="#cfcfcf" />
        <rect x={312} y={188} width={92} height={56} rx="7" fill={INK} fillOpacity="0.04" stroke={INK} strokeOpacity="0.12" strokeDasharray="3 3" />
        {/* the queued item slides out of the Queue into the empty slot */}
        <Thumb className="tc-fx tc-gather" style={{ '--fx': '76px', '--fy': '-52px', '--fr': '4deg' }} x={312} y={188} w={92} h={56} fill="#cbcbcb" />
      </ZoneFrame>
      {/* Queue rail */}
      <g>
        <rect x={416} y={33} width={64} height={H - 33} fill="#ececec" />
        <line x1={416} y1={33} x2={416} y2={H} stroke={INK} strokeOpacity="0.08" />
        <text x={424} y={48} fontSize="4.6" fontWeight="600" letterSpacing="0.7" fill={INK} fillOpacity="0.42">QUEUE</text>
        <Thumb x={424} y={54} w={48} h={36} fill="#d2d2d2" />
        <Thumb x={424} y={96} w={48} h={36} fill="#d2d2d2" />
      </g>
    </svg>
  )
}

/* ----------------------------------------------------------- 4 Scratchpad */
function ScratchpadScene() {
  // Formatting bar matching the CURRENT build: Bold, Italic, Strike, Code |
  // Quote, Bullet, Numbered. (H1/H2 were removed in 1.0.9.)
  const bar = [
    ['bold', CX0 + 10],
    ['italic', CX0 + 24],
    ['strike', CX0 + 38],
    ['code', CX0 + 52],
    'div',
    ['quotes', CX0 + 72],
    ['list', CX0 + 86],
    ['numbered', CX0 + 100],
  ]
  const lines = [
    'For decades, brand design has been defined by flat',
    'artifacts: logos, palettes, type, and static layouts.',
    'Even as products evolved, the foundations stayed',
    'two-dimensional. 3D design changes that logic',
  ]
  return (
    <svg {...svgProps} aria-label="Writing a brief in the Scratchpad">
      <Defs />
      <Sidebar active="projects" />
      <rect x={CX0} y="33" width={CW} height={H - 33} fill={BAR} />
      <TopBar title="On my Way" crumb="Projects ›" />
      <Tabs active="scratchpad" />
      {/* formatting toolbar */}
      <rect x={CX0} y="33" width={CW} height="17" fill={BAR} />
      <line x1={CX0} y1="50" x2={W} y2="50" stroke={INK} strokeOpacity="0.07" />
      {bar.map((t, i) =>
        t === 'div' ? (
          <line key={i} x1={bar[i - 1][1] + 11} y1="37" x2={bar[i - 1][1] + 11} y2="46" stroke={INK} strokeOpacity="0.1" />
        ) : t[0] === 'numbered' ? (
          <g key={i}>
            <text x={t[1]} y={44.5} fontSize="6" fontWeight="700" fill={INK} fillOpacity="0.55" style={{ fontFamily: 'var(--font-mono)' }}>1.</text>
            <rect x={t[1] + 5} y={39} width="6" height="1.6" rx="0.8" fill={INK} fillOpacity="0.5" />
            <rect x={t[1] + 5} y={43} width="6" height="1.6" rx="0.8" fill={INK} fillOpacity="0.5" />
          </g>
        ) : (
          <PIcon key={i} d={IC[t[0]]} x={t[1]} y={37.5} size={9} op={0.6} />
        )
      )}
      {/* document — title + a few lines with a live caret */}
      <text x={CX0 + 18} y="70" fontSize="8" fontWeight="600" fill={INK}>On 3D and brand design</text>
      <g fill={INK} fillOpacity="0.8">
        {lines.map((ln, i) => (
          <text key={i} x={CX0 + 18} y={88 + i * 11} fontSize="5.6">
            {ln}
            {i === lines.length - 1 && <tspan className="tc-caret" dx="0.5">|</tspan>}
          </text>
        ))}
      </g>
      {/* word count footer */}
      <line x1={CX0} y1="255" x2={W} y2="255" stroke={INK} strokeOpacity="0.06" />
      <text x={CX0 + 12} y="264" fontSize="5" fill={INK} fillOpacity="0.4">36 words · 214 chars</text>
    </svg>
  )
}

/* -------------------------------------------------------------- 5 Library */
function LibraryScene() {
  const cell = (x, y, fill, badge) => (
    <g>
      <Thumb x={x} y={y} w={64} h={64} fill={fill} />
      {badge && (
        <g className="tc-fx tc-pop">
          <rect x={x + 44} y={y + 4} width="16" height="12" rx="3" fill={INK} />
          <PIcon d={IC.export} x={x + 46} y={y + 5.6} size={9} op={1} fill={CANVAS} />
        </g>
      )}
    </g>
  )
  return (
    <svg {...svgProps} aria-label="Every project's media gathered on the Library shelf">
      <Defs />
      <rect x="0" y="0" width={W} height={H} fill={CANVAS} />
      <Sidebar active="library" />
      <TopBar crumb="" title="Library" />
      {/* search box */}
      <rect x="360" y="4.4" width="112" height="9.6" rx="4.8" fill={BAR} stroke={INK} strokeOpacity="0.14" strokeWidth="0.7" />
      <PIcon d={IC.search} x="364" y="6" size={6.6} op={0.4} />
      <text x="374" y="11.4" fontSize="5" fill={INK} fillOpacity="0.4">Search assets</text>
      {/* filter chips */}
      <rect x={CX0 + 14} y="28" width="24" height="12" rx="6" fill={INK} fillOpacity="0.08" />
      <text x={CX0 + 26} y="36.4" fontSize="5.4" textAnchor="middle" fill={INK} fillOpacity="0.9">All</text>
      <text x={CX0 + 54} y="36.4" fontSize="5.4" fill={INK} fillOpacity="0.5">Images</text>
      <text x={CX0 + 86} y="36.4" fontSize="5.4" fill={INK} fillOpacity="0.5">Video</text>
      <text x="440" y="36.4" fontSize="5" textAnchor="end" fill={INK} fillOpacity="0.4">18 assets</text>
      {/* asset grid */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const col = i % 3
        const row = Math.floor(i / 3)
        const x = CX0 + 14 + col * 74
        const y = 52 + row * 74
        const fills = ['#d7d7d7', '#cfcfcf', '#d2d2d2', '#cacaca', '#d5d5d5', '#cdcdcd']
        return <g key={i}>{cell(x, y, fills[i], i === 0)}</g>
      })}
    </svg>
  )
}

export const SCENES = {
  project: ProjectScene,
  dumpboard: DumpScene,
  focus: FocusScene,
  scratchpad: ScratchpadScene,
  library: LibraryScene,
}

export default function TutorialScene({ id }) {
  const Scene = SCENES[id] || ProjectScene
  return (
    <div className="tc">
      <Scene />
    </div>
  )
}
