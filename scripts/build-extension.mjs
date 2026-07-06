// Builds the Palma Clipper browser extension for Chrome and Firefox.
//
// The source of truth lives in /extension (Chrome MV3). Firefox MV3 needs two
// tweaks: a `browser_specific_settings.gecko` block (for a stable add-on id)
// and an event-page background (`background.scripts`) instead of Chrome's
// `service_worker`. background.js itself works unchanged in both browsers
// because it only uses the cross-browser `chrome.*` APIs.
//
// Output: release/extension/{chrome,firefox}/ folders + matching .zip files.

import { execSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'extension')
const out = join(root, 'release', 'extension')

const shared = ['background.js', 'popup.html', 'popup.js', 'icon32.png', 'icon128.png']
const base = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'))

function build(target, manifest) {
  const dir = join(out, target)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const f of shared) cpSync(join(src, f), join(dir, f))
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  zip(dir, join(out, `palma-clipper-${target}-v${manifest.version}.zip`))
  console.log(`✓ ${target}: ${dir}`)
}

function zip(dir, zipPath) {
  rmSync(zipPath, { force: true })
  // PowerShell Compress-Archive zips the folder *contents* when given dir/*.
  const cmd = `Compress-Archive -Path '${dir}\\*' -DestinationPath '${zipPath}' -Force`
  execSync(`powershell -NoProfile -Command "${cmd}"`, { stdio: 'inherit' })
}

// --- Chrome / Chromium (Edge, Brave, Arc): the source manifest as-is ---
build('chrome', base)

// --- Firefox ---
const firefox = {
  ...base,
  browser_specific_settings: {
    gecko: {
      id: 'palma-clipper@palma.app',
      strict_min_version: '121.0',
      // AMO requires new extensions to declare data collection. The clipper only
      // POSTs an image URL to the local Palma app — it gathers no user data — so
      // this is the explicit "none" declaration Mozilla now mandates.
      data_collection_permissions: {
        required: ['none'],
      },
    },
  },
  // Firefox MV3 uses an event page, not a service worker.
  background: { scripts: ['background.js'] },
}
build('firefox', firefox)

console.log(`\nDone. Packages in: ${out}`)
