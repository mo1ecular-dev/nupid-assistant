import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { clsx } from "clsx";
import { Display } from "@/components/nupid/display";
import { clearMcpToken, ensureMcpToken, hasClaudeKey, setClaudeKey } from "@/lib/nupid/credentials";
import { claudeCodeCommand, claudeDesktopConfig } from "@/lib/nupid/mcp";
import { useNupid } from "@/lib/nupid/store";
import { CLAUDE_MODELS, HOTKEYS, MCP_TOOLS, MODELS, TABS, modelShort, type GlassTint, type Message, type McpTool, type Safety } from "@/lib/nupid/types";

function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, index) => (
        <p key={`${index}-${line.slice(0, 12)}`} className="whitespace-pre-wrap break-words">
          {line || " "}
        </p>
      ))}
    </div>
  );
}

function Bubble({ message, showConfirm }: { message: Message; showConfirm: boolean }) {
  const approve = useNupid((s) => s.approve);
  const deny = useNupid((s) => s.deny);
  const mine = message.role === "user";
  return (
    <div className={clsx("max-w-full", mine ? "ml-8" : "mr-2")}>
      <div
        className={clsx(
          "rounded-2xl px-3 py-2 text-sm leading-relaxed",
          mine ? "bg-panel-2 text-ink" : "text-ink",
          message.mono && "font-mono text-xs",
        )}
      >
        <Rich text={message.content || "…"} />
      </div>
      {message.trace ? <p className="nupid-readout mt-1 text-mute">{message.trace}</p> : null}
      {showConfirm ? (
        <div className="mt-2 flex gap-2">
          <button type="button" className="rounded-full bg-phosphor px-3 py-2 text-sm text-void" onClick={approve}>
            Allow
          </button>
          <button type="button" className="rounded-full border border-line px-3 py-2 text-sm text-ink" onClick={deny}>
            Stop
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Switch({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={clsx(
        "relative h-6 w-11 rounded-full border transition-colors",
        on ? "border-phosphor bg-phosphor" : "border-line bg-void",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 size-4 rounded-full transition-transform",
          on ? "translate-x-5 bg-void" : "translate-x-1 bg-mute",
        )}
      />
    </button>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const settings = useNupid((s) => s.settings);
  const setModel = useNupid((s) => s.setModel);
  const setLowPower = useNupid((s) => s.setLowPower);
  const patchSettings = useNupid((s) => s.patchSettings);
  const clearChat = useNupid((s) => s.clearChat);

  return (
    <div className="nupid-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 pb-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Settings</h2>
        <button type="button" className="text-sm text-phosphor" onClick={onClose}>
          Done
        </button>
      </div>
      <fieldset className="space-y-1">
        <legend className="nupid-kicker mb-1 text-mute">Model</legend>
        {MODELS.map((model) => (
          <label key={model.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1 text-sm">
            <span>
              <span className="text-ink">{model.name}</span>
              <span className="ml-2 text-mute">
                {model.ram} · {model.note}
              </span>
            </span>
            <input
              type="radio"
              name="model"
              checked={settings.model === model.id}
              onChange={() => setModel(model.id)}
            />
          </label>
        ))}
      </fieldset>
      <label className="flex items-center justify-between gap-3 text-sm">
        Low power
        <Switch on={settings.lowPower} label="Low power mode" onChange={setLowPower} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        Web access
        <Switch
          on={settings.webAccess}
          label="Web access"
          onChange={(webAccess) => patchSettings({ webAccess })}
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        Start with Windows
        <Switch
          on={settings.startWithWindows}
          label="Start with Windows"
          onChange={(startWithWindows) => patchSettings({ startWithWindows })}
        />
      </label>
      <p className="text-xs text-mute">Start with Windows is stored for the desktop build. It stays off until you turn it on.</p>
      <label className="block text-sm">
        <span className="nupid-kicker text-mute">Safety</span>
        <select
          className="nupid-field mt-1 w-full px-2 py-2"
          value={settings.safety}
          onChange={(event) => patchSettings({ safety: event.target.value as Safety })}
        >
          <option value="cautious">Cautious — confirm writes too</option>
          <option value="standard">Standard — confirm destructive steps</option>
          <option value="permissive">Permissive — still confirms shell and purchases</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="nupid-kicker text-mute">Face</span>
        <select
          className="nupid-field mt-1 w-full px-2 py-2"
          value={settings.theme}
          onChange={(event) => patchSettings({ theme: event.target.value as typeof settings.theme })}
        >
          <option value="phosphor">Phosphor</option>
          <option value="amber">Amber</option>
          <option value="ice">Ice</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="nupid-kicker text-mute">Show / hide</span>
        <select
          className="nupid-field mt-1 w-full px-2 py-2"
          value={settings.hotkey}
          onChange={(event) => patchSettings({ hotkey: event.target.value })}
        >
          {HOTKEYS.map((hotkey) => (
            <option key={hotkey.id} value={hotkey.id}>
              {hotkey.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-mute">Emergency stop is Ctrl+Shift+H. It halts speech and any action immediately.</p>
      <label className="block text-sm">
        <span className="nupid-kicker text-mute">System prompt</span>
        <textarea
          value={settings.systemPrompt}
          onChange={(event) => patchSettings({ systemPrompt: event.target.value })}
          className="nupid-field mt-1 h-20 w-full resize-none px-2 py-2 text-sm"
        />
      </label>
      <button type="button" className="self-start text-sm text-signal" onClick={clearChat}>
        Clear chat
      </button>
      <McpSettings />
    </div>
  );
}

function McpSettings() {
  const settings = useNupid((s) => s.settings);
  const patchSettings = useNupid((s) => s.patchSettings);
  const callMcp = useNupid((s) => s.callMcp);
  const connectExternal = useNupid((s) => s.connectExternal);
  const externalTools = useNupid((s) => s.externalTools);
  const actionLog = useNupid((s) => s.actionLog);
  const [keyOn, setKeyOn] = useState(hasClaudeKey());
  const [copied, setCopied] = useState("");
  const snippet = claudeDesktopConfig();

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <p className="nupid-kicker text-mute">Brain</p>
      <label className="block text-sm">
        <select
          className="nupid-field w-full px-2 py-2"
          value={settings.brain}
          onChange={(event) => {
            const brain = event.target.value as "local" | "claude";
            if (brain === "claude" && !settings.screenLeaveAck) {
              const ok = window.confirm("Claude sends the focused window's text off this PC. Screenshots stay here. Continue?");
              if (!ok) return;
              patchSettings({ brain, screenLeaveAck: true });
              return;
            }
            patchSettings({ brain });
          }}
        >
          <option value="local">Local</option>
          <option value="claude">Claude API</option>
        </select>
      </label>
      {settings.brain === "claude" ? (
        <>
          <label className="block text-sm">
            <span className="nupid-kicker text-mute">Claude model</span>
            <select
              className="nupid-field mt-1 w-full px-2 py-2"
              value={settings.claudeModel}
              onChange={(event) => patchSettings({ claudeModel: event.target.value })}
            >
              {CLAUDE_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="nupid-kicker text-mute">API key</span>
            <input
              type="password"
              autoComplete="off"
              placeholder={keyOn ? "Saved in this session" : "Not stored on disk"}
              className="nupid-field mt-1 w-full px-2 py-2"
              onChange={(event) => {
                setClaudeKey(event.target.value);
                setKeyOn(hasClaudeKey());
              }}
            />
          </label>
          <p className="text-xs text-mute">Windows keeps this in Credential Manager. This preview keeps it in memory only.</p>
        </>
      ) : null}
      <label className="flex items-center justify-between gap-3 text-sm">
        MCP server
        <Switch
          on={settings.mcpServer}
          label="MCP server"
          onChange={(mcpServer) => {
            if (!mcpServer) clearMcpToken();
            patchSettings({ mcpServer, mcpHttp: mcpServer ? settings.mcpHttp : false });
          }}
        />
      </label>
      {settings.mcpServer ? (
        <>
          <label className="flex items-center justify-between gap-3 text-sm">
            Localhost HTTP
            <Switch
              on={settings.mcpHttp}
              label="Localhost MCP HTTP"
              onChange={(mcpHttp) => patchSettings({ mcpHttp })}
            />
          </label>
          {settings.mcpHttp ? (
            <p className="break-all font-mono text-xs text-mute">127.0.0.1 token {ensureMcpToken()}</p>
          ) : null}
          <p className="nupid-kicker text-mute">Tool permissions</p>
          {MCP_TOOLS.map((tool) => (
            <label key={tool} className="flex items-center justify-between gap-3 text-sm">
              {tool.replaceAll("_", " ")}
              <Switch
                on={settings.mcpPermissions[tool]}
                label={tool}
                onChange={(on) =>
                  patchSettings({ mcpPermissions: { ...settings.mcpPermissions, [tool]: on } })
                }
              />
            </label>
          ))}
          <button
            type="button"
            className="rounded-full border border-line px-3 py-2 text-sm"
            onClick={() =>
              callMcp(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_screen" satisfies McpTool, arguments: {} } }))
            }
          >
            Try read screen
          </button>
          <pre className="nupid-field overflow-auto p-2 font-mono text-[11px] whitespace-pre-wrap">{snippet}</pre>
          <button
            type="button"
            className="text-sm text-phosphor"
            onClick={() => {
              void navigator.clipboard?.writeText(snippet);
              setCopied("config");
            }}
          >
            {copied === "config" ? "Copied" : "Copy Claude Desktop config"}
          </button>
          <p className="font-mono text-xs text-mute">{claudeCodeCommand()}</p>
          <label className="block text-sm">
            <span className="nupid-kicker text-mute">External MCP (localhost)</span>
            <input
              className="nupid-field mt-1 w-full px-2 py-2"
              placeholder="http://127.0.0.1:3000/mcp"
              value={settings.externalMcp}
              onChange={(event) => patchSettings({ externalMcp: event.target.value })}
            />
          </label>
          <button type="button" className="text-sm text-phosphor" onClick={() => void connectExternal()}>
            Connect
          </button>
          {externalTools.length ? <p className="text-xs text-mute">Tools: {externalTools.join(", ")}</p> : null}
          {actionLog.length ? <p className="text-xs text-mute">Log: {actionLog.slice(-3).join(" · ")}</p> : null}
        </>
      ) : (
        <p className="text-xs text-mute">MCP stays off, so it uses no extra memory until you enable it.</p>
      )}
      <p className="nupid-kicker text-mute">Glass</p>
      <label className="block text-sm">
        Blur {settings.glassBlur}
        <input
          type="range"
          min={0}
          max={28}
          value={settings.glassBlur}
          onChange={(event) => patchSettings({ glassBlur: Number(event.target.value) })}
          className="w-full"
        />
      </label>
      <label className="block text-sm">
        Tint strength {Math.round(settings.glassAlpha * 100)}
        <input
          type="range"
          min={20}
          max={80}
          value={Math.round(settings.glassAlpha * 100)}
          onChange={(event) => patchSettings({ glassAlpha: Number(event.target.value) / 100 })}
          className="w-full"
        />
      </label>
      <label className="block text-sm">
        <span className="nupid-kicker text-mute">Glass tint</span>
        <select
          className="nupid-field mt-1 w-full px-2 py-2"
          value={settings.glassTint}
          onChange={(event) => patchSettings({ glassTint: event.target.value as GlassTint })}
        >
          <option value="phosphor">Mint</option>
          <option value="peach">Peach</option>
          <option value="ink">Clear</option>
        </select>
      </label>
    </div>
  );
}

function Wake() {
  const settings = useNupid((s) => s.settings);
  const setModel = useNupid((s) => s.setModel);
  const patchSettings = useNupid((s) => s.patchSettings);
  const boot = useNupid((s) => s.boot);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="nupid-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 pt-2">
        <p className="text-sm leading-relaxed text-ink">
          Straight commands skip the model. This desk is only a preview.
        </p>
        <div className="grid gap-1">
          {MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => setModel(model.id)}
              className={clsx(
                "rounded-xl border px-3 py-1.5 text-left text-sm",
                settings.model === model.id ? "border-phosphor text-ink" : "border-line text-mute",
              )}
            >
              {model.name}
              <span className="ml-2">{model.ram}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between text-sm text-mute">
          Safety
          <select
            className="nupid-field px-2 py-1 text-ink"
            value={settings.safety}
            onChange={(event) => patchSettings({ safety: event.target.value as Safety })}
          >
            <option value="cautious">Cautious</option>
            <option value="standard">Standard</option>
            <option value="permissive">Permissive</option>
          </select>
        </label>
      </div>
      <div className="shrink-0 px-3 pt-2 pb-3">
        <button type="button" className="w-full rounded-full bg-phosphor py-2 text-sm font-medium text-void" onClick={boot}>
          Wake Nupid
        </button>
      </div>
    </div>
  );
}

export function Widget() {
  const collapsed = useNupid((s) => s.collapsed);
  const placed = useNupid((s) => s.placed);
  const x = useNupid((s) => s.x);
  const y = useNupid((s) => s.y);
  const tab = useNupid((s) => s.tab);
  const face = useNupid((s) => s.face);
  const tps = useNupid((s) => s.tps);
  const status = useNupid((s) => s.status);
  const modelSlot = useNupid((s) => s.modelSlot);
  const settings = useNupid((s) => s.settings);
  const messages = useNupid((s) => s.messages);
  const pending = useNupid((s) => s.pending);
  const streaming = useNupid((s) => s.streaming);
  const booted = useNupid((s) => s.booted);
  const settingsOpen = useNupid((s) => s.settingsOpen);
  const focusTick = useNupid((s) => s.focusTick);
  const setTab = useNupid((s) => s.setTab);
  const toggleCollapsed = useNupid((s) => s.toggleCollapsed);
  const toggleHidden = useNupid((s) => s.toggleHidden);
  const toggleSettings = useNupid((s) => s.toggleSettings);
  const toggleDesk = useNupid((s) => s.toggleDesk);
  const place = useNupid((s) => s.place);
  const send = useNupid((s) => s.send);
  const stop = useNupid((s) => s.stop);
  const halt = useNupid((s) => s.halt);
  const control = useNupid((s) => s.control);
  const online = useNupid((s) => s.online);
  const setListening = useNupid((s) => s.setListening);
  const shellRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.face = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusTick]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, streaming, pending]);

  const onDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (window.matchMedia("(max-width: 767px)").matches) return;
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const ox = event.clientX - rect.left;
    const oy = event.clientY - rect.top;
    const move = (ev: PointerEvent) => {
      const nx = Math.min(window.innerWidth - 80, Math.max(8, ev.clientX - ox));
      const ny = Math.min(window.innerHeight - 80, Math.max(8, ev.clientY - oy));
      place(nx, ny);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const slot = modelSlot === "hot" ? "live" : modelSlot === "loading" ? "load" : "off";
  const source = [control === "mcp" ? "CLAUDE/MCP" : "", online ? "ONLINE" : ""].filter(Boolean).join(" · ");
  const thinking = face === "thinking" || modelSlot === "loading";

  if (collapsed) {
    return (
      <button
        type="button"
        ref={shellRef as unknown as RefObject<HTMLButtonElement>}
        aria-label="Expand Nupid Assistant"
        onClick={toggleCollapsed}
        className="nupid-shell fixed right-4 bottom-20 z-30 h-orb w-orb overflow-hidden rounded-full p-1 max-md:bottom-4"
        style={placed ? ({ "--nupid-x": `${x}px`, "--nupid-y": `${y}px` } as CSSProperties) : undefined}
      >
        <Display
          tab="face"
          face={face}
          tps={tps}
          theme={settings.theme}
          lowPower={settings.lowPower}
          compact
          status={status}
          modelLabel={modelShort(settings.model)}
          slot={slot}
          source={source}
        />
      </button>
    );
  }

  return (
    <section
      ref={shellRef}
      aria-label="Nupid Assistant"
      className={clsx(
        "nupid-shell fixed z-30 flex flex-col overflow-hidden",
        "max-md:inset-x-3 max-md:top-3 max-md:bottom-3",
        "md:right-4 md:bottom-20 md:h-widget md:w-widget",
        placed && "nupid-placed",
      )}
      style={placed ? ({ "--nupid-x": `${x}px`, "--nupid-y": `${y}px` } as CSSProperties) : undefined}
    >
      <div className="flex items-center gap-1 px-3 pt-3 pb-1">
        <div className="min-w-0 flex-1 cursor-grab py-1 active:cursor-grabbing" onPointerDown={onDrag}>
          <p className="nupid-kicker text-phosphor">Nupid</p>
        </div>
        <button type="button" className="px-2 py-2 text-xs text-mute md:hidden" onClick={toggleDesk}>
          Desk
        </button>
        <button type="button" aria-label="Settings" className="px-2 py-2 text-xs text-mute" onClick={toggleSettings}>
          Set
        </button>
        <button type="button" aria-label="Collapse" className="px-2 py-2 text-xs text-mute" onClick={toggleCollapsed}>
          Min
        </button>
        <button type="button" aria-label="Hide to tray" className="px-2 py-2 text-xs text-mute" onClick={toggleHidden}>
          Hide
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 pb-2" role="tablist" aria-label="Display">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={clsx(
              "shrink-0 rounded-full px-2 py-1 text-xs tracking-wide uppercase",
              tab === item.id ? "bg-phosphor text-void" : "text-mute",
            )}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Display
        tab={tab}
        face={face}
        tps={tps}
        theme={settings.theme}
        lowPower={settings.lowPower}
        status={status}
        modelLabel={modelShort(settings.model)}
        slot={slot}
          source={source}
      />
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <p className="nupid-readout truncate text-phosphor">{status}</p>
        {thinking ? (
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="nupid-think-dot" style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </span>
        ) : null}
      </div>
      <p className="sr-only">
        {face}. {status}. {tps.toFixed(1)} tokens per second.
      </p>
      {settingsOpen ? (
        <Settings onClose={toggleSettings} />
      ) : !booted ? (
        <Wake />
      ) : (
        <>
          <div ref={scrollerRef} className="nupid-scroll mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3 py-2">
            {messages.length === 0 ? (
              <p className="text-sm text-mute">
                Open notepad and type hello. Read the screen. Search for dot-matrix. Volume down.
              </p>
            ) : (
              messages.map((message, index) => (
                <Bubble
                  key={message.id}
                  message={message}
                  showConfirm={Boolean(message.pendingConfirm && pending && index === messages.length - 1)}
                />
              ))
            )}
          </div>
          <form
            className="flex items-end gap-2 px-3 pt-1 pb-3"
            onSubmit={(event) => {
              event.preventDefault();
              const value = inputRef.current?.value ?? "";
              if (!value.trim() || streaming) return;
              if (inputRef.current) inputRef.current.value = "";
              void send(value);
            }}
          >
            <label className="sr-only" htmlFor="nupid-input">
              Message Nupid
            </label>
            <textarea
              id="nupid-input"
              ref={inputRef}
              rows={1}
              placeholder="Tell Nupid"
              className="nupid-field max-h-24 min-h-10 flex-1 resize-none px-3 py-2 text-sm"
              onFocus={() => setListening(true)}
              onBlur={() => setListening(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            {streaming ? (
              <button type="button" aria-label="Stop" className="rounded-full border border-line px-3 py-2 text-sm text-ink" onClick={stop}>
                Stop
              </button>
            ) : (
              <button type="submit" aria-label="Send" className="rounded-full bg-phosphor px-3 py-2 text-sm text-void">
                Send
              </button>
            )}
            <button type="button" aria-label="Emergency stop" className="rounded-full px-2 py-2 text-sm text-signal" onClick={halt}>
              Halt
            </button>
          </form>
        </>
      )}
    </section>
  );
}
