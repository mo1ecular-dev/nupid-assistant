import { confirmFor } from "./plan.ts";
import {
  MCP_TOOLS,
  type Action,
  type AppId,
  type FaceMode,
  type McpTool,
  type Settings,
} from "./types.ts";
import { applyAction, screenSlice, type World } from "./world.ts";

export type McpSession = {
  world: World;
  settings: Settings;
  face: FaceMode;
  status: string;
  halted: boolean;
  modelSlot: string;
  message: string;
  pending: { tool: McpTool; args: Record<string, unknown> } | null;
};

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

const FACE_STATES: FaceMode[] = ["idle", "listening", "thinking", "speaking", "acting", "error", "sleep"];

function toolSchema(name: McpTool): { name: string; description: string; inputSchema: object } {
  const props: Record<string, object> = {};
  if (name === "click" || name === "double_click") props.target = { type: "string" };
  if (name === "type_text" || name === "show_message") props.text = { type: "string" };
  if (name === "press_keys") props.keys = { type: "string" };
  if (name === "scroll") props.dir = { type: "string", enum: ["up", "down"] };
  if (name === "drag") {
    props.from = { type: "string" };
    props.to = { type: "string" };
  }
  if (name === "open_app") props.app = { type: "string", enum: ["notepad", "browser", "files", "terminal"] };
  if (name === "open_url") props.url = { type: "string" };
  if (name === "set_face_state") props.state = { type: "string", enum: FACE_STATES };
  if (name !== "read_screen" && name !== "screenshot" && name !== "get_assistant_state") {
    props.confirm = { type: "boolean" };
  }
  return {
    name,
    description: `Nupid ${name.replaceAll("_", " ")}. Wraps the existing desktop action. Destructive calls wait for Allow.`,
    inputSchema: { type: "object", properties: props, additionalProperties: false },
  };
}

function actionFrom(tool: McpTool, args: Record<string, unknown>): Action | null {
  switch (tool) {
    case "read_screen":
      return { op: "read_screen" };
    case "screenshot":
      return { op: "screenshot" };
    case "click":
      return { op: "click", target: String(args.target ?? "") };
    case "double_click":
      return { op: "double_click", target: String(args.target ?? "") };
    case "type_text":
      return { op: "type_text", text: String(args.text ?? "") };
    case "press_keys":
      return { op: "press_keys", keys: String(args.keys ?? "") };
    case "scroll":
      return { op: "scroll", dir: args.dir === "up" ? "up" : "down" };
    case "drag":
      return { op: "drag", from: String(args.from ?? ""), to: String(args.to ?? "") };
    case "open_app": {
      const app = String(args.app ?? "") as AppId;
      if (app !== "notepad" && app !== "browser" && app !== "files" && app !== "terminal") return null;
      return { op: "open_app", app };
    }
    case "open_url":
      return { op: "open_url", url: String(args.url ?? "") };
    default:
      return null;
  }
}

function result(id: unknown, payload: unknown, isError = false) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result: {
      content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload) }],
      isError,
    },
  };
}

function rpcError(id: unknown, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message } };
}

export function claudeDesktopConfig(): string {
  return JSON.stringify(
    {
      mcpServers: {
        nupid: { command: "NupidAssistant.exe", args: ["--mcp"] },
      },
    },
    null,
    2,
  );
}

export function claudeCodeCommand(): string {
  return "claude mcp add nupid -- NupidAssistant.exe --mcp";
}

export async function fetchExternalTools(
  url: string,
  fetchImpl: (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json: () => Promise<{ result?: { tools?: { name: string }[] } }> }> = fetch as never,
): Promise<string[]> {
  if (!localhostOnly(url)) throw new Error("External MCP servers must be localhost");
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  if (!response.ok) throw new Error("External MCP server refused the connection");
  const data = await response.json();
  return (data.result?.tools ?? []).map((tool) => tool.name).filter(Boolean);
}

