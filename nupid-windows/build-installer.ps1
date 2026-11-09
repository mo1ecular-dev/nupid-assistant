# Build the Nupid Assistant NSIS installer and portable exe.
# Usage: powershell -ExecutionPolicy Bypass -File .\nupid-windows\build-installer.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "Rust is required. Install stable Rust from https://rustup.rs"
}
npm install
if (-not (Test-Path "src-tauri\tauri.conf.json")) {
  throw "src-tauri is not in this checkout yet. The widget and router in src/ are the reference UI."
}
npx tauri build --bundles nsis
Write-Host "Installer is under src-tauri\target\release\bundle\nsis"
