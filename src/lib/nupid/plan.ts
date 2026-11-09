import {
  appLabel,
  type Action,
  type AppId,
  type Safety,
  type Settings,
} from "./types.ts";
import { type World, safePath } from "./world.ts";

export type Step = {
  action: Action;
  label: string;
  confirm?: string;
};

export type Plan = {
  via: "router" | "model";
  steps: Step[];
  reply?: string;
  trace: string;
};

function stripPolite(input: string): string {
  let text = input.trim().replace(/[.?!]+$/g, "").trim();
  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(/^(please|can you|could you|would you|will you|hey|ok|okay|nupid)\b[, ]*/i, "").trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

function appFrom(value: string): AppId | null {
  const text = value.toLowerCase();
  if (/\b(notepad|textedit|text editor)\b/.test(text) || /^(a )?notes?$/.test(text)) return "notepad";
  if (/\b(browser|chrome|edge|firefox|web)\b/.test(text)) return "browser";
  if (/\b(files|explorer|file explorer|folders?)\b/.test(text)) return "files";
  if (/\b(terminal|command prompt|powershell|cmd|shell)\b/.test(text)) return "terminal";
  return null;
}

function looksLikeUrl(value: string): boolean {
  return /^(https?:\/\/\S+|(?:[\w-]+\.)+(?:com|org|net|io|dev|app)(?:\/\S*)?)$/i.test(value.trim());
}

export function labelFor(action: Action): string {
  switch (action.op) {
    case "open_app":
      return `opening ${appLabel(action.app)}`;
    case "open_url":
      return "opening link";
    case "search":
      return "searching";
    case "type_text":
      return "typing";
    case "press_keys":
      return `pressing ${action.keys}`;
    case "click":
      return `clicking ${action.target}`;
    case "double_click":
      return `double-clicking ${action.target}`;
    case "scroll":
      return "scrolling";
    case "screenshot":
      return "taking a screenshot";
    case "read_screen":
      return "reading screen";
    case "set_volume":
      return action.dir === "mute" ? "muting" : "changing volume";
    case "window":
      return action.act === "close" ? "closing window" : action.act === "minimize" ? "minimizing" : "focusing window";
    case "read_file":
      return "reading file";
    case "write_file":
      return "writing file";
    case "delete_file":
      return "deleting file";
    case "run_command":
      return "running command";
    case "wait":
      return "waiting";
    case "drag":
      return "dragging";
  }
}

function confirmFor(action: Action, safety: Safety): string | undefined {
  if (action.op === "run_command") return `Run “${action.command}”?`;
  if (action.op === "delete_file") return `Delete ${action.path}?`;
  if (action.op === "write_file" && safety === "cautious") return `Write ${action.path}?`;
  if (safety === "cautious" && action.op === "drag") return `Drag ${action.from} to ${action.to}?`;
  return undefined;
}

function step(action: Action, safety: Safety): Step {
  return { action, label: labelFor(action), confirm: confirmFor(action, safety) };
}

function shape(text: string, settings: Settings): string {
  const prompt = settings.systemPrompt.toLowerCase();
  if (/\bone sentence\b|\bterse\b/.test(prompt)) {
    return text.split(/(?<=[.!?])\s/)[0] ?? text;
  }
  return text;
}

function routerReply(text: string, settings: Settings, summary: string): string | null {
  const low = text.toLowerCase();
  if (/^(hi|hello|hey|howdy|good (morning|evening|afternoon))(\s+there|\s+nupid)?$/.test(low)) {
    return shape(
      "I'm here. Straight commands — open, type, search — skip the model. Anything else wakes it.",
      settings,
    );
  }
  if (/^(thanks|thank you|ty)$/.test(low)) return shape("Anytime.", settings);
  if (/^(who are you|what are you|your name)$/.test(low)) {
    return shape(
      "Nupid. I sit on the screen, read what's in front of you, and do the small stuff. The fast path never loads a model.",
      settings,
    );
  }
  if (/^(help|commands|what can you do|how do i use you|\?)$/.test(low)) {
    return shape(
      "Try “open notepad and type hello”, “what's on my screen”, “search for rust”, “volume down”, or “remember the door code is 2214”. Destructive steps always ask first. Halt is Ctrl+Shift+H.",
      settings,
    );
  }
  if (/^(what time is it|what's the time|whats the time|time|what is the time)$/.test(low)) {
    return shape(
      `It's ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`,
      settings,
    );
  }
  if (/^(what's the date|whats the date|what is the date|date|what day is it)$/.test(low)) {
    return shape(
      new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }),
      settings,
    );
  }
  if (/system prompt/.test(low)) return settings.systemPrompt;
  if (/what were we (talking|chatting) about|earlier today|chat history/.test(low)) {
    return summary || "This chat is still short.";
  }
  const math = low.match(/^(?:what(?:'s| is)\s+)?(-?\d+(?:\.\d+)?)\s*([+\-*/x×])\s*(-?\d+(?:\.\d+)?)$/);
  if (math) {
    const a = Number(math[1]);
    const b = Number(math[3]);
    const op = math[2] === "x" || math[2] === "×" ? "*" : math[2];
    if (op === "/" && b === 0) return "I won't divide by zero.";
    const value = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b;
    const shown = Number.isInteger(value) ? String(value) : value.toFixed(2);
    return shape(`${a} ${math[2]} ${b} = ${shown}.`, settings);
  }
  if (/\bweather\b/.test(low) && !settings.webAccess) {
    return shape("Web access is off. I won't reach the network unless you turn it on in settings.", settings);
  }
  if (/\b(joke|funny)\b/.test(low)) {
    return shape("I blink at a few frames a second and still miss the punchline. Give me a task.", settings);
  }
  return null;
}

function matchOne(raw: string, settings: Settings): Action | "chat" | null {
  const text = stripPolite(raw);
  const low = text.toLowerCase();
  if (!text) return null;

  const quoted = text.match(/^(?:type|write|enter)\s+(?:"([^"]+)"|“([^”]+)”|'([^']+)')$/i);
  if (quoted) return { op: "type_text", text: quoted[1] || quoted[2] || quoted[3] || "" };
  const typed = text.match(/^(?:type|write|enter)\s+(.+)$/i);
  if (typed && !/^(?:type|write|enter)\s+file\b/i.test(text)) return { op: "type_text", text: typed[1] };

  if (/^(?:take\s+)?(?:a\s+)?screenshot$|^capture(?: the)? screen$/.test(low)) return { op: "screenshot" };
  if (/what(?:'s| is) on (?:my |the )?screen|^read (?:the )?screen$|^look at (?:my |the )?screen$/.test(low)) {
    return { op: "read_screen" };
  }

  const volume = low.match(/^(?:turn\s+|set\s+|make\s+)?(?:the\s+)?volume(?:\s+(up|down|mute))?$|^mute(?:\s+(?:the\s+)?volume)?$|^unmute$/);
  if (volume) {
    if (/^unmute$/.test(low) || volume[1] === "up") return { op: "set_volume", dir: "up" };
    if (low.startsWith("mute") || volume[1] === "mute") return { op: "set_volume", dir: "mute" };
    if (volume[1] === "down" || /down|lower/.test(low)) return { op: "set_volume", dir: "down" };
    if (/up|raise|louder/.test(low)) return { op: "set_volume", dir: "up" };
  }

  const keys = text.match(/^(?:press|hit)\s+(?!the\b)(.+)$/i);
  if (keys) return { op: "press_keys", keys: keys[1] };

  const dbl = text.match(/^double[-\s]?click\s+(.+)$/i);
  if (dbl) return { op: "double_click", target: dbl[1] };

  const click = text.match(/^(?:click|tap)\s+(.+)$/i);
  if (click) return { op: "click", target: click[1] };

  const scroll = low.match(/^scroll\s+(up|down)$/);
  if (scroll) return { op: "scroll", dir: scroll[1] === "up" ? "up" : "down" };

  const drag = text.match(/^drag\s+(.+?)\s+to\s+(.+)$/i);
  if (drag) return { op: "drag", from: drag[1], to: drag[2] };

  const search = text.match(/^(?:search|google|look up|bing)\s+(?:for\s+)?(.+)$/i);
  if (search) return { op: "search", query: search[1] };

  const win = low.match(/^(minimize|close|focus)\s+(?:the\s+)?(notepad|browser|files|terminal|window)$/);
  if (win) {
    const act = win[1] === "minimize" ? "minimize" : win[1] === "close" ? "close" : "focus";
    const app = win[2] === "window" ? undefined : appFrom(win[2]) ?? undefined;
    return { op: "window", act, app: app ?? undefined };
  }

  const readFile = text.match(/^(?:read|open)\s+file\s+(\S+)$/i);
  if (readFile && safePath(readFile[1])) return { op: "read_file", path: readFile[1] };

  const writeFile = text.match(/^(?:write|save)\s+file\s+(\S+)\s+([\s\S]+)$/i);
  if (writeFile && safePath(writeFile[1])) {
    return { op: "write_file", path: writeFile[1], content: writeFile[2], mode: "replace" };
  }

  const del = text.match(/^(?:delete|remove)\s+file\s+(\S+)$/i);
  if (del) return { op: "delete_file", path: del[1] };

  const memory = text.match(/^(?:remember|note)\s+(?:that\s+)?([\s\S]+)$/i);
  if (memory) return { op: "write_file", path: "memory.txt", content: memory[1], mode: "append" };

  if (/^(?:what do you remember|show (?:my )?memory|read memory)$/.test(low)) {
    return { op: "read_file", path: "memory.txt" };
  }

  if (/^(?:install|uninstall|send|email|buy|purchase|format|shutdown|reboot)\b/i.test(text) || /^(?:run|execute)\s+/i.test(text)) {
    const command = text.replace(/^(?:run|execute)\s+/i, "");
    return { op: "run_command", command };
  }

  if (/^wait(?:\s+(\d+)\s*(?:ms|milliseconds|s|sec|seconds)?)?$/.test(low)) {
    const ms = Number(low.match(/(\d+)/)?.[1] ?? 400);
    const scaled = /s|sec/.test(low) && !/ms/.test(low) ? ms * 1000 : ms;
    return { op: "wait", ms: scaled };
  }

  const opened = text.match(/^(?:open|launch|start|show|bring up)\s+(?:a\s+|the\s+|my\s+)?(.+)$/i);
  if (opened) {
    const rest = opened[1].trim();
    if (looksLikeUrl(rest)) return { op: "open_url", url: rest };
    const app = appFrom(rest);
    if (app) return { op: "open_app", app };
    const file = rest.match(/^file\s+(\S+)$/i);
    if (file) return { op: "read_file", path: file[1] };
  }

  if (/\bweather\b/.test(low) && settings.webAccess) return { op: "search", query: text };

  if (routerReply(text, settings, "") !== null && !/weather/.test(low)) return "chat";
  return null;
}

function modelReply(input: string, settings: Settings, world: World): string {
  const low = input.trim().toLowerCase();
  if (/\b(delete|erase|wipe)\b/.test(low) && /\b(file|disk|everything|folder)\b/.test(low)) {
    return shape("Name the file, like “delete file readme.txt”. I'll ask before it goes.", settings);
  }
  if (/\b(buy|purchase|checkout|order)\b/.test(low)) {
    return shape("I won't buy anything. Purchases always stop for a yes, and this preview can't check out.", settings);
  }
  if (/\b(send|email|message)\b/.test(low) && /\b(email|message|slack|text)\b/.test(low)) {
    return shape("I won't send messages from here. Say “send …” if you want the confirm step — nothing leaves the machine.", settings);
  }
  const files = Object.keys(world.files);
  if (/\b(how are you|you ok)\b/.test(low)) {
    return shape("Quiet. The model slot is cold until you need it.", settings);
  }
  return shape(
    `No fast command matched. On Windows this sentence would go to ${settings.model} with a slice of the screen, not the whole desktop. Try “open notepad”, “read the screen”, or “search for …” . Local files: ${files.join(", ")}.`,
    settings,
  );
}

export function planInput(input: string, settings: Settings, world: World, summary = ""): Plan {
  const cleaned = input.trim();
  const parts = cleaned.split(/\s+(?:and then|then|and)\s+/i);
  if (parts.length > 1 && parts.length <= 8) {
    const matched = parts.map((part) => matchOne(part, settings));
    if (matched.every((item) => item && item !== "chat")) {
      const actions = matched as Action[];
      return {
        via: "router",
        steps: actions.map((action) => step(action, settings.safety)),
        trace: actions.map((action) => action.op).join(" → "),
      };
    }
  }

  const one = matchOne(cleaned, settings);
  if (one && one !== "chat") {
    return { via: "router", steps: [step(one, settings.safety)], trace: one.op };
  }

  const reply = routerReply(stripPolite(cleaned), settings, summary);
  if (reply) return { via: "router", steps: [], reply, trace: "router" };

  const loose = stripPolite(cleaned).toLowerCase();
  if (/\b(open|launch|need|start)\b/.test(loose)) {
    const app = appFrom(loose);
    if (app) {
      const action: Action = { op: "open_app", app };
      return { via: "router", steps: [step(action, settings.safety)], trace: "open_app" };
    }
  }

  const quoted = cleaned.match(/"([^"]+)"|“([^”]+)”/);
  if (/\btype\b/i.test(cleaned) && quoted) {
    const action: Action = { op: "type_text", text: quoted[1] || quoted[2] || "" };
    return { via: "router", steps: [step(action, settings.safety)], trace: "type_text" };
  }

  return {
    via: "model",
    steps: [],
    reply: modelReply(cleaned, settings, world),
    trace: "preview brain",
  };
}

export function narrate(details: string[]): { text: string; mono: boolean } {
  const mono = details.some((detail) => detail.includes("\n"));
  return { text: details.join(mono ? "\n\n" : " "), mono };
}
