import Sidebar from './Sidebar.jsx'
import CreationBench from './CreationBench.jsx'
import TitleBar from './TitleBar.jsx'
import ClipReceiver from './ClipReceiver.jsx'
import Tutorial from './Tutorial.jsx'

// The persistent app frame: an optional custom title bar (frameless Electron
// only) above a fixed 200px sidebar + flexible main column. Dark only,
// full-window. The main column is a flex container so canvases and scroll
// regions can claim the remaining height cleanly. Creation Bench tool windows
// live here so they can open over any route.
export default function AppLayout({ children }) {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg)] text-ink transition-colors duration-200">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</main>
      </div>
      <CreationBench />
      <ClipReceiver />
      <Tutorial />
    </div>
  )
}
