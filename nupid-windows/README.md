# Nupid Assistant for Windows

Native shell for Windows 10 (64-bit) and Windows 11. No Mac or Linux build.

- Window title and exe: `NupidAssistant.exe`
- App id: `com.nupid.assistant`
- UI: Tauri 2, system WebView2, the widget in `src/components/nupid`
- Model: llama.cpp CPU sidecar, one GGUF at Q4_K_M
- Default model: Qwen2.5-1.5B-Instruct. Fallback: Qwen2.5-0.5B
- Screen: UI Automation tree plus Windows.Media.Ocr. No vision model
- Input: `SendInput`. Hotkeys: `RegisterHotKey`. Per-monitor DPI aware
- Single instance. Minimize to tray. No admin for normal use
- Actions are one JSON object at a time. Grammar: `grammars/action.gbnf`
- Agent loop stops at 8 steps. Shell, delete, send, purchase, and install always confirm
- Emergency stop: Ctrl+Shift+H

## One command

From the repo root, on Windows, with Rust stable and the Visual Studio C++ build tools installed:

```powershell
powershell -ExecutionPolicy Bypass -File .\nupid-windows\build-installer.ps1
```

The script installs JS dependencies, then runs `cargo tauri build`. Output:

- NSIS installer: `src-tauri/target/release/bundle/nsis/NupidAssistant-setup.exe`
- Portable exe: `src-tauri/target/release/NupidAssistant.exe`

WebView2 is included as a download bootstrapper so Windows 10 machines without it still launch.

## First launch

The app downloads the selected GGUF into `%LOCALAPPDATA%\Nupid\models` and shows progress. The face stays up with the model unloaded. A message loads it. Two minutes of silence unloads it.

Suggested llama.cpp flags: `-c 2048 --mmap -t 4 -b 128 --no-warmup` and grammar-constrained decoding with `grammars/action.gbnf`.

## Practice desk

The browser build in this repo runs the same router against a practice desk, not your real windows. Screen-control calls in the Windows shell map to UI Automation. Do not point the sidecar at the network unless web access is on.
