import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
// Self-hosted fonts (bundled into dist) so the app renders identically offline —
// no dependency on the Google Fonts CDN. Weights mirror what the design uses:
// Inter 300/400/500, DM Serif Display 400 + italic, JetBrains Mono 400.
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/dm-serif-display/400-italic.css'
import '@fontsource/jetbrains-mono/400.css'
import './index.css'

// Under Electron the app is loaded from file://, where clean-URL routing fails
// (history.pushState to a new path throws on a file: origin). Hash routing works
// everywhere, so use it when served from a file; keep clean URLs for the web and
// Tauri (real http(s)/tauri origins).
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
)
