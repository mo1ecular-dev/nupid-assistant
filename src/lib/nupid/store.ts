import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { narrate, planInput, type Plan, type Step } from "./plan.ts";
import {
  defaultSettings,
  modelShort,
  type Action,
  type FaceMode,
  type Message,
  type ModelId,
  type ModelSlot,
  type Settings,
  type TabId,
} from "./types.ts";
import {
  applyAction,
  closeById,
  initialWorld,
  minimizeById,
  patchText,
  touchWindow,
  type World,
} from "./world.ts";

type Pending = {
  runId: number;
  steps: Step[];
  index: number;
  done: string[];
  via: Plan["via"];
  reply?: string;
  trace: string;
};

type NupidState = {
  booted: boolean;
  running: boolean;
  hidden: boolean;
  collapsed: boolean;
  deskOpen: boolean;
  settingsOpen: boolean;
  placed: boolean;
  x: number;
  y: number;
  tab: TabId;
  face: FaceMode;
  status: string;
  tps: number;
  modelSlot: ModelSlot;
  streaming: boolean;
  editing: boolean;
  runId: number;
  focusTick: number;
  settings: Settings;
  messages: Message[];
  summary: string;
  world: World;
  pending: Pending | null;
  boot: () => void;
  send: (text: string) => Promise<void>;
  approve: () => void;
  deny: () => void;
  halt: () => void;
  stop: () => void;
  setListening: (on: boolean) => void;
  setEditing: (on: boolean) => void;
  setTab: (tab: TabId) => void;
  toggleCollapsed: () => void;
  toggleHidden: () => void;
  toggleDesk: () => void;
  toggleSettings: () => void;
  setLowPower: (on: boolean) => void;
  setModel: (id: ModelId) => void;
  patchSettings: (patch: Partial<Settings>) => void;
  place: (x: number, y: number) => void;
  clearChat: () => void;
  quit: () => void;
  start: () => void;
  focusWin: (id: string) => void;
  userClose: (id: string) => void;
  userMinimize: (id: string) => void;
  userType: (id: string, text: string) => void;
  userActivate: (action: Action) => void;
  wakeFace: () => void;
  sleepFace: () => void;
};

const memoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let unloadTimer: ReturnType<typeof setTimeout> | null = null;