export function localhostOnly(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

/** One JSON-RPC message. Does nothing useful unless the caller already turned the server on. */
export function handleMcp(raw: string, session: McpSession): { reply: string; session: McpSession; log?: string } {
  let msg: Rpc;
  try {
    msg = JSON.parse(raw) as Rpc;
  } catch {
    return { reply: JSON.stringify(rpcError(null, "Invalid JSON")), session };
  }
  const id = msg.id;
  if (!session.settings.mcpServer) {
    return { reply: JSON.stringify(rpcError(id, "MCP server is off")), session };
  }
  if (session.halted) {
    return { reply: JSON.stringify(rpcError(id, "Emergency stop is active")), session, log: "halted" };
  }
  if (msg.method === "initialize") {
    return {
      reply: JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "nupid", version: "0.2.0" } },
      }),
      session,
    };
  }
  if (msg.method === "tools/list") {
    const enabled = MCP_TOOLS.filter((name) => session.settings.mcpPermissions[name]);
    return {
      reply: JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: { tools: enabled.map(toolSchema) },
      }),
      session,
    };
  }
  if (msg.method !== "tools/call") {
    return { reply: JSON.stringify(rpcError(id, "Method not found")), session };
  }
  const name = msg.params?.name as McpTool | undefined;
  const args = msg.params?.arguments ?? {};
  if (!name || !MCP_TOOLS.includes(name)) {
    return { reply: JSON.stringify(rpcError(id, "Unknown tool")), session };
  }
  if (!session.settings.mcpPermissions[name]) {
    return { reply: JSON.stringify(rpcError(id, `${name} is disabled in settings`)), session, log: `${name} denied` };
  }

  const next: McpSession = { ...session, face: "thinking", status: "thinking" };

  if (name === "get_assistant_state") {
    next.face = "acting";
    next.status = "CLAUDE/MCP";
    return {
      reply: JSON.stringify(
        result(id, {
          face: session.face,
          status: session.status,
          modelSlot: session.modelSlot,
          brain: session.settings.brain,
        }),
      ),
      session: next,
      log: "get_assistant_state",
    };
  }
  if (name === "show_message") {
    next.message = String(args.text ?? "").slice(0, 280);
    next.face = "speaking";
    next.status = "CLAUDE/MCP";
    return { reply: JSON.stringify(result(id, "shown")), session: next, log: "show_message" };
  }
  if (name === "set_face_state") {
    const state = String(args.state ?? "");
    if (!FACE_STATES.includes(state as FaceMode)) {
      return { reply: JSON.stringify(rpcError(id, "Unknown face state")), session: next };
    }
    next.face = state as FaceMode;
    next.status = "CLAUDE/MCP";
    return { reply: JSON.stringify(result(id, state)), session: next, log: `face ${state}` };
  }

  const action = actionFrom(name, args);
  if (!action) return { reply: JSON.stringify(rpcError(id, "Bad arguments")), session: next };
  const confirm = confirmFor(action, session.settings.safety);
  const samePending =
    session.pending &&
    session.pending.tool === name &&
    JSON.stringify(session.pending.args) === JSON.stringify({ ...args, confirm: undefined });
  if (confirm && args.confirm !== true && !samePending) {
    next.pending = { tool: name, args };
    next.face = "thinking";
    next.status = "waiting for you";
    return {
      reply: JSON.stringify(result(id, { needsConfirmation: true, prompt: confirm })),
      session: next,
      log: `ask ${name}`,
    };
  }
  const applied = applyAction(session.world, action);
  next.world = applied.world;
  next.pending = null;
  next.face = applied.ok ? "acting" : "error";
  next.status = "CLAUDE/MCP";
  return {
    reply: JSON.stringify(result(id, { ok: applied.ok, detail: applied.detail, screen: screenSlice(applied.world) }, !applied.ok)),
    session: next,
    log: applied.detail.split("\n")[0] ?? name,
  };
}
