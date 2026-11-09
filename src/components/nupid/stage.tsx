import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Desk } from "@/components/nupid/desk";
import { Widget } from "@/components/nupid/widget";
import { useNupid } from "@/lib/nupid/store";

function matchHotkey(event: KeyboardEvent, spec: string): boolean {
  const parts = spec.toLowerCase().split("+");
  const key = parts[parts.length - 1] ?? "";
  if (parts.includes("ctrl") !== event.ctrlKey) return false;
  if (parts.includes("shift") !== event.shiftKey) return false;
  if (parts.includes("alt") !== event.altKey) return false;
  if (key === "space") return event.key === " ";
  return event.key.toLowerCase() === key;
}

export function Stage() {
  const hidden = useNupid((s) => s.hidden);
  const running = useNupid((s) => s.running);
  const deskOpen = useNupid((s) => s.deskOpen);
  const glassBlur = useNupid((s) => s.settings.glassBlur);
  const glassAlpha = useNupid((s) => s.settings.glassAlpha);
  const glassTint = useNupid((s) => s.settings.glassTint);
  const lowPower = useNupid((s) => s.settings.lowPower);
  const setLowPower = useNupid((s) => s.setLowPower);
  const toggleSettings = useNupid((s) => s.toggleSettings);
  const toggleHidden = useNupid((s) => s.toggleHidden);
  const quit = useNupid((s) => s.quit);
  const start = useNupid((s) => s.start);

  useEffect(() => {
    void useNupid.persist.rehydrate();
  }, []);

  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      useNupid.getState().wakeFace();
      timer = window.setTimeout(() => useNupid.getState().sleepFace(), 70_000);
    };
    arm();
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useNupid.getState();
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        state.halt();
        return;
      }
      if (matchHotkey(event, state.settings.hotkey)) {
        event.preventDefault();
        state.toggleHidden();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main
      className="desk-sky relative h-dvh overflow-hidden text-ink"
      style={{
        ["--glass-blur" as string]: `${glassBlur}px`,
        ["--glass-alpha" as string]: String(glassAlpha),
        ["--glass-tint" as string]:
          glassTint === "peach" ? "#f0b5a4" : glassTint === "ink" ? "#1c1926" : "#143028",
      }}
    >
      <div className="desk-stars pointer-events-none absolute inset-0" />
      <div className="desk-vignette pointer-events-none absolute inset-0" />
      <h1 className="sr-only">Nupid Assistant</h1>
      <div className={clsx("absolute inset-0", deskOpen ? "z-40" : "z-0 hidden md:block")}>
        <Desk />
      </div>
      {running && !hidden ? <Widget /> : null}
      <Tray
        hidden={hidden || !running}
        lowPower={lowPower}
        onShowHide={() => (running && !hidden ? toggleHidden() : start())}
        onLowPower={() => setLowPower(!lowPower)}
        onSettings={() => {
          if (!running || hidden) start();
          toggleSettings();
        }}
        onQuit={quit}
      />
    </main>
  );
}

function Tray({
  hidden,
  lowPower,
  onShowHide,
  onLowPower,
  onSettings,
  onQuit,
}: {
  hidden: boolean;
  lowPower: boolean;
  onShowHide: () => void;
  onLowPower: () => void;
  onSettings: () => void;
  onQuit: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="fixed right-3 bottom-3 z-50">
      {menu ? (
        <div className="nupid-glass mb-2 w-44 p-1 text-sm">
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-panel-2"
            onClick={() => {
              onShowHide();
              setMenu(false);
            }}
          >
            {hidden ? "Show" : "Hide"}
          </button>
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-panel-2"
            onClick={() => {
              onLowPower();
              setMenu(false);
            }}
          >
            {lowPower ? "Low power on" : "Low power mode"}
          </button>
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-panel-2"
            onClick={() => {
              onSettings();
              setMenu(false);
            }}
          >
            Settings
          </button>
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left text-signal hover:bg-panel-2"
            onClick={() => {
              onQuit();
              setMenu(false);
            }}
          >
            Quit
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Nupid Assistant tray"
        title="Nupid Assistant"
        className="nupid-glass flex size-11 items-center justify-center rounded-full"
        onClick={() => setMenu((value) => !value)}
      >
        <span className="nupid-kicker text-phosphor">Nu</span>
      </button>
    </div>
  );
}
