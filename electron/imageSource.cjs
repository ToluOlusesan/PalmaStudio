// Full-resolution image resolution + download, shared by the paste/drop path
// (`download-image-url` in main.cjs) and the browser-extension clip server.
//
// Why this exists: what a site *displays* is almost never the file it *has*.
// Pinterest serves a 236px thumbnail into the grid, Twitter a `name=small`
// crop, Tumblr a `_500`. Saving the URL you were handed means saving the
// thumbnail — the image lands on the board soft and unusable at print size.
// So before downloading we rewrite the URL into an ordered list of candidates,
// biggest first, and take the first one that actually serves image bytes. The
// raw URL is always the last candidate, so a rewrite that a CDN rejects costs
// one failed request and nothing else.

// A believable browser UA: several CDNs (pinimg among them) 403 an obviously
// scripted agent, which is what made "full res" fail before it could start.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i

// Query params that are pure display-size directives on the CDNs that use them.
// Stripping them asks for the unresized original; if a host needs them, that
// candidate 404s and we fall through to the untouched URL.
const SIZE_PARAMS = ['w', 'width', 'h', 'height', 'q', 'quality', 'fit', 'resize', 'crop', 'sz', 'size', 'dpr']

const uniq = (arr) => [...new Set(arr.filter(Boolean))]

// i.pinimg.com/<size>/ab/cd/ef/hash.jpg — <size> is 236x, 474x, 564x, 736x,
// 1200x or `originals`. `originals` is the real upload, and it isn't always the
// same file type as the thumbnail (an animated pin is a static .jpg at 236x and
// a .gif at originals), so we probe the common extensions too — this is what
// makes a Pinterest GIF arrive as an actual GIF.
function pinterest(u) {
  const m = u.pathname.match(/^\/(originals|\d+x\d*)\/(.+)$/)
  if (!m) return []
  const rest = m[2]
  const stem = rest.replace(IMAGE_EXT_RE, '')
  const ext = (rest.match(IMAGE_EXT_RE) || [''])[0]
  const at = (size, tail) => `${u.origin}/${size}/${tail}`
  return uniq([
    ext && at('originals', stem + ext),
    at('originals', stem + '.gif'),
    at('originals', stem + '.png'),
    at('originals', stem + '.jpg'),
    at('originals', stem + '.webp'),
    at('1200x', rest),
    at('736x', rest),
    at('564x', rest),
  ])
}

function twitter(u) {
  const out = []
  // pbs.twimg.com/media/<id>?format=jpg&name=small → name=orig
  if (u.searchParams.has('name') || u.searchParams.has('format')) {
    const big = new URL(u)
    big.searchParams.set('name', 'orig')
    out.push(big.toString())
  }
  // legacy :large / :small suffix
  const suffix = u.pathname.match(/:(thumb|small|medium|large|orig)$/)
  if (suffix) out.push(u.origin + u.pathname.replace(/:(thumb|small|medium|large)$/, ':orig') + u.search)
  else if (!u.search) out.push(`${u.origin}${u.pathname}:orig`)
  return out
}

function tumblr(u) {
  const m = u.pathname.match(/_(\d{2,4})(\.[a-z0-9]+)$/i)
  if (!m) return []
  return [`${u.origin}${u.pathname.replace(/_\d{2,4}(\.[a-z0-9]+)$/i, '_1280$1')}${u.search}`]
}

function shopify(u) {
  // …/files/shirt_400x400.jpg?v=1 → …/files/shirt.jpg
  const stripped = u.pathname.replace(/_(\d+x\d*|x\d+)(?=\.[a-z0-9]+$)/i, '')
  return stripped === u.pathname ? [] : [u.origin + stripped]
}

function squarespace(u) {
  const big = new URL(u)
  big.searchParams.set('format', '2500w')
  return [big.toString()]
}

// Drop the display-size query params, keeping everything else (tokens, cache
// busters) intact.
function withoutSizeParams(u) {
  const clean = new URL(u)
  let touched = false
  for (const k of SIZE_PARAMS) {
    if (clean.searchParams.has(k)) {
      clean.searchParams.delete(k)
      touched = true
    }
  }
  return touched ? [clean.toString()] : []
}

// Ordered biggest-first candidates for `rawUrl`, always ending with it.
function fullResCandidates(rawUrl) {
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    return [rawUrl]
  }
  if (!['http:', 'https:'].includes(u.protocol)) return [rawUrl]
  const host = u.hostname.toLowerCase()
  let out = []
  if (/(^|\.)pinimg\.com$/.test(host)) out = pinterest(u)
  else if (/(^|\.)twimg\.com$/.test(host)) out = twitter(u)
  else if (/(^|\.)media\.tumblr\.com$/.test(host) || /(^|\.)tumblr\.com$/.test(host)) out = tumblr(u)
  else if (/(^|\.)shopify\.com$/.test(host)) out = shopify(u)
  else if (/squarespace-cdn\.com$/.test(host)) out = squarespace(u)
  else out = withoutSizeParams(u)
  return uniq([...out, rawUrl])
}

// Fetch one candidate. Returns { buffer, contentType } or null. The Referer is
// set to the image's own origin: enough to satisfy the common hotlink checks
// without leaking the page the user was browsing.
async function fetchImage(url, { timeoutMs = 8000, maxBytes } = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const origin = new URL(url).origin
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'user-agent': UA,
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        referer: origin + '/',
      },
    })
    if (!res.ok) return null
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
    if (!contentType.toLowerCase().startsWith('image/')) return null
    // Refuse on the declared length before reading the body — checking only
    // after buffering can't stop the allocation it's meant to bound.
    const declared = Number(res.headers.get('content-length'))
    if (maxBytes && Number.isFinite(declared) && declared > maxBytes) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (!buffer.length) return null
    if (maxBytes && buffer.length > maxBytes) return null // no content-length header
    return { buffer, contentType }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Download `rawUrl` at the best resolution the host will serve.
// Returns { buffer, contentType, url } for the candidate that won, or null.
//
// The candidate ladder is bounded twice over: each request gets 8s, and the
// walk as a whole gets `budgetMs`. Without the overall budget an unreachable
// CDN could hold a drop open for the sum of every candidate's timeout — minutes
// of an empty board — before the fallback ever ran. The raw URL is always the
// last candidate, so it is tried even as the budget runs out.
async function downloadBestImage(rawUrl, { maxBytes = 64 * 1024 * 1024, budgetMs = 25000 } = {}) {
  const candidates = fullResCandidates(rawUrl)
  const deadline = Date.now() + budgetMs
  for (let i = 0; i < candidates.length; i++) {
    const last = i === candidates.length - 1
    if (!last && Date.now() > deadline) continue // skip ahead to the raw URL
    const got = await fetchImage(candidates[i], { maxBytes })
    if (got) return { ...got, url: candidates[i] }
  }
  return null
}

function extFromMime(mime = '') {
  const clean = mime.split(';')[0].trim().toLowerCase()
  if (clean === 'image/jpeg' || clean === 'image/jpg') return 'jpg'
  if (clean === 'image/svg+xml') return 'svg'
  if (clean.startsWith('image/')) return clean.slice(6).replace(/[^a-z0-9]/g, '') || 'png'
  return 'png'
}

module.exports = { fullResCandidates, downloadBestImage, extFromMime, UA }
