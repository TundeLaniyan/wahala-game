import { useEffect, useRef } from 'react';
import { getArena } from '../sim';
import type { GameState } from '../sim';
import { SLOT_CSS } from '../assets/palette';
import { liveMatch } from '../app/session';
import { useGameStore } from '../app/store';
import { minimapGeometry, minimapLayers, tileToMinimap } from './minimapModel';
import type { MinimapGeometry } from './minimapModel';
import './Minimap.css';

/** Redraws per second (the board changes slowly; players move about 6 tiles a second). */
const FPS = 10;

const C = {
  block: '#5b5247',
  avenue: '#2b2926',
  hard: '#16130f',
  soft: '#8a7558',
  crushed: '#4a1d14',
  warning: '#ff7a1a',
  soon: 'rgba(255, 122, 26, 0.38)',
  hazard: 'rgba(255, 60, 40, 0.75)',
  core: '#ffc61a',
  gen: '#0b0b0b',
  flame: '#ffb347',
};

/** The static board (ground, avenues, buildings) for one arena, drawn once. */
function staticLayer(state: GameState, geo: MinimapGeometry, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(geo.width * dpr);
  c.height = Math.round(geo.height * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const layout = getArena(state.arenaId).layout;
  const s = geo.cell;
  for (let y = 0; y < geo.rows; y++) {
    for (let x = 0; x < geo.cols; x++) {
      const ch = layout[y]?.[x];
      g.fillStyle = ch === '#' ? C.hard : ch === '=' ? C.avenue : C.block;
      g.fillRect(x * s, y * s, s, s);
    }
  }
  return c;
}

function draw(
  g: CanvasRenderingContext2D,
  state: GameState,
  focusId: number,
  geo: MinimapGeometry,
  base: HTMLCanvasElement,
  time: number,
): void {
  const s = geo.cell;
  const layout = getArena(state.arenaId).layout;
  const L = minimapLayers(state, layout, 0, focusId);
  g.clearRect(0, 0, geo.width, geo.height);
  g.drawImage(base, 0, 0, geo.width, geo.height);
  const tile = (i: number, color: string, inset = 0): void => {
    g.fillStyle = color;
    g.fillRect(
      (i % geo.cols) * s + inset,
      Math.floor(i / geo.cols) * s + inset,
      s - inset * 2,
      s - inset * 2,
    );
  };
  for (const i of L.soft) tile(i, C.soft, s > 3 ? 1 : 0);
  for (const i of L.crushed) tile(i, C.crushed);
  for (const i of L.closingSoon) tile(i, C.soon);
  const blink = 0.55 + 0.45 * Math.sin(time * 10);
  g.globalAlpha = blink;
  for (const i of L.warning) tile(i, C.warning);
  for (const i of L.hazards) tile(i, C.hazard);
  g.globalAlpha = 1;
  if (L.core) {
    g.strokeStyle = C.core;
    g.lineWidth = 1.5;
    g.setLineDash([3, 2]);
    g.strokeRect(L.core.x0 * s + 0.75, L.core.y0 * s + 0.75, L.core.w * s - 1.5, L.core.h * s - 1.5);
    g.setLineDash([]);
  }
  for (const f of L.flames) {
    const p = tileToMinimap(geo, f.x, f.y);
    g.fillStyle = C.flame;
    g.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  for (const gen of L.generators) {
    const p = tileToMinimap(geo, gen.x, gen.y);
    g.fillStyle = '#ff3b2e';
    g.beginPath();
    g.arc(p.x, p.y, Math.max(1.6, s * 0.42), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.gen;
    g.beginPath();
    g.arc(p.x, p.y, Math.max(0.9, s * 0.24), 0, Math.PI * 2);
    g.fill();
  }
  // the follow camera's rough field of view around whoever it follows
  const f = state.players[focusId];
  if (f?.alive) {
    const p = tileToMinimap(geo, f.x, f.y);
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 1;
    g.strokeRect(p.x - 6 * s, p.y - 4.5 * s, 12 * s, 8 * s);
  }
  for (const pl of L.players) {
    const p = tileToMinimap(geo, pl.x, pl.y);
    const r = pl.kind === 'rival' ? Math.max(1.6, s * 0.45) : Math.max(2.6, s * 0.75);
    g.fillStyle = SLOT_CSS[pl.slot % SLOT_CSS.length]!;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fill();
    if (pl.kind !== 'rival') {
      g.lineWidth = pl.kind === 'local' ? 2 : 1.5;
      g.strokeStyle = pl.kind === 'local' ? '#ffffff' : '#ffc61a';
      g.stroke();
    }
  }
}

/**
 * City Rumble minimap: the whole district at a glance (avenues, buildings, crates, the closing ring
 * and the safe core, live traffic lanes, everybody still standing, and the generators and flames
 * around whoever the camera follows). Drawn on a canvas at 10 fps from the live match.
 */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const compact = useGameStore((s) => s.touchCapable);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let base: HTMLCanvasElement | null = null;
    let baseKey = '';
    let geo: MinimapGeometry | null = null;
    const tick = (): void => {
      const live = liveMatch();
      if (!live) return;
      const { state, focusId } = live;
      const short = window.innerHeight < 480;
      const maxW = short ? 130 : Math.min(230, window.innerWidth * 0.2);
      const maxH = short ? 96 : 170;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const g2 = minimapGeometry(state.width, state.height, maxW, maxH);
      const key = `${state.seed}:${state.arenaId}:${g2.cell}:${dpr}`;
      if (key !== baseKey) {
        baseKey = key;
        geo = g2;
        base = staticLayer(state, g2, dpr);
        canvas.width = Math.round(g2.width * dpr);
        canvas.height = Math.round(g2.height * dpr);
        canvas.style.width = `${g2.width}px`;
        canvas.style.height = `${g2.height}px`;
      }
      const g = canvas.getContext('2d');
      if (!g || !geo || !base) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(g, state, focusId, geo, base, performance.now() / 1000);
    };
    tick();
    const id = window.setInterval(tick, 1000 / FPS);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className={`minimap${compact ? ' compact' : ''}`} data-testid="minimap">
      <canvas ref={ref} aria-label="City map" />
    </div>
  );
}
