/** In-memory stand-in for Windows Credential Manager. Never persisted or logged. */
let claudeKey = "";
let mcpToken = "";

export function setClaudeKey(value: string): void {
  claudeKey = value.trim();
}

export function hasClaudeKey(): boolean {
  return claudeKey.length > 0;
}

export function readClaudeKey(): string {
  return claudeKey;
}

export function clearClaudeKey(): void {
  claudeKey = "";
}

export function ensureMcpToken(): string {
  if (!mcpToken) mcpToken = `nup_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return mcpToken;
}

export function clearMcpToken(): void {
  mcpToken = "";
}
