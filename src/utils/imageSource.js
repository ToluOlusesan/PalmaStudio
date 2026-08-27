// Working out which URL a web drag/paste is REALLY offering.
//
// When you drag an image out of a browser, the drop carries three things: a
// throwaway temp file of the pixels the page was displaying, an HTML fragment
// of the <img> tag, and a URL. The temp file is the *rendered* image — on a
// grid site like Pinterest that's a 236px thumbnail, not the upload. The HTML
// fragment, though, still carries the tag's `srcset`, which lists every size
// the site publishes. So we read the markup, take the biggest candidate, and
// hand that URL to the downloader (which upgrades it further host-side — see
// electron/imageSource.cjs). The dragged bytes stay as the fallback.

const IMAGE_URL_RE = /^https?:\/\/\S+\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?\S*)?$/i
// Extension-less image endpoints (Twitter's media host, most image proxies)
// declare the format in a query param instead.
const IMAGE_QUERY_RE = /[?&](format|fm|ext)=(png|jpe?g|gif|webp|avif)\b/i
// Hosts that only ever serve image bytes, so a bare path is still an image.
// Image CDNs only — never a site's own domain (imgur.com serves gallery *pages*
// at paths that look just like i.imgur.com's file paths).
const IMAGE_HOST_RE = /(^|\.)(pinimg\.com|twimg\.com|media\.tumblr\.com|cdninstagram\.com|i\.imgur\.com|squarespace-cdn\.com)$/i

// Is this URL a direct link to image bytes (rather than a page about an image)?
export function isDirectImageUrl(url) {
  if (!/^https?:\/\//i.test(url || '')) return false
  if (IMAGE_URL_RE.test(url) || IMAGE_QUERY_RE.test(url)) return true
  try {
    return IMAGE_HOST_RE.test(new URL(url).hostname)
  } catch {
    return false
  }
}

// Biggest entry in a `srcset` attribute. Width descriptors ("… 1200w") win over
// pixel-density ones ("… 2x") when a tag mixes them, since they're absolute.
//
// Entries are split on a comma FOLLOWED BY WHITESPACE, not on every comma:
// image-CDN URLs routinely carry commas inside a path segment
// (`/upload/w_300,h_200,c_fill/…`), and splitting those apart yields a
// truncated string that still looks like a URL and quietly 404s. Anything that
// doesn't parse as a URL is skipped rather than guessed at.
export function largestFromSrcset(srcset = '') {
  let best = null
  let bestW = -1
  let bestX = -1
  for (const part of srcset.split(/,\s+/)) {
    const bits = part.trim().split(/\s+/)
    const url = bits[0]
    if (!url) continue
    try {
      new URL(url, typeof location === 'undefined' ? 'https://example.invalid' : location.href)
    } catch {
      continue
    }
    const descriptor = bits[1] || '1x'
    const n = parseFloat(descriptor)
    if (!Number.isFinite(n)) continue
    if (descriptor.endsWith('w')) {
      if (n > bestW) {
        bestW = n
        best = url
      }
    } else if (bestW < 0 && n > bestX) {
      bestX = n
      best = url
    }
  }
  return best
}

// Best image URL inside an HTML fragment (a dragged/copied <img>).
//
// Only when the fragment holds exactly ONE image. A drag or copy of a single
// image — the case this exists for — always produces a lone <img>; a fragment
// with several is a copied chunk of page, and there's no way to tell which
// picture the user meant. Guessing there would swap in a logo or an avatar and,
// worse, make the caller discard the bytes actually dropped.
export function imageUrlFromHtml(html = '') {
  if (!html) return ''
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    doc = null
  }
  const imgs = doc ? doc.querySelectorAll('img') : []
  if (imgs.length > 1) return ''
  const img = imgs[0]
  if (img) {
    const fromSet = largestFromSrcset(img.getAttribute('srcset') || '')
    const src = img.getAttribute('src') || ''
    for (const candidate of [fromSet, src]) {
      if (candidate && /^https?:\/\//i.test(candidate)) return candidate
    }
  }
  // Fallback for fragments DOMParser can't make sense of — same one-image rule.
  if ((html.match(/<img\b/gi) || []).length > 1) return ''
  const m = /<img\b[^>]*\bsrc=(["']?)(https?:\/\/[^"'\s>]+)\1/i.exec(html)
  return m?.[2] || ''
}

// The best remote image URL a DataTransfer (drop or paste) is offering, or ''.
// Order: the markup's srcset/src (richest), then the dragged URL itself.
export function imageUrlFromTransfer(dt) {
  if (!dt) return ''
  const fromHtml = imageUrlFromHtml(dt.getData('text/html') || '')
  if (fromHtml) return fromHtml
  const url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').trim()
  return isDirectImageUrl(url) ? url : ''
}
