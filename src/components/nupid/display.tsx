import { useEffect, useRef } from "react";
import type { FaceMode, FaceTheme, TabId } from "@/lib/nupid/types";

type Props = {
  tab: TabId;
  face: FaceMode;
  tps: number;
  theme: FaceTheme;
  lowPower: boolean;
  compact?: boolean;
  status: string;
  modelLabel: string;
  slot: string;
};

const THEME = {
  phosphor: { dot: "#e7fff3", rim: "#b6f3c8", dim: "#16382c", blush: "#f0b5a4" },
  amber: { dot: "#fff1d6", rim: "#ffc56d", dim: "#3a2a16", blush: "#f0b5a4" },
  ice: { dot: "#eef7ff", rim: "#9fd4ff", dim: "#163044", blush: "#f0b5a4" },
} as const;

const RAW_FONT = `
A 0110 1001 1111 1001 1001
B 1110 1001 1110 1001 1110
C 0111 1000 1000 1000 0111
D 1110 1001 1001 1001 1110
E 1111 1000 1110 1000 1111
F 1111 1000 1110 1000 1000
G 0111 1000 1011 1001 0111
H 1001 1001 1111 1001 1001
I 0110 0010 0010 0010 0110
J 0111 0001 0001 1001 0110
K 1001 1010 1100 1010 1001
L 1000 1000 1000 1000 1111
M 1001 1111 1111 1001 1001
N 1001 1101 1011 1001 1001
O 0110 1001 1001 1001 0110
P 1110 1001 1110 1000 1000
Q 0110 1001 1011 0110 0001
R 1110 1001 1110 1010 1001
S 0111 1000 0110 0001 1110
T 1111 0100 0100 0100 0100
U 1001 1001 1001 1001 0110
V 1001 1001 1001 1010 0100
W 1001 1001 1111 1111 1001
X 1001 1001 0110 1001 1001
Y 1001 1001 0100 0100 0100
Z 1111 0001 0110 1000 1111
0 0110 1001 1001 1001 0110
1 0100 1100 0100 0100 1110
2 1110 0001 0110 1000 1111
3 1110 0001 0110 0001 1110
4 1001 1001 1111 0001 0001
5 1111 1000 1110 0001 1110
6 0110 1000 1110 1001 0110
7 1111 0001 0010 0100 0100
8 0110 1001 0110 1001 0110
9 0110 1001 0111 0001 0110
. 0000 0000 0000 0000 0100
- 0000 0000 1111 0000 0000
/ 0001 0010 0100 1000 0000
: 0000 0100 0000 0100 0000
`;

const FONT: Record<string, number[]> = {};
for (const line of RAW_FONT.trim().split("\n")) {
  const [ch, ...rows] = line.trim().split(/\s+/);
  if (!ch || rows.length !== 5) continue;
  FONT[ch] = rows.map((row) => Number.parseInt(row, 2));
}

function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function blinkAmount(time: number, mode: FaceMode): number {
  if (mode === "thinking" || mode === "acting" || mode === "error" || mode === "speaking") return 1;
  const period = mode === "sleep" ? 7.2 : 5.4;
  const x = time % period;
  if (x < 0.42) {
    const k = x / 0.42;
    return k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2;
  }
  return 1;
}

function eyeAlpha(c: number, r: number, mode: FaceMode, time: number): number {
  const edge = Math.min(c, 7 - c, r, 5 - r);
  let alpha = 0.42 + edge * 0.16;
  const glance = Math.sin(time * 0.35);
  if (mode === "idle" && glance > 0.93) alpha *= c < 3 ? 0.35 : 1;
  if (mode === "idle" && glance < -0.93) alpha *= c > 4 ? 0.35 : 1;
  if (mode === "listening") alpha = Math.min(1, alpha + 0.28);
  if (mode === "thinking") {
    const scan = (Math.sin(time * 2.4) * 0.5 + 0.5) * 7;
    alpha = Math.max(0.12, 1 - Math.abs(c - scan) * 0.38);
    alpha *= 0.78 + Math.sin(time * 7 + c) * 0.22;
  }
  if (mode === "acting") alpha *= 0.35 + (c / 7) * 0.7;
  if (mode === "speaking") alpha = 0.55 + edge * 0.12;
  if (mode === "error") {
    const flicker = 0.45 + Math.sin(time * 28) * 0.35;
    return r === 2 || r === 3 ? flicker : 0.05;
  }
  if (mode === "sleep") {
    if (r < 3) return 0.05;
    return alpha * 0.28;
  }
  alpha *= 0.92 + Math.sin(time * 1.7 + c * 0.6 + r) * 0.08;
  return Math.max(0, Math.min(1, alpha * blinkAmount(time, mode)));
}

