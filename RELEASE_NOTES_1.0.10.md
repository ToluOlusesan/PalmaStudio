# Palma 1.0.10 Release Notes

Release date: 2026-07-05

## Summary

Palma 1.0.10 fixes the remaining web-image clipboard persistence issue reported by testers after 1.0.9. The problem affected images copied from sites such as Pinterest and pasted with Ctrl+V into an existing Palma project. Local files placed from disk were not affected.

## What Changed Since 1.0.9

### Fixed: Pinterest/web clipboard images could reopen broken

- Pasted web images now land durably as soon as their bytes are written to the project assets folder.
- Palma no longer waits for image-size decoding before creating and flushing the board item.
- The image-size pass still runs afterward, but only as visual polish. If the user switches to Focus, changes projects, or closes/reopens quickly, the saved board item is already in the session.

### Fixed: copied web images that arrive as URL/HTML clipboard data

- Some websites place image copies on the clipboard as HTML, such as an `<img src="...">`, or as a direct URL instead of bitmap bytes.
- Palma now detects those clipboard formats and downloads the image into project assets instead of storing a brittle remote URL reference.
- The Electron main process performs the download so renderer-side CORS and hotlink restrictions are less likely to block persistence.

### Improved: project folders for desktop persistence

- Desktop projects created without choosing a folder now receive an automatic app-data project folder.
- This gives pasted internet images a real `assets/` location instead of falling back to large inline data inside localStorage.

## Files Changed

- `src/hooks/useDrop.js`
- `src/utils/platform.js`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/modules/dashboard/Dashboard.jsx`
- `package.json`
- `package-lock.json`

## Verification

- `npm run build`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
