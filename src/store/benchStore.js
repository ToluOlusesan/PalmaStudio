import { create } from 'zustand'

// Creation Bench is a persistent, cross-project utility surface — not tied to a
// module — so its tools open as global overlays from the sidebar on any screen.
// This store just tracks which tool (if any) is currently open.
export const useBenchStore = create((set) => ({
  tool: null, // null | 'frameExtract' | 'colorPick'
  open: (tool) => set({ tool }),
  close: () => set({ tool: null }),
}))