function mouthAlpha(c: number, r: number, mode: FaceMode, time: number): number {
  if (mode === "error") return 0.04;
  if (mode === "sleep") return r === 1 && c === 1 ? 0.2 : 0.05;
  if (mode === "thinking") {
    const i = Math.floor(time * 7) % 6;
    return r * 3 + c === i ? 1 : 0.16;
  }
  if (mode === "speaking") {
    const tick = Math.floor(time * 12) % 3;
    return (c + r * 2) % 3 === tick ? 1 : 0.22;
  }
  if (mode === "listening") return r === 1 ? 0.85 : 0.2;
  return r === 1 ? 0.9 : c === 1 ? 0.25 : 0.12;
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode: FaceMode,
  time: number,
  theme: (typeof THEME)[FaceTheme],
) {
  const cx = w / 2;
  const cy = h / 2;
  const gap = Math.min(w, h) * 0.038;
  const eyeW = 7 * gap;
  const spread = gap * 1.7;
  const leftX = cx - spread - eyeW;
  const rightX = cx + spread;
  const eyeY = cy - gap * 2.3;
  const radius = Math.max(1.15, gap * 0.34);

  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const alpha = eyeAlpha(c, r, mode, time);
      const y = eyeY + r * gap;
      dot(ctx, leftX + c * gap, y, radius + alpha * 0.8, alpha > 0.2 ? theme.dot : theme.dim, Math.max(alpha, 0.14));
      dot(ctx, rightX + c * gap, y, radius + alpha * 0.8, alpha > 0.2 ? theme.dot : theme.dim, Math.max(alpha, 0.14));
    }
  }

  const blushY = eyeY + gap * 2.4;
  const blushA = mode === "sleep" || mode === "error" ? 0.22 : 0.85;
  dot(ctx, leftX - gap * 1.15, blushY, gap * 0.55, theme.blush, blushA);
  dot(ctx, rightX + eyeW + gap * 1.15, blushY, gap * 0.55, theme.blush, blushA);

  const mouthX = cx - gap;
  const mouthY = cy + gap * 2.5;
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const alpha = mouthAlpha(c, r, mode, time);
      dot(ctx, mouthX + c * gap, mouthY + r * gap, radius + alpha * 0.5, theme.dot, Math.max(alpha, 0.08));
    }
  }

  const pulse =
    mode === "acting"
      ? 0.35 + Math.sin(time * 8) * 0.65
      : mode === "listening"
        ? 0.55 + Math.sin(time * 3) * 0.35
        : 0.18;
  dot(ctx, cx + Math.min(w, h) * 0.28, cy - Math.min(w, h) * 0.28, gap * 0.42, "#ff4d5e", pulse);
}

function drawPulse(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  level: number,
  color: string,
  dim: string,
) {
  const cols = 13;
  const rows = 11;
  const gap = Math.min(w, h) * 0.062;
  const ox = w / 2 - ((cols - 1) * gap) / 2;
  const oy = h / 2 - ((rows - 1) * gap) / 2;
  for (let c = 0; c < cols; c += 1) {
    const env = Math.sin(time * (1.1 + level * 4.2) + c * 0.55) * 0.5 + 0.5;
    const lit = Math.max(1, Math.round((0.12 + level * 0.88) * env * rows));
    for (let r = 0; r < rows; r += 1) {
      const on = r >= rows - lit;
      dot(ctx, ox + c * gap, oy + r * gap, gap * 0.28, on ? color : dim, on ? 0.35 + (r / rows) * 0.65 : 0.16);
    }
  }
}

function drawRipple(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  level: number,
  color: string,
) {
  const cx = w / 2;
  const cy = h / 2;
  const speed = 1.2 + level * 5;
  for (let ring = 1; ring <= 5; ring += 1) {
    const count = 8 + ring * 4;
    const rad = ring * Math.min(w, h) * 0.075;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + time * 0.2;
      const wave = Math.sin(time * speed - ring * 0.9) * 0.5 + 0.5;
      const alpha = 0.12 + wave * (0.2 + level * 0.7) * (1 - ring / 7);
      dot(ctx, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 2.1, color, alpha);
    }
  }
}

function drawTorus(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  level: number,
  color: string,
) {
  const cx = w / 2;
  const cy = h / 2;
  const spin = time * (0.5 + level * 2.4);
  const rx = Math.min(w, h) * 0.3;
  const ry = Math.min(w, h) * 0.16;
  for (let i = 0; i < 28; i += 1) {
    const a = spin + (i / 28) * Math.PI * 2;
    const tube = Math.sin(a * 3 + time) * 0.5 + 0.5;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    const alpha = 0.2 + tube * (0.25 + level * 0.7);
    dot(ctx, x, y, 2 + tube * 1.4, color, alpha);
    dot(ctx, cx + Math.cos(a + 0.2) * rx * 0.62, cy + Math.sin(a + 0.4) * ry * 0.8, 1.6, color, alpha * 0.7);
  }
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  scale: number,
  color: string,
  alpha: number,
) {
  const rows = FONT[ch];
  if (!rows) return scale * 3;
  rows.forEach((bits, r) => {
    for (let c = 0; c < 4; c += 1) {
      if ((bits & (1 << (3 - c))) === 0) continue;
      dot(ctx, x + c * scale, y + r * scale, scale * 0.38, color, alpha);
    }
  });
  return scale * 5;
}

