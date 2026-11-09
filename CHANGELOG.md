# Changelog

## 0.2.0

- Optional MCP server, off until you turn it on. `NupidAssistant.exe --mcp` speaks stdio. An optional HTTP mode binds to 127.0.0.1 with a session token and never listens on the network.
- MCP tools call the existing desktop actions. Destructive ones still ask. Each tool has its own permission switch. Emergency stop still halts them.
- Optional Claude brain. The default stays the local model. The API key is not written to disk in this preview. On Windows it belongs in Credential Manager. If Claude is offline or the key fails, Nupid uses the local model. Only a short slice of the focused window is eligible to leave the machine, and only after you accept the warning.
- Liquid glass panels. Blur, strength, and tint are in Settings.
- Face readout shows CLAUDE/MCP while a client is driving, and ONLINE while a Claude reply is in use.

## 0.1.0

- First preview of the widget, the fast router, and the practice desk.
