import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { appLabel } from "@/lib/nupid/types";
import { useNupid } from "@/lib/nupid/store";
import type { DeskWindow } from "@/lib/nupid/world";

function queryOf(url: string): string {
  try {
    return new URL(url).searchParams.get("q") ?? "";
  } catch {
    return "";
  }
}

function WindowBody({ win }: { win: DeskWindow }) {
  const userType = useNupid((s) => s.userType);
  const setEditing = useNupid((s) => s.setEditing);
  const userActivate = useNupid((s) => s.userActivate);
  const files = useNupid((s) => s.world.files);

  if (win.app === "notepad") {
    return (
      <div className="flex h-52 flex-col">
        <textarea
          value={win.text}
          aria-label="Notepad"
          onChange={(event) => userType(win.id, event.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          className="nupid-scroll min-h-0 flex-1 resize-none bg-transparent px-3 py-2 font-mono text-sm text-ink outline-none"
          placeholder="Empty page"
        />
        <div className="flex items-center justify-between border-t border-line px-3 py-2">
          <span className="text-xs text-mute">{win.saved ? "Saved" : "Unsaved"}</span>
          <button
            type="button"
            className="rounded-full bg-phosphor px-3 py-1 text-xs font-medium text-void"
            onClick={() => userActivate({ op: "click", target: "save" })}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  if (win.app === "browser") {
    const query = queryOf(win.url);
    const search = win.url.includes("search.nupid.local");
    return (
      <div className="flex h-52 flex-col">
        <form
          className="flex gap-2 border-b border-line p-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const url = String(data.get("url") ?? "");
            if (url) userActivate({ op: "open_url", url });
          }}
        >
          <input
            name="url"
            defaultValue={win.url}
            key={win.url}
            aria-label="Address"
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            className="nupid-field min-w-0 flex-1 px-2 py-1 font-mono text-xs"
          />
          <button type="submit" className="rounded-full px-2 text-xs text-phosphor">
            Go
          </button>
        </form>
        <div className="nupid-scroll min-h-0 flex-1 overflow-auto px-3 py-2 text-sm" style={{ transform: `translateY(-${win.scroll}px)` }}>
          {search ? (
            <div className="space-y-2">
              <p className="text-xs text-mute">Practice results — not the live web</p>
              <p className="text-ink">{query || win.text}</p>
              <p className="text-mute">A page the Windows app would open in your real browser.</p>
              <p className="text-mute">No network call was made.</p>
            </div>
          ) : (
            <p className="text-mute">
              {win.url ? `Practice page for ${win.url}. The Windows app opens this in your browser.` : "Blank page."}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (win.app === "files") {
    return (
      <ul className="h-52 space-y-1 overflow-auto p-2">
        {Object.keys(files).map((path) => (
          <li key={path}>
            <button
              type="button"
              className="w-full rounded-lg px-2 py-2 text-left font-mono text-xs text-ink hover:bg-panel-2"
              onClick={() => userActivate({ op: "click", target: path })}
            >
              {path}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <pre className="nupid-scroll h-52 overflow-auto px-3 py-2 font-mono text-xs whitespace-pre-wrap text-phosphor">
      {win.text || "nupid>"}
    </pre>
  );
}

function DeskWindowView({ win }: { win: DeskWindow }) {
  const focusWin = useNupid((s) => s.focusWin);
  const userClose = useNupid((s) => s.userClose);
  const userMinimize = useNupid((s) => s.userMinimize);
  if (win.minimized) return null;

  const onDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (window.matchMedia("(max-width: 767px)").matches) return;
    const card = event.currentTarget.parentElement;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const ox = event.clientX - rect.left;
    const oy = event.clientY - rect.top;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (ev: globalThis.PointerEvent) => {
      card.style.left = `${ev.clientX - ox}px`;
      card.style.top = `${ev.clientY - oy}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <article
      className="nupid-glass absolute w-80 overflow-hidden"
      style={{ left: win.x, top: win.y, zIndex: win.z }}
      onPointerDown={() => focusWin(win.id)}
    >
      <header className="flex cursor-grab items-center gap-2 border-b border-line px-3 py-2 active:cursor-grabbing" onPointerDown={onDrag}>
        <h2 className="min-w-0 flex-1 truncate text-sm text-ink">{win.title}</h2>
        <button type="button" aria-label={`Minimize ${appLabel(win.app)}`} className="px-2 text-mute" onClick={() => userMinimize(win.id)}>
          –
        </button>
        <button type="button" aria-label={`Close ${appLabel(win.app)}`} className="px-2 text-mute" onClick={() => userClose(win.id)}>
          ×
        </button>
      </header>
      <WindowBody win={win} />
    </article>
  );
}

export function Desk() {
  const windows = useNupid((s) => s.world.windows);
  const volume = useNupid((s) => s.world.volume);
  const muted = useNupid((s) => s.world.muted);
  const focusWin = useNupid((s) => s.focusWin);
  const deskOpen = useNupid((s) => s.deskOpen);
  const toggleDesk = useNupid((s) => s.toggleDesk);
  const userActivate = useNupid((s) => s.userActivate);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative h-full w-full">
      <p className="nupid-kicker absolute top-4 left-5 text-mute">Practice desk</p>
      {windows.length === 0 ? (
        <p className="absolute top-12 left-5 max-w-xs text-sm text-mute">
          Windows you ask for land here. Try “open notepad and type hello”.
        </p>
      ) : null}
      <button type="button" className="absolute top-3 right-4 rounded-full border border-line px-3 py-2 text-xs text-ink md:hidden" onClick={toggleDesk}>
        {deskOpen ? "Back to Nupid" : "Close"}
      </button>
      {windows.map((win) => (
        <DeskWindowView key={win.id} win={win} />
      ))}
      <footer className="nupid-glass absolute inset-x-0 bottom-0 flex h-12 items-center gap-2 px-3">
        <span className="nupid-kicker text-phosphor">Nupid</span>
        <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
          {windows.map((win) => (
            <button
              key={win.id}
              type="button"
              className="truncate rounded-md bg-panel-2 px-2 py-1 text-xs text-ink"
              onClick={() => focusWin(win.id)}
            >
              {appLabel(win.app)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="font-mono text-xs text-mute"
          onClick={() => userActivate({ op: "set_volume", dir: "mute" })}
        >
          {muted ? "Muted" : `Vol ${volume}`}
        </button>
        <span className="font-mono text-xs text-mute">{clock}</span>
      </footer>
    </div>
  );
}