function drawClock(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  level: number,
  color: string,
) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const text = `${hh}:${mm}`;
  const scale = Math.min(w, h) * 0.045;
  let width = 0;
  for (const ch of text) width += (FONT[ch] ? 5 : 3) * scale;
  let x = w / 2 - width / 2;
  const y = h / 2 - scale * 2.5;
  for (const ch of text) x += drawGlyph(ctx, ch, x, y, scale, color, 0.92);
  const cx = w / 2;
  const cy = h / 2;
  const ring = Math.min(w, h) * 0.38;
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const bright = i === now.getHours() % 12;
    dot(ctx, cx + Math.cos(a) * ring, cy + Math.sin(a) * ring, bright ? 3 : 1.7, color, bright ? 1 : 0.28);
  }
  const sec = (now.getSeconds() + (time % 1)) / 60;
  const sa = sec * Math.PI * 2 - Math.PI / 2;
  dot(ctx, cx + Math.cos(sa) * ring * 0.78, cy + Math.sin(sa) * ring * 0.78, 2.4, color, 0.4 + level * 0.6);
}

function drawTicker(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  text: string,
  color: string,
  level: number,
) {
  const message = (text || "NUPID").toUpperCase().replace(/[^A-Z0-9 .:/ -]/g, " ");
  const scale = Math.max(3.2, Math.min(w, h) * 0.034);
  const unit = scale * 5;
  const total = message.length * unit + unit * 4;
  const offset = (time * (28 + level * 70)) % total;
  const y = h / 2 - scale * 2.4;
  for (let copy = 0; copy < 2; copy += 1) {
    let x = w / 2 - offset + copy * total;
    for (const ch of message) {
      if (ch === " ") x += unit * 0.7;
      else x += drawGlyph(ctx, ch, x, y, scale, color, 0.9);
    }
  }
}

export function Display({
  tab,
  face,
  tps,
  theme,
  lowPower,
  compact,
  status,
  modelLabel,
  slot,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ tab, face, tps, theme, lowPower, compact, status });
  propsRef.current = { tab, face, tps, theme, lowPower, compact, status };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = 0;
    let smooth = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (now: number) => {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW < 2 || cssH < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.floor(cssW * dpr);
      const ph = Math.floor(cssH * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const live = propsRef.current;
      const colors = THEME[live.theme];
      const cx = cssW / 2;
      const cy = cssH / 2;
      const radius = Math.min(cssW, cssH) / 2 - (live.compact ? 3 : 18);
      const t = now / 1000;
      const target = Math.max(0, Math.min(1, live.tps / 24));
      smooth += (target - smooth) * 0.12;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#07060d";
      ctx.fill();
      ctx.lineWidth = live.compact ? 2 : 2.4;
      ctx.strokeStyle = colors.rim;
      ctx.shadowColor = colors.rim;
      ctx.shadowBlur = reduced ? 0 : 16;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 5, 0, Math.PI * 2);
      ctx.clip();
      if (live.tab === "face" || live.compact) drawFace(ctx, cssW, cssH, live.face, reduced ? 0 : t, colors);
      else if (live.tab === "pulse") drawPulse(ctx, cssW, cssH, t, smooth, colors.dot, colors.dim);
      else if (live.tab === "ripple") drawRipple(ctx, cssW, cssH, t, smooth, colors.dot);
      else if (live.tab === "torus") drawTorus(ctx, cssW, cssH, t, smooth, colors.dot);
      else if (live.tab === "clock") drawClock(ctx, cssW, cssH, t, smooth, colors.dot);
      else drawTicker(ctx, cssW, cssH, t, live.status, colors.dot, smooth);
      ctx.restore();
    };

    const loop = (now: number) => {
      if (document.hidden) return;
      raf = requestAnimationFrame(loop);
      const live = propsRef.current;
      const active =
        live.face === "thinking" ||
        live.face === "speaking" ||
        live.face === "acting" ||
        live.face === "listening" ||
        (live.tab !== "face" && !live.compact);
      let fps = 5;
      if (reduced) fps = 5;
      else if (live.lowPower) fps = active ? 15 : 5;
      else if (active) fps = 30;
      if (now - last < 1000 / fps) return;
      last = now;
      draw(now);
    };

    const onVis = () => {
      if (!document.hidden) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    draw(performance.now());
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className={compact ? "relative h-full w-full" : "relative mx-auto w-face max-w-full"}>
      <div className={compact ? "h-full w-full" : "relative aspect-square"}>
        <canvas ref={ref} className="h-full w-full" aria-hidden />
        {compact ? null : (
          <>
            <span className="nupid-readout absolute top-0 left-0 text-mute">NUPID/01</span>
            <span className="nupid-readout absolute top-0 right-0 text-phosphor">{tps.toFixed(1)} tok/s</span>
          </>
        )}
      </div>
      {compact ? null : (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="nupid-readout text-ink">{face}</span>
          <span className="nupid-readout truncate text-mute">
            {modelLabel} · {slot}
          </span>
        </div>
      )}
    </div>
  );
}
