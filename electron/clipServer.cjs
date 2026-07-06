// Local ingest server for the Palma browser extension. Listens on loopback
// only; the extension POSTs an image URL + source metadata, we download the
// bytes here (no page CORS) and relay them to the renderer, which routes the
// clip into the Inbox project.
//
// Security: bound to 127.0.0.1, and we reject any request whose Origin is a
// website (http/https) — browsers set Origin, so a malicious page can't CSRF
// this endpoint. Extension requests carry a chrome-extension:// origin (or
// none), which we allow.
const http = require('http')

const PORT = 47821
const MAX_BYTES = 25 * 1024 * 1024

function isBlockedOrigin(origin) {
  return !!origin && /^https?:\/\//i.test(origin)
}

function cors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

async function downloadImage(url) {
  const r = await fetch(url)
  if (!r.ok) return null
  const contentType = r.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) return null
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > MAX_BYTES) return null
  return `data:${contentType};base64,${buf.toString('base64')}`
}

// getWindow() returns the BrowserWindow to deliver clips to (or null).
function startClipServer(getWindow) {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin
    if (req.method === 'OPTIONS') {
      cors(res, origin)
      res.writeHead(204)
      return res.end()
    }
    if (isBlockedOrigin(origin)) {
      res.writeHead(403)
      return res.end('forbidden')
    }
    cors(res, origin)

    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ app: 'palma', ok: true }))
    }

    if (req.method === 'POST' && req.url === '/clip') {
      let body = ''
      req.on('data', (c) => {
        body += c
        if (body.length > 2 * 1024 * 1024) req.destroy() // url payload only; small
      })
      req.on('end', async () => {
        try {
          const { imageUrl, sourceUrl, title } = JSON.parse(body || '{}')
          if (!imageUrl) {
            res.writeHead(400)
            return res.end('no imageUrl')
          }
          const imageDataUrl = await downloadImage(imageUrl)
          if (!imageDataUrl) {
            res.writeHead(502)
            return res.end('download failed')
          }
          const win = getWindow()
          if (!win) {
            res.writeHead(503)
            return res.end('app window not ready')
          }
          win.webContents.send('clip-received', { imageDataUrl, sourceUrl, title })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end('bad request')
        }
      })
      return
    }

    res.writeHead(404)
    res.end('not found')
  })

  server.on('error', (e) => {
    // EADDRINUSE etc. — another instance is likely already serving; skip.
    console.warn('[palma] clip server:', e.message)
  })
  server.listen(PORT, '127.0.0.1')
  return server
}

module.exports = { startClipServer, PORT }
