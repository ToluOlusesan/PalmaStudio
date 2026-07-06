import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from '@phosphor-icons/react'
import { isElectron } from '../utils/platform.js'

// Custom window chrome for the frameless Electron window. The bar itself is the
// drag region (-webkit-app-region: drag); the control cluster opts out so the
// buttons stay clickable. Renders ONLY under Electron — the web and Tauri builds
// keep their native OS frame, so this returns null there.
export default function TitleBar() {
  if (!isElectron()) return null
  return <TitleBarInner />
}

function TitleBarInner() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const wc = window.windowControls
    if (!wc?.onMaximizedChange) return
    return wc.onMaximizedChange(setMaximized) // returns an unsubscribe fn
  }, [])

  const wc = window.windowControls || {}

  return (
    <div
      className="h-8 shrink-0 flex items-center justify-between bg-surface border-b-[0.5px] select-none"
      style={{ WebkitAppRegion: 'drag', borderColor: 'var(--border)' }}
    >
      <span className="pl-3 font-serif text-[12px] text-ink-3 leading-none tracking-[-0.2px]">
        Palma
      </span>

      {/* control cluster — opts out of the drag region so clicks register */}
      <div className="flex items-stretch h-full" style={{ WebkitAppRegion: 'no-drag' }}>
        <WinBtn label="Minimize" onClick={() => wc.minimize?.()}>
          <Minus size={14} />
        </WinBtn>
        <WinBtn label={maximized ? 'Restore' : 'Maximize'} onClick={() => wc.toggleMaximize?.()}>
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </WinBtn>
        <WinBtn label="Close" danger onClick={() => wc.close?.()}>
          <X size={14} />
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({ children, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid place-items-center w-11 h-full text-ink-2 transition-colors ${
        danger
          ? 'hover:bg-[#a23b34] hover:text-white'
          : 'hover:bg-[var(--sand-hover)] hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
