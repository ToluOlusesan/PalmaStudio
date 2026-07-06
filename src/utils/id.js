// Short, readable ids. Editorial over cryptographic — these land in
// session filenames and never leave the machine.
export function uid(prefix = 'id') {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 7)
  return `${prefix}_${t}${r}`
}
