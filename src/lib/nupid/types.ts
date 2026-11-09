export type ModelId = "qwen2.5-1.5b" | "llama3.2-1b" | "qwen2.5-0.5b";
export type Safety = "cautious" | "standard" | "permissive";
export type FaceTheme = "phosphor" | "amber" | "ice";
export type FaceMode =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "acting"
  | "error"
  | "sleep";
export type TabId = "face" | "pulse" | "ripple" | "torus" | "clock" | "ticker";
export type ModelSlot = "off" | "loading" | "hot";
export type AppId = "notepad" | "browser" | "files" | "terminal";

export type Brain = "local" | "claude";
export type GlassTint = "phosphor" | "peach" | "ink";

export type McpTool =
  | "read_screen"
  | "screenshot"
  | "click"
  | "double_click"
  | "type_text"
  | "press_keys"
  | "scroll"
  | "drag"
  | "open_app"
  | "open_url"
  | "get_assistant_state"
  | "show_message"
  | "set_face_state";

export type Settings = {
  model: ModelId;
  preferredModel: ModelId;
  lowPower: boolean;
  safety: Safety;
  theme: FaceTheme;
  hotkey: string;
  startWithWindows: boolean;
  webAccess: boolean;
  systemPrompt: string;
  brain: Brain;
  claudeModel: string;
  screenLeaveAck: boolean;
  mcpServer: boolean;
  mcpHttp: boolean;
  mcpPermissions: Record<McpTool, boolean>;
  externalMcp: string;
  glassBlur: number;
  glassAlpha: number;
  glassTint: GlassTint;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mono?: boolean;
  pendingConfirm?: boolean;
  trace?: string;
};

export type Action =
  | { op: "open_app"; app: AppId }
  | { op: "open_url"; url: string }
  | { op: "search"; query: string }
  | { op: "type_text"; text: string }
  | { op: "press_keys"; keys: string }
  | { op: "click"; target: string }
  | { op: "double_click"; target: string }
  | { op: "scroll"; dir: "up" | "down" }
  | { op: "screenshot" }
  | { op: "read_screen" }
  | { op: "set_volume"; dir: "up" | "down" | "mute" }
  | { op: "window"; act: "minimize" | "close" | "focus"; app?: AppId }
  | { op: "read_file"; path: string }
  | { op: "write_file"; path: string; content: string; mode: "replace" | "append" }
  | { op: "delete_file"; path: string }
  | { op: "run_command"; command: string }
  | { op: "wait"; ms: number }
  | { op: "drag"; from: string; to: string };

export const DEFAULT_PROMPT =
  "You are Nupid, a small on-screen assistant. Be brief. Use tools for desktop tasks. Never do anything destructive without asking.";

export const MCP_TOOLS: McpTool[] = [
  "read_screen",
  "screenshot",
  "click",
  "double_click",
  "type_text",
  "press_keys",
  "scroll",
  "drag",
  "open_app",
  "open_url",
  "get_assistant_state",
  "show_message",
  "set_face_state",
];

export const CLAUDE_MODELS = [
  { id: "claude-haiku-4-5", name: "Haiku" },
  { id: "claude-sonnet-4-5", name: "Sonnet" },
];

function mcpOff(): Record<McpTool, boolean> {
  return {
    read_screen: false,
    screenshot: false,
    click: false,
    double_click: false,
    type_text: false,
    press_keys: false,
    scroll: false,
    drag: false,
    open_app: false,
    open_url: false,
    get_assistant_state: false,
    show_message: false,
    set_face_state: false,
  };
}

export const defaultSettings: Settings = {
  model: "qwen2.5-1.5b",
  preferredModel: "qwen2.5-1.5b",
  lowPower: false,
  safety: "standard",
  theme: "phosphor",
  hotkey: "Ctrl+Space",
  startWithWindows: false,
  webAccess: false,
  systemPrompt: DEFAULT_PROMPT,
  brain: "local",
  claudeModel: "claude-haiku-4-5",
  screenLeaveAck: false,
  mcpServer: false,
  mcpHttp: false,
  mcpPermissions: mcpOff(),
  externalMcp: "",
  glassBlur: 18,
  glassAlpha: 0.46,
  glassTint: "phosphor",
};

export const MODELS: { id: ModelId; name: string; ram: string; note: string }[] = [
  { id: "qwen2.5-1.5b", name: "Qwen2.5 1.5B", ram: "~1.0 GB", note: "Default" },
  { id: "llama3.2-1b", name: "Llama 3.2 1B", ram: "~0.8 GB", note: "Lighter" },
  { id: "qwen2.5-0.5b", name: "Qwen2.5 0.5B", ram: "~0.4 GB", note: "Low memory" },
];

export const HOTKEYS = [
  { id: "Ctrl+Space", label: "Ctrl + Space" },
  { id: "Alt+N", label: "Alt + N" },
  { id: "Ctrl+Shift+N", label: "Ctrl + Shift + N" },
];

export const TABS: { id: TabId; label: string }[] = [
  { id: "face", label: "Face" },
  { id: "pulse", label: "Pulse" },
  { id: "ripple", label: "Ripple" },
  { id: "torus", label: "Torus" },
  { id: "clock", label: "Clock" },
  { id: "ticker", label: "Ticker" },
];

export function modelShort(id: ModelId): string {
  switch (id) {
    case "qwen2.5-1.5b":
      return "Qwen2.5-1.5B";
    case "llama3.2-1b":
      return "Llama-3.2-1B";
    case "qwen2.5-0.5b":
      return "Qwen2.5-0.5B";
  }
}

export function appLabel(app: AppId): string {
  switch (app) {
    case "notepad":
      return "Notepad";
    case "browser":
      return "Browser";
    case "files":
      return "Files";
    case "terminal":
      return "Terminal";
  }
}
