# ============================================================================
# Palma Windows installer build.
#
# Run via:  npm run installer
#
# Why this script exists: a bare `electron-builder` run on this machine
# OOM-crashes during the 7za/asar packing step. Two mitigations, both required:
#   1. Pin this process (and every child — vite, electron-builder, 7za inherit
#      the affinity) to the first 4 cores, which throttles 7za's parallelism.
#   2. Raise the Node heap to 8 GB via NODE_OPTIONS.
# It also kills any running Palma/electron instance (locked files break the
# packer) and clears stale win-unpacked output before building.
# ============================================================================

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

# 1. Pin to first 4 cores; children inherit.
(Get-Process -Id $PID).ProcessorAffinity = [IntPtr]0xF
Write-Output ("affinity 0x{0:X}, heap 8GB" -f [int64](Get-Process -Id $PID).ProcessorAffinity)

# 2. Bigger Node heap for vite + electron-builder.
$env:NODE_OPTIONS = '--max-old-space-size=8192'

# 3. Kill anything holding files in release/.
Get-Process Palma, electron -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

# 4. Clean stale unpacked output (partial packs poison the next build).
Remove-Item -Recurse -Force "$repo\release\win-unpacked", "$repo\release\win-unpacked.tmp" -ErrorAction SilentlyContinue

# 5. Build renderer, then package.
Write-Output '=== vite build ==='
& "$repo\node_modules\.bin\vite.cmd" build
if ($LASTEXITCODE -ne 0) { throw "vite build failed (exit $LASTEXITCODE)" }

Write-Output '=== electron-builder ==='
& "$repo\node_modules\.bin\electron-builder.cmd"
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed (exit $LASTEXITCODE)" }

$setup = Join-Path $repo 'release\Palma-Setup.exe'
if (Test-Path $setup) {
  $item = Get-Item $setup
  Write-Output ("OK: {0}  ({1:N1} MB, {2})" -f $item.FullName, ($item.Length / 1MB), $item.LastWriteTime)
} else {
  throw 'Build finished but release\Palma-Setup.exe was not produced.'
}