export const useNupid = create<NupidState>()(
  persist(
    (set, get) => {
      const alive = (runId: number) => get().runId === runId;

      const armUnload = () => {
        if (unloadTimer) clearTimeout(unloadTimer);
        unloadTimer = setTimeout(() => {
          if (get().streaming) {
            armUnload();
            return;
          }
          const status = get().status === "ready" ? "model unloaded" : get().status;
          set({ modelSlot: "off", status });
        }, 120_000);
      };

      const speak = async (text: string, runId: number, mono: boolean, trace: string) => {
        if (!text || !alive(runId)) {
          if (alive(runId)) set({ streaming: false, face: "idle", status: "ready", tps: 0 });
          return;
        }
        const id = uid("m");
        set((state) => ({
          streaming: true,
          face: "speaking",
          status: "speaking",
          messages: [...state.messages, { id, role: "assistant", content: "", mono, trace }],
        }));
        const words = text.match(/\S+\s*/g) ?? [text];
        const started = performance.now();
        let acc = "";
        for (let i = 0; i < words.length; i += 1) {
          if (!alive(runId)) return;
          acc += words[i];
          const seconds = Math.max(0.05, (performance.now() - started) / 1000);
          const tps = (i + 1) / seconds;
          set((state) => ({
            tps,
            face: "speaking",
            messages: state.messages.map((message) =>
              message.id === id ? { ...message, content: acc } : message,
            ),
          }));
          await sleep(get().settings.lowPower ? 92 : 48);
        }
        if (!alive(runId)) return;
        set({ streaming: false, face: "idle", status: "ready", tps: 0 });
      };

      const waitTyping = async (runId: number) => {
        const started = Date.now();
        while (get().editing && Date.now() - started < 5000) {
          if (!alive(runId)) return false;
          set({ status: "paused — you're typing", face: "idle" });
          await sleep(140);
        }
        return alive(runId) && !get().editing;
      };

      const drive = async (plan: Plan, runId: number, index: number, done: string[], skipConfirm: boolean) => {
        for (let i = index; i < plan.steps.length; i += 1) {
          if (!alive(runId)) return;
          const current = plan.steps[i];
          if (current.confirm && !(skipConfirm && i === index)) {
            set((state) => ({
              pending: { runId, steps: plan.steps, index: i, done, via: plan.via, reply: plan.reply, trace: plan.trace },
              streaming: false,
              face: "idle",
              status: "waiting for you",
              messages: [
                ...state.messages,
                { id: uid("m"), role: "assistant", content: current.confirm ?? "Allow this?", pendingConfirm: true, trace: plan.trace },
              ],
            }));
            return;
          }
          const clear = await waitTyping(runId);
          if (!alive(runId)) return;
          if (!clear) {
            done.push("Paused because you were typing.");
            break;
          }
          set({ face: "acting", status: current.label, streaming: true });
          await sleep(get().settings.lowPower ? 340 : 220);
          if (!alive(runId)) return;
          if (current.action.op === "wait") await sleep(Math.min(current.action.ms, 800));
          const result = applyAction(get().world, current.action);
          set({ world: result.world });
          done.push(result.detail);
          if (!result.ok) {
            set({ face: "error", status: "error" });
            await sleep(320);
            break;
          }
        }
        if (!alive(runId)) return;
        const mono = done.some((detail) => detail.includes("\n"));
        const text =
          plan.steps.length === 0
            ? (plan.reply ?? "")
            : plan.via === "model" && plan.reply
              ? plan.reply
              : narrate(done).text;
        await speak(text, runId, mono || text.includes("\n"), plan.trace);
      };

      return {
        booted: false,
        running: true,
        hidden: false,
        collapsed: false,
        deskOpen: false,
        settingsOpen: false,
        placed: false,
        x: 0,
        y: 0,
        tab: "face",
        face: "idle",
        status: "ready",
        tps: 0,
        modelSlot: "off",
        streaming: false,
        editing: false,
        runId: 0,
        focusTick: 0,
        settings: defaultSettings,
        messages: [],
        summary: "",
        world: initialWorld(),
        pending: null,

        boot: () => {
          const runId = get().runId + 1;
          const name = modelShort(get().settings.model);
          set({ booted: true, runId, face: "thinking", status: "thinking", streaming: true });
          void speak(
            `Awake. ${name} stays unloaded until a question misses the fast path. Try “open notepad and type hello”.`,
            runId,
            false,
            "router",
          );
        },

        send: async (text: string) => {
          const trimmed = text.trim();
          if (!trimmed || !get().booted) return;
          const runId = get().runId + 1;
          let messages = [...get().messages, { id: uid("m"), role: "user" as const, content: trimmed }];
          let summary = get().summary;
          if (messages.length > 28) {
            const old = messages.slice(0, messages.length - 16);
            const topics = old
              .filter((message) => message.role === "user")
              .map((message) => message.content)
              .slice(-6)
              .join("; ");
            summary = `Earlier: ${topics}`.slice(0, 400);
            messages = messages.slice(messages.length - 16);
          }
          const plan = planInput(trimmed, get().settings, get().world, summary);
          set({
            runId,
            messages,
            summary,
            pending: null,
            streaming: true,
            face: "thinking",
            status: "thinking",
            tps: 0,
            hidden: false,
            running: true,
          });
          if (plan.via === "model") {
            set({ modelSlot: "loading", status: "thinking" });
            await sleep(get().settings.lowPower ? 1300 : 900);
            if (!alive(runId)) return;
            set({ modelSlot: "hot" });
            armUnload();
          } else {
            await sleep(140);
            if (!alive(runId)) return;
          }
          await drive(plan, runId, 0, [], false);
        },

        approve: () => {
          const pending = get().pending;
          if (!pending) return;
          set({ pending: null, streaming: true, face: "acting" });
          void drive(
            { via: pending.via, steps: pending.steps, reply: pending.reply, trace: pending.trace },
            pending.runId,
            pending.index,
            [...pending.done],
            true,
          );
        },

        deny: () => {
          const pending = get().pending;
          if (!pending) return;
          set({ pending: null });
          const label = pending.steps[pending.index]?.label ?? "that";
          const text = pending.done.length
            ? `${pending.done.join(" ")} Stopped before ${label}.`
            : `Stopped. I didn't start ${label}.`;
          void speak(text, pending.runId, false, pending.trace);
        },

        halt: () => {
          const runId = get().runId + 1;
          set({
            runId,
            streaming: false,
            pending: null,
            face: "error",
            status: "halted",
            tps: 0,
          });
          setTimeout(() => {
            if (get().runId === runId) set({ face: "idle", status: "ready" });
          }, 700);
        },

        stop: () => {
          const runId = get().runId + 1;
          set({ runId, streaming: false, pending: null, face: "idle", status: "stopped", tps: 0 });
        },

        setListening: (on: boolean) => {
          const face = get().face;
          if (on && (face === "idle" || face === "sleep")) set({ face: "listening", status: "listening" });
          if (!on && face === "listening") set({ face: "idle", status: "ready" });
        },

        setEditing: (on: boolean) => set({ editing: on }),
        setTab: (tab: TabId) => set({ tab }),
        toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
        toggleHidden: () => {
          const hidden = !get().hidden;
          set({
            hidden,
            running: true,
            focusTick: hidden ? get().focusTick : get().focusTick + 1,
          });
        },
        toggleDesk: () => set((state) => ({ deskOpen: !state.deskOpen })),
        toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
        setLowPower: (on: boolean) =>
          set((state) => ({
            settings: {
              ...state.settings,
              lowPower: on,
              model: on ? "qwen2.5-0.5b" : state.settings.preferredModel,
            },
          })),
        setModel: (id: ModelId) =>
          set((state) => ({
            settings: {
              ...state.settings,
              model: id,
              preferredModel: id,
              lowPower: id === "qwen2.5-0.5b" ? state.settings.lowPower : false,
            },
          })),
        patchSettings: (patch: Partial<Settings>) =>
          set((state) => ({ settings: { ...state.settings, ...patch } })),
        place: (x: number, y: number) => set({ placed: true, x, y }),
        clearChat: () => set({ messages: [], summary: "", pending: null }),
        quit: () => {
          const runId = get().runId + 1;
          set({
            runId,
            running: false,
            hidden: true,
            streaming: false,
            pending: null,
            face: "sleep",
            status: "quit",
            tps: 0,
            modelSlot: "off",
          });
        },
        start: () => set({ running: true, hidden: false, face: "idle", status: "ready", focusTick: get().focusTick + 1 }),
        focusWin: (id: string) => set((state) => ({ world: touchWindow(state.world, id) })),
        userClose: (id: string) => set((state) => ({ world: closeById(state.world, id) })),
        userMinimize: (id: string) => set((state) => ({ world: minimizeById(state.world, id) })),
        userType: (id: string, text: string) => set((state) => ({ world: patchText(state.world, id, text) })),
        userActivate: (action: Action) => {
          const result = applyAction(get().world, action);
          set({ world: result.world, status: result.detail.split("\n")[0]?.slice(0, 72) ?? "ready" });
        },
        wakeFace: () => {
          if (get().face === "sleep") set({ face: "idle", status: "ready" });
        },
        sleepFace: () => {
          const state = get();
          if (!state.streaming && !state.pending && state.booted && state.face === "idle") {
            set({ face: "sleep", status: "sleeping" });
          }
        },
      };
    },
    {
      name: "nupid-assistant",
      skipHydration: true,
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : localStorage,
      ),
      partialize: (state) => ({
        booted: state.booted,
        settings: state.settings,
        messages: state.messages.slice(-40),
        summary: state.summary,
        files: state.world.files,
        volume: state.world.volume,
        muted: state.world.muted,
      }),
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") return current;
        const saved = persisted as {
          booted?: boolean;
          settings?: Partial<Settings>;
          messages?: Message[];
          summary?: string;
          files?: Record<string, string>;
          volume?: number;
          muted?: boolean;
        };
        return {
          ...current,
          booted: saved.booted ?? current.booted,
          settings: { ...current.settings, ...saved.settings },
          messages: saved.messages ?? current.messages,
          summary: saved.summary ?? current.summary,
          world: {
            ...current.world,
            files: saved.files ?? current.world.files,
            volume: saved.volume ?? current.world.volume,
            muted: saved.muted ?? current.world.muted,
          },
        };
      },
    },
  ),
);
