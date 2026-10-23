/**
 * Floor traps: potholes make a player stumble, oil slicks make them slide a predictable number of
 * tiles. Both are visible and never lethal on their own.
 *
 * Early traps (the arena's `hazardLayout`) exist for the whole match when the match option is on.
 * The ENDGAME trap waves are mandatory in every standard match: each is telegraphed on the floor,
 * then goes live (the first at the start of the final 30 seconds). Only a step that STARTS onto a
 * live trap triggers it, so a trap that appears under a player never affects them until they move.
 */
import { DIR_VEC, tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState, SimEvent } from '../types';
import { beginStep, canPlayerEnter } from './stepping';
import { playerStepTicks } from './queries';

/** Applies hazard effects to players that started a step onto a hazard tile this tick. */
export function updateFloorHazards(state: GameState, events: SimEvent[]): void {
  if (Object.keys(state.floorHazards).length === 0) return;
  for (const p of state.players) {
    if (!p.alive || p.stepRemaining !== p.stepTotal || p.stepTotal === 0) continue;
    const kind = state.floorHazards[tileIndex(state, p.x, p.y)];
    if (!kind) continue;
    if (kind === 'pothole') {
      // A stumble is a brief non-lethal daze that starts once the step into the pothole completes.
      p.dazedUntil = Math.max(
        p.dazedUntil,
        state.tick + p.stepTotal + state.config.hazards.potholeStumbleTicks,
      );
      p.slide = null;
    } else {
      p.slide = { dir: p.facing, remaining: state.config.hazards.oilSlideTiles };
    }
    events.push({ type: 'hazardTriggered', playerId: p.id, kind });
  }
}

/** Telegraphs and activates the mandatory endgame trap waves; clears traps on crushed tiles. */
export function updateEndgameTraps(state: GameState, events: SimEvent[]): void {
  const t = state.endgameTraps;
  const now = state.match.playTicks;
  const warn = state.config.hazards.endgameWarnTicks;
  const open = (i: number): boolean => state.tiles[i] !== Tile.Hard && state.floorHazards[i] === undefined;

  while (t.warned < t.waves.length && now >= t.liveAt[t.warned]! - warn) {
    const wave = t.warned++;
    const liveTick = state.tick + Math.max(0, t.liveAt[wave]! - now);
    const tiles = t.waves[wave]!.filter((tile) => open(tile.index));
    t.warnings.push(...tiles.map((tile) => ({ ...tile, liveTick })));
    events.push({ type: 'trapsWarning', wave, tiles, liveTick });
  }
  while (t.live < t.warned && now >= t.liveAt[t.live]!) {
    const wave = t.live++;
    const due = t.warnings.filter((w) => w.liveTick <= state.tick);
    t.warnings = t.warnings.filter((w) => w.liveTick > state.tick);
    const tiles = due.filter((w) => open(w.index)).map(({ index, kind }) => ({ index, kind }));
    for (const tile of tiles) state.floorHazards[tile.index] = tile.kind;
    events.push({ type: 'trapsActivated', wave, tiles });
  }
  // A Wahala Crush block buries whatever trap was on its tile.
  if (state.crush) {
    for (const key in state.floorHazards) {
      if (state.tiles[Number(key)] === Tile.Hard) delete state.floorHazards[Number(key)];
    }
    t.warnings = t.warnings.filter((w) => state.tiles[w.index] !== Tile.Hard);
  }
}

/** Continues an oil slide: returns true if the player was moved (and so ignores input this tick). */
export function continueSlide(state: GameState, p: GameState['players'][number]): boolean {
  if (!p.slide) return false;
  const v = DIR_VEC[p.slide.dir];
  const tx = p.x + v.dx;
  const ty = p.y + v.dy;
  if (p.slide.remaining <= 0 || !canPlayerEnter(state, tx, ty)) {
    p.slide = null;
    return false;
  }
  p.slide.remaining--;
  p.facing = p.slide.dir;
  beginStep(p, tx, ty, playerStepTicks(state, p));
  if (p.slide.remaining <= 0) p.slide = null;
  return true;
}
