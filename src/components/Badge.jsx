// Small status badge. Default = neutral surface chip. `warning` = the amber
// 'missing' badge reserved exclusively for missing-file states (brand rule).
export default function Badge({ children, variant = 'default', className = '', style }) {
  const styles =
    variant === 'warning'
      ? {
          background: 'var(--warning-bg)',
          color: 'var(--warning)',
          border: '0.5px solid var(--warning-border)',
        }
      : {
          background: 'var(--surface-3)',
          color: 'var(--ink-2)',
          border: '0.5px solid var(--border)',
        }
  return (
    <span
      className={`inline-flex items-center rounded-[4px] px-[5px] py-[2px] text-[9px] leading-none tracking-wide ${className}`}
      style={{ ...styles, ...style }}
    >
      {children}
    </span>
  )
}
