import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
// base './' makes built asset URLs relative, so the same dist/ loads both from
// Tauri's protocol and from Electron's file:// (loadFile).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
