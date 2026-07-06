import { create } from 'zustand'

// App-level settings. Folders are chosen per-project now (at creation), so this
// tracks the first-launch welcome plus which one-time tutorial tips have been
// seen (so each teaching moment shows once, and the whole tour can be replayed).
const KEY = 'palma.settings'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

const initial = load()

export const useSettingsStore = create((set, get) => ({
  onboarded: !!initial.onboarded,
  sidebarCollapsed: !!initial.sidebarCollapsed,
  darkMode: !!initial.darkMode, // app-wide dark theme; user-controlled + persisted

  // First-run teaching. `seenTips` maps a tip id → true once dismissed; `tipsOff`
  // suppresses all remaining tips (the "Skip tour" / turn-off choice).
  seenTips: initial.seenTips && typeof initial.seenTips === 'object' ? initial.seenTips : {},
  tipsOff: !!initial.tipsOff,

  // Persist the durable settings (transient ones aren't saved).
  persist: () => {
    try {
      const { onboarded, sidebarCollapsed, darkMode, seenTips, tipsOff } = get()
      localStorage.setItem(KEY, JSON.stringify({ onboarded, sidebarCollapsed, darkMode, seenTips, tipsOff }))
    } catch {
      /* ignore */
    }
  },

  completeOnboarding: () => {
    set({ onboarded: true })
    get().persist()
  },

  reopenWelcome: () => set({ onboarded: false }),

  // Mark one tutorial tip as seen so it won't show again.
  markTipSeen: (id) => {
    set((s) => ({ seenTips: { ...s.seenTips, [id]: true } }))
    get().persist()
  },

  // Turn off all remaining tips (Skip tour).
  skipTips: () => {
    set({ tipsOff: true })
    get().persist()
  },

  // Replay the whole tour: forget seen tips and re-enable them. The controller
  // will then re-show the tip for whatever screen you're on.
  replayTips: () => {
    set({ seenTips: {}, tipsOff: false })
    get().persist()
  },

  toggleSidebar: () => {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
    get().persist()
  },

  toggleDarkMode: () => {
    set((s) => ({ darkMode: !s.darkMode }))
    get().persist()
  },
}))
