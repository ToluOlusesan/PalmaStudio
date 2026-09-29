import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import FocusBoard from './FocusBoard.jsx'
import QueuePanel from './QueuePanel.jsx'

// Focus — a curated board built from references promoted off the Dump Board.
// The canvas has one optional contextual rail on the right. Nothing is uploaded
// here; the canvas is fed by references sent from the Dump Board.
export default function MoodBoard({ onOpenExport }) {
  const [sidePanel, setSidePanel] = useState(null)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 flex">
        <FocusBoard
          onOpenExport={onOpenExport}
          sidePanel={sidePanel}
          onToggleQueue={() => setSidePanel((v) => v === 'queue' ? null : 'queue')}
        />
        <AnimatePresence initial={false}>
          {sidePanel === 'queue' && <QueuePanel key="queue" onClose={() => setSidePanel(null)} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
