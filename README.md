# Nupid Assistant

A small always-on-top desktop companion. It has a dot-matrix face, a fast command router for everyday tasks, and a model slot that stays unloaded until a request actually needs it.

Identifier: `com.nupid.assistant`

## What you can do here

The widget floats on a practice desk.

- Wake it, then try `open notepad and type hello`
- `what's on my screen`, `search for rust`, `volume down`
- `remember the door code is 2214`, then `what do you remember`
- Destructive steps ask first. **Halt** is Ctrl+Shift+H
- Show or hide with Ctrl+Space
- Tray menu: Show/Hide, Low power, Settings, Quit

Straight commands never load the model. Anything the router does not recognize uses the preview brain and shows a live tokens/sec readout. On Windows that slot is a local GGUF (Qwen2.5-1.5B Q4 by default, Llama 3.2 1B, or Qwen2.5-0.5B in low power). Context target is 2048 tokens, mmap on, at most 4 threads. The model unloads after about two minutes of silence.

This preview does not touch your real screen, spawn a shell, or call the network. Web access, when enabled, only opens a practice browser page.

## Layout

| Path | Role |
| --- | --- |
| `src/components/nupid/` | Widget, face, practice desk |
| `src/lib/nupid/` | Router, world, chat store |
| `nupid-windows/` | Windows installer notes and the action grammar |

## Windows build

The native shell is Tauri 2 + WebView2, llama.cpp as a CPU sidecar, UI Automation and Windows OCR for the screen (no vision model). See [nupid-windows/README.md](nupid-windows/README.md).

On a Windows 10/11 x64 machine:

```powershell
powershell -ExecutionPolicy Bypass -File .\nupid-windows\build-installer.ps1
```

That produces an NSIS installer and a portable exe. The installer bundles the WebView2 bootstrapper. Normal use does not need admin. Start with Windows stays off until you opt in.

## Memory budget

Idle target is under 150 MB and about 0% CPU, because the model is not loaded. With Qwen2.5-1.5B Q4 resident, stay under 1.2 GB. The face is a dot grid at 30 fps while active, 5 fps when idle, 15 fps in low power.

## License

MIT. See [LICENSE](LICENSE).
