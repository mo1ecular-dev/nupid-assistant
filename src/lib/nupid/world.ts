import { appLabel, type Action, type AppId } from "./types.ts";

export type DeskWindow = {
  id: string;
  app: AppId;
  title: string;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  text: string;
  url: string;
  saved: boolean;
  scroll: number;
};

export type World = {
  windows: DeskWindow[];
  files: Record<string, string>;
  volume: number;
  muted: boolean;
  focusedId: string | null;
  lastShot: string;
  z: number;
};

export type ApplyResult = {
  world: World;
  ok: boolean;
  detail: string;
  mono?: boolean;
};

const SEED_FILES: Record<string, string> = {
  "readme.txt": "This desk is local to Nupid.\nAsk me to read a file, or save a note.\n",
  "notes/scratch.txt": "",
  "memory.txt": "",
};

export function initialWorld(): World {
  return {
    windows: [],
    files: { ...SEED_FILES },
    volume: 40,
    muted: false,
    focusedId: null,
    lastShot: "",
    z: 1,
  };
}

export function safePath(input: string): string | null {
  const path = input.trim().replace(/\\/g, "/").replace(/^["']|["']$/g, "");
  if (!path || path.includes("..") || path.startsWith("/") || path.includes(":")) return null;
  if (!/^[\w./ -]+$/.test(path)) return null;
  return path;
}

function noteTitle(text: string, saved: boolean): string {
  const line = text.trim().split("\n")[0]?.slice(0, 28) || "Untitled";
  return saved ? line : `${line} *`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 32);
  }
}

export function touchWindow(world: World, id: string): World {
  const z = world.z + 1;
  return {
    ...world,
    z,
    focusedId: id,
    windows: world.windows.map((w) =>
      w.id === id ? { ...w, z, minimized: false } : w,
    ),
  };
}

export function patchText(world: World, id: string, text: string): World {
  return {
    ...world,
    windows: world.windows.map((w) => {
      if (w.id !== id) return w;
      if (w.app === "notepad") {
        return { ...w, text, saved: false, title: noteTitle(text, false) };
      }
      return { ...w, text };
    }),
  };
}

export function closeById(world: World, id: string): World {
  const windows = world.windows.filter((w) => w.id !== id);
  return {
    ...world,
    windows,
    focusedId: world.focusedId === id ? (windows[0]?.id ?? null) : world.focusedId,
  };
}

export function minimizeById(world: World, id: string): World {
  return {
    ...world,
    windows: world.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
  };
}

function focused(world: World): DeskWindow | undefined {
  return (
    world.windows.find((w) => w.id === world.focusedId && !w.minimized) ??
    world.windows.find((w) => !w.minimized)
  );
}

function openApp(world: World, app: AppId, extra?: Partial<DeskWindow>): ApplyResult {
  const existing = world.windows.find((w) => w.app === app);
  if (existing) {
    const next = touchWindow(world, existing.id);
    const windows = next.windows.map((w) => (w.id === existing.id ? { ...w, ...extra, minimized: false } : w));
    const title = windows.find((w) => w.id === existing.id)?.title ?? existing.title;
    return {
      world: { ...next, windows },
      ok: true,
      detail: `Focused ${title}.`,
    };
  }
  const z = world.z + 1;
  const id = `win-${app}`;
  const spot = world.windows.length;
  const win: DeskWindow = {
    id,
    app,
    title: appLabel(app),
    x: 28 + (spot % 3) * 36,
    y: 56 + (spot % 2) * 28,
    z,
    minimized: false,
    text: "",
    url: "",
    saved: true,
    scroll: 0,
    ...extra,
  };
  return {
    world: {
      ...world,
      z,
      focusedId: id,
      windows: [...world.windows, win],
    },
    ok: true,
    detail: `Opened ${win.title}.`,
  };
}

function saveNotepad(world: World): ApplyResult {
  const note = world.windows.find((w) => w.app === "notepad" && !w.minimized) ?? world.windows.find((w) => w.app === "notepad");
  if (!note) return { world, ok: false, detail: "Nothing to save." };
  const files = { ...world.files, "notes/scratch.txt": note.text };
  const windows = world.windows.map((w) =>
    w.id === note.id ? { ...w, saved: true, title: noteTitle(w.text, true) } : w,
  );
  return {
    world: { ...world, files, windows, focusedId: note.id },
    ok: true,
    detail: "Clicked Save. Notepad wrote notes/scratch.txt.",
  };
}

