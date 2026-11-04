import { useEffect, useRef } from 'react';
import { missionView } from '../sim';
import { liveMatch, projectTilesToPage } from '../app/session';
import { compassTarget, placeCompass, tilesLabel } from './missionCompassModel';
import type { Rect } from './missionCompassModel';
import './MissionCompass.css';

/** Badge side in pixels (the arrow disc; the distance caption sits under it). */
const SIZE = 46;
/** Redraws per second: the pointer follows the follow camera, so it needs more than the minimap's 10. */
const FPS = 20;
/** HUD blocks the pointer slides past (measured twice a second). */
const AVOID = [
  '.timer',
  '.top-buttons',
  '[data-testid="rumble-hud"]',
  '[data-testid="mission-dock"]',
  '[data-testid="inventory"]',
  '[data-testid="stick-pad"]',
  '.abtn',
  '.pbadge',
  '[data-testid="hud-rail"]',
];

function obstacles(): Rect[] {
  const out: Rect[] = [];
  for (const sel of AVOID)
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        out.push({ left: r.left - 4, top: r.top - 4, right: r.right + 4, bottom: r.bottom + 4 });
    }
  return out;
}

/**
 * The objective compass: a small pointer at the edge of the screen towards the nearest live objective node (or the
 * exposed boss) while it is off screen, with the distance in tiles. The follow camera shows about a dozen tiles of the
 * district, so without it the player cannot find the relays, stacks or switches. It slides along the edge past other HUD
 * blocks, never sits over the centre, and hides when the target is on screen (its marker in the world is enough) or
 * the fighter is down. Updated straight on the DOM at 20 fps (no React state per frame); `data-*` attributes carry the
 * target for tests. Pointer events pass through it.
 */
export function MissionCompass() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const arrow = el.querySelector<HTMLElement>('.mc-arrow')!;
    const dist = el.querySelector<HTMLElement>('.mc-dist')!;
    let avoid: Rect[] = [];
    let avoidAt = -Infinity;
    const hide = (): void => {
      if (el.dataset.shown !== 'no') {
        el.dataset.shown = 'no';
        el.style.display = 'none';
      }
    };
    const tick = (): void => {
      const live = liveMatch();
      const view = live ? missionView(live.state) : null;
      const me = live?.state.players[0];
      if (!live || !view || !me?.alive) return hide();
      const boss = live.state.players[view.boss.playerId];
      const target = compassTarget(view, me, boss ? { x: boss.x, y: boss.y } : null);
      if (!target) return hide();
      const proj = projectTilesToPage([me, target]);
      if (!proj) return hide();
      const now = performance.now();
      if (now - avoidAt > 500) {
        avoid = obstacles();
        avoidAt = now;
      }
      const placed = placeCompass({
        bounds: proj.bounds,
        player: proj.points[0]!,
        target: proj.points[1]!,
        size: SIZE,
        avoid,
      });
      if (!placed) return hide();
      el.style.display = '';
      el.dataset.shown = 'yes';
      el.dataset.target = target.id;
      el.dataset.kind = target.kind;
      el.dataset.tiles = String(target.tiles);
      el.style.transform = `translate(${Math.round(placed.x - SIZE / 2)}px, ${Math.round(placed.y - SIZE / 2)}px)`;
      arrow.style.transform = `rotate(${placed.angle.toFixed(3)}rad)`;
      const label = tilesLabel(target.tiles);
      if (dist.textContent !== label) dist.textContent = label;
      el.setAttribute('aria-label', `${target.kind === 'boss' ? 'Boss' : 'Objective'} ${label} away`);
    };
    tick();
    const id = window.setInterval(tick, 1000 / FPS);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div
      ref={ref}
      className="mission-compass"
      data-testid="mission-compass"
      data-shown="no"
      role="img"
      aria-label="Objective"
      style={{ display: 'none' }}
    >
      <span className="mc-disc">
        <svg className="mc-arrow" viewBox="-12 -12 24 24" aria-hidden>
          <path d="M-8 -7 L9 0 L-8 7 L-4 0 Z" />
        </svg>
      </span>
      <b className="mc-dist" />
    </div>
  );
}
