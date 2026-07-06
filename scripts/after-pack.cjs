// Strips files that ship with Electron/Chromium but Palma doesn't need.
// Runs after electron-builder lays out win-unpacked, before packing the installer.
const fs = require('fs');
const path = require('path');

module.exports = async ({ appOutDir }) => {
  const rm = (rel) => {
    const p = path.join(appOutDir, rel);
    try {
      fs.rmSync(p, { force: true, recursive: true });
      console.log('[after-pack] removed', rel);
    } catch (e) {
      console.warn('[after-pack] could not remove', rel, e.message);
    }
  };

  // ~20 MB of Chromium license text, never read at runtime.
  rm('LICENSES.chromium.html');

  // DirectX shader compiler for WebGPU (~26 MB). Palma uses 2D canvas, not WebGPU.
  rm('dxcompiler.dll');
  rm('dxil.dll');

  // NOTE: intentionally KEEPING vk_swiftshader.dll / vulkan-1.dll.
  // They are the software-rendering fallback; removing them breaks the
  // canvas on machines with no usable GPU (VMs, RDP, stale drivers).
};
