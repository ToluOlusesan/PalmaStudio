import { NavLink } from 'react-router-dom'

// Sidebar nav row. 32px tall, 6px radius, 15px Phosphor icon, 8px gap.
// Default ink-2; hover sand fill + ink; active surface-3 + ink + weight 500.
// `collapsed` renders icon-only (centred) with the label as a hover tooltip.
export default function NavItem({ to, icon: Icon, label, end = false, badge, onClick, collapsed = false }) {
  const inner = (active) => (
    <>
      {Icon && (
        <Icon
          size={15}
          weight="regular"
          className="shrink-0"
          style={{ color: active ? 'var(--ink)' : 'inherit' }}
        />
      )}
      {!collapsed && <span className="flex-1 truncate text-[13px] leading-none">{label}</span>}
      {!collapsed && badge != null && (
        <span className="text-[10px] text-ink-3 tabular-nums">{badge}</span>
      )}
    </>
  )

  const cls = (active) =>
    `flex items-center h-8 rounded-md transition-colors duration-[120ms] ease ` +
    (collapsed ? 'justify-center px-0 ' : 'gap-2 px-2 ') +
    (active
      ? 'bg-surface-3 text-ink font-medium'
      : 'text-ink-2 hover:bg-[var(--sand-hover)] hover:text-ink')

  const tip = collapsed ? label : undefined

  if (!to) {
    return (
      <button type="button" onClick={onClick} title={tip} className={cls(false) + ' w-full text-left'}>
        {inner(false)}
      </button>
    )
  }

  return (
    <NavLink to={to} end={end} title={tip} className={({ isActive }) => cls(isActive)}>
      {({ isActive }) => inner(isActive)}
    </NavLink>
  )
}
