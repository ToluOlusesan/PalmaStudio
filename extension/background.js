// Palma Clipper — service worker. Adds a right-click "Save image to Palma" item
// and POSTs the image URL + page context to Palma's local ingest server, which
// downloads it and drops it into the Inbox project.
const ENDPOINT = 'http://127.0.0.1:47821'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'palma-save-image',
    title: 'Save image to Palma',
    contexts: ['image'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'palma-save-image' || !info.srcUrl) return
  await clip(info.srcUrl, tab)
})

async function clip(imageUrl, tab) {
  try {
    const res = await fetch(`${ENDPOINT}/clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        sourceUrl: tab?.url || '',
        title: tab?.title || '',
      }),
    })
    notify(res.ok ? 'Saved to Palma Inbox' : 'Palma could not save this image')
  } catch {
    notify('Palma is not running')
  }
}

function notify(message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Palma Clipper',
      message,
    })
  } catch {
    /* notifications optional */
  }
}
