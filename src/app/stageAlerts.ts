import { getArena } from '../sim';
import type { Dir, GameState, Player, StageEvent, StageHazardStyle } from '../sim';
import { sweepVehicleNoun } from '../assets/stagePresentation';

/**
 * Concise HUD warnings for the stage hazards that concern the local player. A pure projection of
 * public state (`state.stage.events`), never of hidden information.
 */
export interface StageAlert {
  /** The stage event id (stable while the event lasts). */
  id: number;
  style: StageHazardStyle;
  text: string;
  /** danger = you are standing in a lethal hazard; warn = a lethal / board-wide hazard is coming; info = harmless. */
  level: 'danger' | 'warn' | 'info';
  /** Whole seconds until it becomes real (0 = happening now). */
  seconds: number;
}

const ARROW: Record<Dir, string> = { up: '↑', right: '→', down: '↓', left: '←' };
const RANK = { danger: 0, warn: 1, info: 2 } as const;
/** At most this many alerts at once: the floor telegraph carries the detail. */
export const MAX_STAGE_ALERTS = 2;

function where(state: GameState, tiles: readonly number[]): string {
  const w = state.width;
  const xs = tiles.map((i) => i % w);
  const ys = tiles.map((i) => Math.floor(i / w));
  const midX = (w - 1) / 2;
  const midY = (state.height - 1) / 2;
  const sameRow = ys.every((y) => y === ys[0]);
  if (sameRow) {
    const y = ys[0]!;
    return y === midY ? 'MIDDLE ROAD' : y < midY ? 'TOP ROAD' : 'BOTTOM ROAD';
  }
  const x = xs[0]!;
  return x === midX ? 'MIDDLE ROAD' : x < midX ? 'LEFT ROAD' : 'RIGHT ROAD';
}

function edgeName(state: GameState, tiles: readonly number[]): string {
  const i = tiles[0] ?? 0;
  const y = Math.floor(i / state.width);
  const x = i % state.width;
  if (tiles.every((t) => Math.floor(t / state.width) === y))
    return y < state.height / 2 ? 'TOP EDGE' : 'BOTTOM EDGE';
  return x < state.width / 2 ? 'LEFT EDGE' : 'RIGHT EDGE';
}

/** Tiles of a sweep that are still ahead of (or under) its vehicle. */
function sweepAhead(ev: StageEvent): readonly number[] {
  return ev.index < 0 ? ev.tiles : ev.tiles.slice(Math.max(0, ev.index - 1));
}

export function stageAlertFor(state: GameState, ev: StageEvent, me: Player): StageAlert | null {
  const myTile = me.y * state.width + me.x;
  const warning = state.tick < ev.startTick;
  const seconds = warning ? Math.max(1, Math.ceil((ev.startTick - state.tick) / 60)) : 0;
  const base = { id: ev.id, style: ev.style, seconds };
  switch (ev.kind) {
    case 'sweep': {
      const noun = sweepVehicleNoun(ev.style, ev.id);
      const onIt = sweepAhead(ev).includes(myTile);
      if (onIt) return { ...base, level: 'danger', text: `${noun} COMING - GET OFF THE LANE!` };
      if (!warning) return null;
      if (ev.style === 'danfo') {
        const side = ev.tiles[0]! % state.width < state.width / 2 ? 'LEFT' : 'RIGHT';
        return { ...base, level: 'warn', text: `DANFO PULLING IN - ${side} BAY` };
      }
      const arrow = ev.dir ? ` ${ARROW[ev.dir]}` : '';
      return { ...base, level: 'warn', text: `${noun} CROSSING ${where(state, ev.tiles)}${arrow}` };
    }
    case 'strike': {
      const onIt = ev.tiles.includes(myTile);
      if (ev.style === 'power') {
        if (onIt)
          return {
            ...base,
            level: 'danger',
            text: warning ? 'POWER SURGE - GET OFF THE PLATES!' : 'LIVE WIRE - MOVE!',
          };
        return { ...base, level: 'warn', text: warning ? 'POWER SURGE' : 'POWER LIVE' };
      }
      // debris (and any other strike): only the tile(s) under it matter
      if (ev.style === 'cargo') {
        if (onIt) return { ...base, level: 'danger', text: 'CONTAINER COMING DOWN - MOVE!' };
        return warning ? { ...base, level: 'info', text: 'CRANE LOWERING A CONTAINER' } : null;
      }
      if (ev.style === 'goods' && onIt)
        return { ...base, level: 'danger', text: 'GOODS FALLING ON YOU - MOVE!' };
      if (onIt) return { ...base, level: 'danger', text: 'DEBRIS ON YOU - MOVE!' };
      return null;
    }
    case 'push': {
      if (!warning) return null;
      if (ev.style === 'wash') {
        const onIt = ev.tiles.includes(myTile);
        return onIt
          ? { ...base, level: 'warn', text: 'WASH! GET OFF THE EDGE' }
          : { ...base, level: 'info', text: `WASH! ${edgeName(state, ev.tiles)}` };
      }
      return { ...base, level: 'warn', text: `GUST ${ev.dir ? ARROW[ev.dir] : ''}`.trim() };
    }
    case 'drop':
      return warning ? { ...base, level: 'info', text: 'GOODS FALLING!' } : null;
  }
}

/** Alerts for the local player, most urgent first (none once they are out or the match is not running). */
export function buildStageAlerts(state: GameState, localId: number): StageAlert[] {
  const me = state.players[localId];
  if (!me || !me.alive || state.match.phase !== 'playing') return [];
  const out: StageAlert[] = [];
  for (const ev of state.stage.events) {
    const a = stageAlertFor(state, ev, me);
    if (a) out.push(a);
  }
  out.sort((a, b) => RANK[a.level] - RANK[b.level] || a.seconds - b.seconds || a.id - b.id);
  return out.slice(0, MAX_STAGE_ALERTS);
}

/** The arena's special rule, shown big during the countdown (Power Yard). */
export function ruleBannerFor(state: GameState): string | null {
  if (state.match.phase !== 'countdown') return null;
  return getArena(state.arenaId).info.ruleWarning ?? null;
}
