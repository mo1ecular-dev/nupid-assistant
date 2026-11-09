import assert from "node:assert/strict";
import test from "node:test";
import { askClaude, claudeBody } from "./claude.ts";
import { clearClaudeKey, setClaudeKey } from "./credentials.ts";
import { handleMcp, fetchExternalTools, type McpSession } from "./mcp.ts";
import { defaultSettings, type McpTool } from "./types.ts";
import { initialWorld } from "./world.ts";

function session(patch?: Partial<McpSession["settings"]>): McpSession {
  const permissions = { ...defaultSettings.mcpPermissions };
  (Object.keys(permissions) as McpTool[]).forEach((tool) => {
    permissions[tool] = true;
  });
  return {
    world: initialWorld(),
    settings: { ...defaultSettings, mcpServer: true, mcpPermissions: permissions, safety: "standard", ...patch },
    face: "idle",
    status: "ready",
    halted: false,
    modelSlot: "off",
    message: "",
    pending: null,
  };
}

function call(name: string, args: Record<string, unknown> = {}) {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
}

test("tools/list is empty until a tool is permitted", () => {
  const off = session();
  off.settings = { ...off.settings, mcpPermissions: { ...defaultSettings.mcpPermissions } };
  const listed = JSON.parse(handleMcp(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }), off).reply) as {
    result: { tools: { name: string }[] };
  };
  assert.equal(listed.result.tools.length, 0);
  const on = JSON.parse(handleMcp(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }), session()).reply) as {
    result: { tools: { name: string }[] };
  };
  assert.equal(on.result.tools.length, 13);
});

test("read_screen and open_app go through the existing actions", () => {
  const read = handleMcp(call("read_screen"), session());
  assert.match(read.reply, /Screen is clear/);
  assert.equal(read.session.status, "CLAUDE/MCP");
  assert.equal(read.session.face, "acting");
  const opened = handleMcp(call("open_app", { app: "notepad" }), read.session);
  assert.match(opened.reply, /Notepad/);
  assert.equal(opened.session.world.windows.length, 1);
});

test("delete-style drag in cautious mode asks before it acts", () => {
  const start = session({ safety: "cautious" });
  const asked = handleMcp(call("drag", { from: "a", to: "b" }), start);
  assert.match(asked.reply, /needsConfirmation/);
  assert.equal(asked.session.world.windows.length, 0);
  const allowed = handleMcp(call("drag", { from: "a", to: "b", confirm: true }), asked.session);
  assert.match(allowed.reply, /Nothing to drag|Dragged/);
});

test("a disabled tool and an emergency stop both refuse", () => {
  const start = session();
  start.settings.mcpPermissions.click = false;
  const denied = handleMcp(call("click", { target: "Save" }), start);
  assert.match(denied.reply, /disabled/);
  start.halted = true;
  const halted = handleMcp(call("read_screen"), start);
  assert.match(halted.reply, /Emergency stop/);
});

test("the server answers nothing useful while it is off", () => {
  const quiet = session({ mcpServer: false });
  const reply = handleMcp(call("read_screen"), quiet);
  assert.match(reply.reply, /off/);
  assert.equal(reply.session.world, quiet.world);
});

test("claude falls back to local when the key or the network fails", async () => {
  clearClaudeKey();
  const settings = { ...defaultSettings, brain: "claude" as const, webAccess: true, screenLeaveAck: true };
  const missing = await askClaude(settings, initialWorld(), "hi");
  assert.equal(missing.via, "local");
  setClaudeKey("test-key-not-real");
  const body = claudeBody(settings, initialWorld(), "hi");
  assert.equal(body.includes("screenshot"), false);
  assert.match(body, /Screen slice/);
  const offline = await askClaude(settings, initialWorld(), "hi", async () => {
    throw new Error("offline");
  });
  assert.equal(offline.reason, "offline");
  assert.equal(offline.online, false);
  clearClaudeKey();
});

test("an external localhost server can add tool names", async () => {
  const names = await fetchExternalTools("http://127.0.0.1:9/mcp", async () => ({
    ok: true,
    json: async () => ({ result: { tools: [{ name: "ping" }] } }),
  }));
  assert.deepEqual(names, ["ping"]);
  await assert.rejects(() => fetchExternalTools("https://example.com/mcp"), /localhost/);
});
