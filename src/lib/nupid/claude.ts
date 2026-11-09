import { readClaudeKey } from "./credentials.ts";
import type { Settings } from "./types.ts";
import { screenSlice, type World } from "./world.ts";

export type BrainResult = { via: "local" | "claude"; text?: string; reason?: string; online: boolean };

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json: () => Promise<{ content?: { text?: string }[] }> }>;

/** Builds the request body. Only the focused UI slice is included — never a screenshot. */
export function claudeBody(settings: Settings, world: World, user: string): string {
  return JSON.stringify({
    model: settings.claudeModel,
    max_tokens: 180,
    system: settings.systemPrompt,
    messages: [{ role: "user", content: `${user}\n\nScreen slice:\n${screenSlice(world)}` }],
  });
}

export async function askClaude(
  settings: Settings,
  world: World,
  user: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<BrainResult> {
  if (settings.brain !== "claude") return { via: "local", online: false, reason: "local brain" };
  if (!settings.screenLeaveAck) return { via: "local", online: false, reason: "screen warning not accepted" };
  if (!settings.webAccess) return { via: "local", online: false, reason: "web access off" };
  if (!readClaudeKey()) return { via: "local", online: false, reason: "no key" };
  try {
    const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": readClaudeKey(),
      },
      body: claudeBody(settings, world, user),
    });
    if (!response.ok) return { via: "local", online: false, reason: "claude rejected the key" };
    const data = await response.json();
    const text = data.content?.map((part) => part.text ?? "").join("").trim();
    if (!text) return { via: "local", online: false, reason: "empty claude reply" };
    return { via: "claude", online: true, text };
  } catch {
    return { via: "local", online: false, reason: "offline" };
  }
}
