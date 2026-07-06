import { NavLink } from 'react-router-dom'

// 40px module tab bar. Tabs change only colour + a 1.5px accent underline on
// the active tab — no background shift (spec). Active also goes weight 500.
// NB: the underline is intentionally a plain element. A framer `layoutId` here
// deadlocks the app's route-level `AnimatePresence mode="wait"` (the exit waits
// on a shared-layout animation that waits on the next route to mount), leaving a
// permanent white page when leaving a project.
export default function ModuleTabBar({ projectId, tabs }) {
  return (
    <div
      className="h-10 shrink-0 flex items-stretch gap-0 px-3 bg-surface border-b-[0.5px] overflow-x-auto"
      style={{ borderColor: 'var(--border)' }}
    >
      {tabs.map((t) => (
        <NavLink
          key={t.key}
          to={`/project/${projectId}/${t.key}`}
          className={({ isActive }) =>
            `relative flex items-center px-3.5 text-[12px] whitespace-nowrap transition-colors duration-[120ms] ` +
            (isActive
              ? 'text-ink font-medium'
              : 'text-ink-3 hover:text-ink-2')
          }
        >
          {({ isActive }) => (
            <>
              {t.label}
              {isActive && (
                <span
                  className="absolute left-2 right-2 bottom-0 h-[1.5px] rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}