function screenTree(world: World): string {
  if (world.windows.length === 0) return "Screen is clear. No windows.";
  const lines = world.windows.map((w) => {
    const flag = w.minimized ? "minimized" : w.id === world.focusedId ? "focused" : "open";
    if (w.app === "notepad") return `- Notepad [${flag}] “${w.title}” text=${JSON.stringify(w.text.slice(0, 180))}`;
    if (w.app === "browser") return `- Browser [${flag}] ${w.url || "(blank)"}`;
    if (w.app === "files") return `- Files [${flag}] ${Object.keys(world.files).join(", ")}`;
    return `- Terminal [${flag}] ${w.text.split("\n").slice(-2).join(" / ") || "(idle)"}`;
  });
  lines.push(`Volume ${world.muted ? "muted" : world.volume}`);
  return `Screen\n${lines.join("\n")}`;
}

/** Focused window only, capped. Claude never receives a screenshot. */
export function screenSlice(world: World): string {
  const focused = world.windows.find((w) => w.id === world.focusedId);
  if (!focused) return "No focused window.";
  const tree = screenTree({ ...world, windows: [focused] });
  return tree.slice(0, 800);
}

export function applyAction(world: World, action: Action): ApplyResult {
  switch (action.op) {
    case "open_app":
      return openApp(world, action.app);
    case "open_url": {
      const url = /^https?:\/\//i.test(action.url) ? action.url : `https://${action.url}`;
      const opened = openApp(world, "browser", { url, title: hostOf(url), text: "" });
      return { ...opened, detail: `Opened ${url}.` };
    }
    case "search": {
      const q = encodeURIComponent(action.query);
      const url = `https://search.nupid.local/?q=${q}`;
      const opened = openApp(world, "browser", { url, title: "Search", text: action.query });
      return { ...opened, detail: `Searched for “${action.query}”.` };
    }
    case "type_text": {
      let next = world;
      let note = focused(next);
      if (!note || (note.app !== "notepad" && note.app !== "terminal")) {
        const opened = openApp(next, "notepad");
        next = opened.world;
        note = next.windows.find((w) => w.app === "notepad");
      }
      if (!note) return { world, ok: false, detail: "Nowhere to type." };
      if (note.app === "terminal") {
        const text = `${note.text}${note.text ? "\n" : ""}nupid> ${action.text}`;
        return {
          world: patchText(next, note.id, text),
          ok: true,
          detail: `Typed “${action.text}” into Terminal.`,
        };
      }
      const joined = note.text ? `${note.text}${action.text}` : action.text;
      return {
        world: patchText(next, note.id, joined),
        ok: true,
        detail: `Typed “${action.text}” into Notepad.`,
      };
    }
    case "press_keys": {
      const keys = action.keys.trim();
      const low = keys.toLowerCase().replace(/\s+/g, "");
      if (low === "ctrl+s" || low === "control+s") return saveNotepad(world);
      const note = world.windows.find((w) => w.app === "notepad");
      if (note && (low === "enter" || low === "return")) {
        return {
          world: patchText(world, note.id, `${note.text}\n`),
          ok: true,
          detail: "Pressed Enter.",
        };
      }
      return { world, ok: true, detail: `Pressed ${keys}.` };
    }
    case "click":
    case "double_click": {
      const target = action.target.toLowerCase().replace(/\b(the|button|control)\b/g, "").replace(/\s+/g, " ").trim();
      const verb = action.op === "double_click" ? "Double-clicked" : "Clicked";
      if (target.includes("save")) return saveNotepad(world);
      if (/(close|minimize)/.test(target)) {
        const win = focused(world);
        if (!win) return { world, ok: false, detail: "No window to close." };
        if (target.includes("minimize")) {
          return { world: minimizeById(world, win.id), ok: true, detail: `Minimized ${win.title}.` };
        }
        return { world: closeById(world, win.id), ok: true, detail: `${verb} close on ${win.title}.` };
      }
      const file = Object.keys(world.files).find((f) => f.toLowerCase() === target || f.toLowerCase().endsWith(`/${target}`));
      if (file) {
        const opened = openApp(world, "notepad", {
          text: world.files[file] ?? "",
          saved: true,
          title: noteTitle(world.files[file] ?? "", true),
        });
        return { ...opened, detail: `${verb} ${file}.` };
      }
      return { world, ok: false, detail: `No control named “${action.target}” is on screen.` };
    }
    case "scroll": {
      const win = focused(world);
      if (!win) return { world, ok: false, detail: "Nothing to scroll." };
      const delta = action.dir === "down" ? 48 : -48;
      const windows = world.windows.map((w) =>
        w.id === win.id ? { ...w, scroll: Math.max(0, w.scroll + delta) } : w,
      );
      return { world: { ...world, windows }, ok: true, detail: `Scrolled ${action.dir}.` };
    }
    case "screenshot": {
      const detail = `Screenshot\n${screenTree(world)}`;
      return { world: { ...world, lastShot: detail }, ok: true, detail, mono: true };
    }
    case "read_screen":
      return { world, ok: true, detail: screenTree(world), mono: true };
    case "set_volume": {
      let volume = world.volume;
      let muted = world.muted;
      if (action.dir === "up") {
        volume = Math.min(100, volume + 10);
        muted = false;
      } else if (action.dir === "down") {
        volume = Math.max(0, volume - 10);
      } else {
        muted = !muted;
      }
      const detail = action.dir === "mute" ? (muted ? "Muted." : "Unmuted.") : `Volume ${volume}.`;
      return { world: { ...world, volume, muted }, ok: true, detail };
    }
    case "window": {
      const win = action.app
        ? world.windows.find((w) => w.app === action.app)
        : focused(world);
      if (!win) return { world, ok: false, detail: "That window isn't open." };
      if (action.act === "minimize") {
        return { world: minimizeById(world, win.id), ok: true, detail: `Minimized ${appLabel(win.app)}.` };
      }
      if (action.act === "close") {
        return { world: closeById(world, win.id), ok: true, detail: `Closed ${appLabel(win.app)}.` };
      }
      return { world: touchWindow(world, win.id), ok: true, detail: `Focused ${appLabel(win.app)}.` };
    }
    case "read_file": {
      const path = safePath(action.path);
      if (!path) return { world, ok: false, detail: "That path isn't allowed." };
      if (!(path in world.files)) return { world, ok: false, detail: `No file named ${path}.`, mono: true };
      const body = world.files[path] || "(empty)";
      return { world, ok: true, detail: `${path}\n${body}`, mono: true };
    }
    case "write_file": {
      const path = safePath(action.path);
      if (!path) return { world, ok: false, detail: "That path isn't allowed." };
      const prev = world.files[path] ?? "";
      const content =
        action.mode === "append"
          ? `${prev}${prev && !prev.endsWith("\n") ? "\n" : ""}${action.content}\n`
          : action.content;
      if (content.length > 8000) return { world, ok: false, detail: "That note is too long for local memory." };
      return {
        world: { ...world, files: { ...world.files, [path]: content } },
        ok: true,
        detail: action.mode === "append" ? `Noted in ${path}.` : `Wrote ${path}.`,
      };
    }
    case "delete_file": {
      const path = safePath(action.path);
      if (!path) return { world, ok: false, detail: "That path isn't allowed." };
      if (!(path in world.files)) return { world, ok: false, detail: `No file named ${path}.` };
      const files = { ...world.files };
      delete files[path];
      return { world: { ...world, files }, ok: true, detail: `Deleted ${path}.` };
    }
    case "run_command": {
      const command = action.command.trim();
      if (/^(send|email|post|buy|purchase|install|uninstall|format|rm|del|shutdown|reboot)\b/i.test(command)) {
        const verb = command.split(/\s+/)[0]?.toLowerCase() ?? "run";
        return {
          world,
          ok: false,
          detail: `Did not ${verb}. This preview has no mail, payment, or installer. On Windows, Nupid still stops and asks before any of those.`,
        };
      }
      const echo = command.match(/^echo\s+([\s\S]+)$/i);
      const listed = /^(dir|ls)$/i.test(command);
      const who = /^whoami$/i.test(command);
      const ver = /^(ver|version)$/i.test(command);
      if (!echo && !listed && !who && !ver) {
        return {
          world,
          ok: false,
          detail: `Refused “${command}”. The preview never spawns a shell. On Windows, Nupid would run it only after you confirmed.`,
        };
      }
      const output = echo
        ? echo[1]
        : listed
          ? Object.keys(world.files).join("\n")
          : who
            ? "nupid"
            : "Nupid Assistant preview";
      const opened = openApp(world, "terminal");
      const term = opened.world.windows.find((w) => w.app === "terminal");
      if (!term) return opened;
      const text = `${term.text}${term.text ? "\n" : ""}nupid> ${command}\n${output}`;
      return {
        world: patchText(opened.world, term.id, text),
        ok: true,
        detail: `Ran “${command}”.`,
        mono: true,
      };
    }
    case "wait":
      return { world, ok: true, detail: "Waited." };
    case "drag": {
      const win = focused(world);
      if (!win) return { world, ok: false, detail: "Nothing to drag." };
      const windows = world.windows.map((w) =>
        w.id === win.id ? { ...w, x: w.x + 36, y: w.y + 18 } : w,
      );
      return {
        world: { ...world, windows },
        ok: true,
        detail: `Dragged “${win.title}” toward ${action.to}.`,
      };
    }
    default:
      return { world, ok: false, detail: "Unknown action." };
  }
}
