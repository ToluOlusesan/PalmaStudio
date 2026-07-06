// Button — four variants from the spec. 12px Inter, radius 6px, 120ms ease.
// Styling stays in Tailwind utility space; we map variant → class set.
const base =
  'inline-flex items-center justify-center gap-1.5 text-[12px] leading-none rounded-md ' +
  'px-3.5 py-1.5 select-none transition-colors duration-[120ms] ease whitespace-nowrap ' +
  'disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]'

const variants = {
  default:
    'bg-transparent text-ink-2 border-[0.5px] border-[var(--border-2)] ' +
    'hover:bg-[var(--sand-hover)] hover:text-ink',
  primary:
    'bg-accent text-accent-fg font-medium border-none hover:opacity-90',
  tool:
    'bg-transparent text-ink-2 border-[0.5px] border-transparent ' +
    'hover:bg-surface-3 hover:text-ink hover:border-[var(--border)]',
  'tool-active':
    'bg-accent text-accent-fg font-medium border-[0.5px] border-transparent',
  ghost: 'bg-transparent text-ink-2 hover:text-ink hover:bg-[var(--sand-hover)] border-none',
}

export default function Button({
  variant = 'default',
  icon: Icon,
  iconRight = false, // render the icon after the label instead of before it
  iconWeight = 'regular',
  iconSize = 14,
  children,
  className = '',
  ...props
}) {
  const iconOnly = !children
  const glyph = Icon && <Icon size={iconSize} weight={iconWeight} />
  return (
    <button
      type="button"
      className={`${base} ${variants[variant] || variants.default} ${
        iconOnly ? 'px-2' : ''
      } ${className}`}
      {...props}
    >
      {!iconRight && glyph}
      {children}
      {iconRight && glyph}
    </button>
  )
}
