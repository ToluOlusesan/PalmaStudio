import { useNavigate } from 'react-router-dom'
import { SquaresFour, Stack, Plus, CaretLeft, CaretRight, MoonStars, Sun, Question, Trash } from '@phosphor-icons/react'
import Logo from './Logo.jsx'
import NavItem from './NavItem.jsx'
import { useProjectStore } from '../store/projectStore.js'
import { useSettingsStore } from '../store/settingsStore.js'
import { thumbTint } from '../utils/format.js'

// Group label — 10px uppercase, 0.08em tracking, ink-3.
function SectionLabel({ children }) {
  return (
    <div className="px-2 pt-5 pb-1.5 text-[10px] uppercase tracking-[0.08em] text-ink-3">
      {children}
    </div>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar)
  const darkMode = useSettingsStore((s) => s.darkMode)
  const toggleDarkMode = useSettingsStore((s) => s.toggleDarkMode)
  const replayTips = useSettingsStore((s) => s.replayTips)

  const recents = [...projects]
    .filter((p) => !p.deleted)
    .sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened))
    .slice(0, 5)

  const trashCount = projects.filter((p) => p.deleted).length

  // The coloured project chip used as a recent item's icon. The user-chosen tint
  // (thumbColor) wins; otherwise the first extracted palette colour.
  const chip = (p) => () => (
    <span
      className="block w-[15px] h-[15px] rounded-[3px] shrink-0"
      style={{ background: thumbTint(p.thumbColor) || p.palette?.[0] || 'var(--surface-3)', border: '0.5px solid var(--border-2)' }}
    />
  )

  return (
    <aside
      className={`${collapsed ? 'w-[56px]' : 'w-[200px]'} shrink-0 flex flex-col bg-surface border-r-[0.5px] h-full transition-[width] duration-150 ease`}
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Logo lockup + collapse toggle */}
      <div
        className={`h-[52px] flex items-center border-b-[0.5px] ${collapsed ? 'justify-center px-0' : 'gap-2 px-4'}`}
      >
        {collapsed ? (
          <button
            onClick={toggleSidebar}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="group grid place-items-center w-8 h-8 rounded-md hover:bg-[var(--sand-hover)] transition-colors"
          >
            {/* logo, swapped to an expand chevron on hover */}
            <span style={{ color: 'var(--accent)' }} className="group-hover:hidden">
              <Logo width={24} height={18} />
            </span>
            <CaretRight size={15} className="hidden group-hover:block text-ink-2" />
          </button>
        ) : (
          <>
            <span style={{ color: 'var(--accent)' }}>
              <Logo width={26} height={20} />
            </span>
            <span className="font-serif text-[17px] text-ink leading-none tracking-[-0.3px]">
              Palma
            </span>
            <button
              onClick={toggleSidebar}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="ml-auto -mr-1 grid place-items-center w-6 h-6 rounded-md text-ink-3 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors"
            >
              <CaretLeft size={14} weight="regular" />
            </button>
          </>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto pb-3 ${collapsed ? 'px-2' : 'px-2.5'}`}>
        <div className="pt-3 flex flex-col gap-0.5">
          <NavItem to="/dashboard" icon={SquaresFour} label="Projects" collapsed={collapsed} />
          <NavItem to="/library" icon={Stack} label="Library" collapsed={collapsed} />
          {trashCount > 0 && (
            <NavItem to="/trash" icon={Trash} label="Trash" badge={trashCount} collapsed={collapsed} />
          )}
        </div>

        {recents.length > 0 && (
          <>
            {collapsed ? (
              <div className="h-px my-3 mx-1 bg-[var(--border)]" />
            ) : (
              <SectionLabel>Recent</SectionLabel>
            )}
            <div className="flex flex-col gap-0.5">
              {recents.map((p) => (
                <NavItem
                  key={p.id}
                  to={`/project/${p.id}/dumpboard`}
                  icon={chip(p)}
                  label={p.name}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </>
        )}
      </nav>

      {/* Footer: dark-mode switch (same MoonStars mark that used to live on the
          Focus board — now app-wide + persisted) stacked on top of the New
          project primary action. */}
      <div className={`py-3 border-t-[0.5px] flex flex-col gap-1.5 ${collapsed ? 'px-2' : 'px-2.5'}`}>
        <button
          onClick={replayTips}
          title="Show tips"
          aria-label="Replay the tutorial tips"
          className={`w-full flex items-center h-8 rounded-md text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors ${
            collapsed ? 'justify-center px-0' : 'gap-2 px-2.5'
          }`}
        >
          <Question size={16} weight="regular" />
          {!collapsed && <span className="text-[12px]">Show tips</span>}
        </button>
        <button
          onClick={toggleDarkMode}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={darkMode}
          className={`w-full flex items-center h-8 rounded-md text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] transition-colors ${
            collapsed ? 'justify-center px-0' : 'gap-2 px-2.5'
          }`}
        >
          {/* Icon shows what you'll SWITCH TO, not the current state — a moon
              while light (click for dark), a sun while dark (click for light).
              Distinct icons, not just a fill-weight change on one mark. */}
          {darkMode ? <Sun size={16} weight="regular" /> : <MoonStars size={16} weight="regular" />}
          {!collapsed && <span className="text-[12px]">{darkMode ? 'Dark mode' : 'Light mode'}</span>}
        </button>
        <button
          onClick={() => navigate('/dashboard?new=1')}
          title={collapsed ? 'New project' : undefined}
          className={`w-full flex items-center justify-center h-9 rounded-md bg-accent text-accent-fg font-medium text-[12px] hover:opacity-90 transition-opacity duration-[120ms] ease active:scale-[0.98] ${
            collapsed ? '' : 'gap-2 px-3'
          }`}
        >
          <Plus size={collapsed ? 16 : 14} weight="bold" />
          {!collapsed && 'New project'}
        </button>
      </div>
    </aside>
  )
}
