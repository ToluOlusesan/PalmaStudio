import { useNavigate } from 'react-router-dom'
import { CaretRight } from '@phosphor-icons/react'

// 52px topbar. Page title in 18px DM Serif, or a breadcrumb trail for project
// views. Right slot holds contextual actions (search, share, save status).
export default function Topbar({ title, crumbs, right }) {
  const navigate = useNavigate()
  return (
    <header
      className="h-[52px] shrink-0 flex items-center justify-between px-5 bg-surface border-b-[0.5px]"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {crumbs ? (
          crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-2 min-w-0">
              {i > 0 && <CaretRight size={12} className="text-ink-3 shrink-0" />}
              {c.to ? (
                <button
                  onClick={() => navigate(c.to)}
                  className={`truncate transition-colors ${
                    i === crumbs.length - 1
                      ? 'font-serif text-[18px] text-ink'
                      : 'text-[12px] text-ink-2 hover:text-ink'
                  }`}
                >
                  {c.label}
                </button>
              ) : (
                <span
                  className={`truncate ${
                    i === crumbs.length - 1
                      ? 'font-serif text-[18px] text-ink'
                      : 'text-[12px] text-ink-2'
                  }`}
                >
                  {c.label}
                </span>
              )}
            </span>
          ))
        ) : (
          <h1 className="font-serif text-[18px] text-ink leading-none">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">{right}</div>
    </header>
  )
}
