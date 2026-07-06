# Palma Clipper (browser extension)

Save images from anywhere on the web straight into your Palma **Inbox** project.

## Install (load unpacked)

1. Make sure **Palma is running** (it hosts the local ingest server on
   `127.0.0.1:47821`).
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select this `extension/` folder.
5. The popup should show **Connected to Palma**.

Works in any Chromium browser (Chrome, Edge, Brave, Arc).

## Use

- **Right-click any image → "Save image to Palma."** It downloads into your
  Inbox project's `assets/` and appears on the Inbox board.
- Click the toolbar icon to check the connection status.

## How it talks to Palma

The extension POSTs the image URL + page title/URL to `http://127.0.0.1:47821/clip`.
Palma downloads the bytes (no page CORS), saves them, and routes the clip to the
Inbox. The server is bound to loopback and rejects requests whose `Origin` is a
website, so only the extension can reach it.
