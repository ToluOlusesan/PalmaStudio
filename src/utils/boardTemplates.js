// Board templates — starter frame sets for art-direction work. Each frame is
// seeded with placeholder slots (hint cards) that real references replace when
// dropped into the frame, so a fresh board already reads as a structure.
export const BOARD_TEMPLATES = [
  {
    id: 'direction',
    name: 'Direction board',
    blurb: 'The six pillars of a look',
    frames: [
      ['Mood', 'The feeling in one glance'],
      ['Palette', 'Colour references and swatches'],
      ['Type', 'Typefaces and lettering'],
      ['Lighting', 'Key, fill, time of day'],
      ['Composition', 'Framing and lens'],
      ['Texture', 'Grain, material, finish'],
    ],
    cols: 3,
  },
  {
    id: 'ab',
    name: 'Direction A / B',
    blurb: 'Two routes, side by side',
    frames: [
      ['Direction A', 'Route one'],
      ['Direction B', 'Route two'],
    ],
    cols: 2,
    slots: 4,
  },
  {
    id: 'motion',
    name: 'Motion study',
    blurb: 'How it moves, not just how it looks',
    frames: [
      ['Pace', 'Rhythm and timing'],
      ['Transitions', 'How shots hand off'],
      ['Camera', 'Moves and lenses'],
      ['Type in motion', 'Kinetic type'],
    ],
    cols: 2,
  },
  {
    id: 'world',
    name: 'World building',
    blurb: 'Character, place, props',
    frames: [
      ['Character', 'Who, wardrobe, attitude'],
      ['Environment', 'Where it lives'],
      ['Props & details', 'The objects that sell it'],
      ['Lighting', 'How the world is lit'],
      ['Palette', 'The colour of the world'],
    ],
    cols: 3,
  },
  { id: 'frame', name: 'Empty frame', blurb: 'One titled section', frames: [['Untitled', 'Drop references here']], cols: 1, slots: 2 },
]

const SLOT_W = 200
const SLOT_H = 150
const GAP = 16
const FRAME_GAP = 96
const TITLE = 40

// Items for a template, top-left anchored at (x, y). Colours rotate through the
// frame palette; each frame starts in grid layout.
export function templateItems(tpl, x, y, colors, uid) {
  const slots = tpl.slots || 2
  const slotCols = Math.min(slots, 2)
  const slotRows = Math.ceil(slots / slotCols)
  const fw = slotCols * SLOT_W + (slotCols - 1) * GAP
  const fh = slotRows * SLOT_H + (slotRows - 1) * GAP
  const out = []
  tpl.frames.forEach(([name, hint], i) => {
    const col = i % tpl.cols
    const row = Math.floor(i / tpl.cols)
    const fx = x + col * (fw + FRAME_GAP)
    const fy = y + row * (fh + FRAME_GAP + TITLE)
    const groupId = uid('group')
    for (let s = 0; s < slots; s++) {
      out.push({
        type: 'note',
        placeholder: true,
        content: s === 0 ? hint : '',
        x: fx + (s % slotCols) * (SLOT_W + GAP),
        y: fy + Math.floor(s / slotCols) * (SLOT_H + GAP),
        width: SLOT_W,
        height: SLOT_H,
        groupId,
        groupName: name === 'Untitled' ? undefined : name,
        groupColor: colors[i % colors.length],
        groupLayout: 'grid',
      })
    }
  })
  return out
}
