/**
 * LIGHT-BASED DETECTION of a night raid (decisions NL10-NL13, docs/CLASSIC_LIGHTING.md "P1b"). Pure, deterministic,
 * integer ticks; active only when `config.nightSight` is present (a raid whose data sets `lighting.detection`).
 *
 * For a CALM enemy (patrolling, holding its post, walking back: the territory's `calmNow`) it replaces the sight check
 * and the "close" check of `systems/territory.ts`:
 *
 *   sees    the fighter's tile is one of THIS enemy's own lit torch tiles (`lightCone` of `raid/light.ts`: the cone the
 *           renderer draws, occluded on the grid), AND the raid AI's person-sight rule (`enemySeesPerson`, calm cone,
 *           Bresenham line, bodies block) holds with a range one tile past the cone's reach (its tiles are measured
 *           along and across the facing, the sight range is Euclidean). An enemy without a torch never "sees" in the
 *           dark. If the enemy has a line of light to a lit tile of the fighter's own beam inside its calm view cone,
 *           its torch cone is `beamBonusTiles` longer.
 *   close   within `contactTiles` (Chebyshev 1): the only way a calm enemy notices the fighter in the dark. Hearing is
 *           the territory's own and unchanged.
 *   react   how many consecutive ticks of `sees` the alert needs: `reactNearTicks` at 1-2 tiles up to `reactFarTicks`
 *           at the cone's full reach. The territory resets the count when `sees` stops.
 *
 * Engaged enemies (alert, pursuing, investigating) are not asked: they keep the raid AI's all-round sight and memory.
 */
import { DIR_VEC } from '../grid';
import type { NightSightConfig } from '../config';
import { Tile } from '../types';
import type { GameState, Player } from '../types';
import { LIGHT_TUNING, carriesTorch, lightCone, lineOfLight, raidLighting, torchFacing } from '../raid/light';
import { enemySeesPerson, inViewCone } from './sight';

export interface NightNotice {
  sees: boolean;
  close: boolean;
  /** Consecutive ticks of `sees` the alert needs now. */
  reactTicks: number;
  /** The torch cone's reach this tick (tiles ahead), with the beam bonus when it applies. */
  reach: number;
  /** Did the enemy see a lit tile of the fighter's beam this tick? */
  beamSeen: boolean;
}

const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** The reaction ticks at Chebyshev distance `d` for a cone of `reach` tiles (linear, integer). */
export function nightReactTicks(cfg: NightSightConfig, d: number, reach: number): number {
  const span = Math.max(1, reach - 2);
  const k = Math.min(span, Math.max(0, d - 2));
  return cfg.reactNearTicks + Math.floor(((cfg.reactFarTicks - cfg.reactNearTicks) * k) / span);
}

/**
 * Does `guard` see a lit tile of `fighter`'s flashlight cone (not the personal radius) inside its calm view cone, with
 * a line of light to it? The beam is light the guard can see even where the fighter's body is out of its torch. Only lit
 * floor counts (the face of a wall the fighter shines into does not).
 */
export function seesFighterBeam(state: GameState, guard: Player, fighter: Player): boolean {
  const t = LIGHT_TUNING.player;
  const cone = new Uint8Array(state.width * state.height);
  lightCone(state, cone, fighter.x, fighter.y, fighter.facing, t.range, t.spread, false);
  const reach = t.range + LIGHT_TUNING.guard.range + 1;
  for (let i = 0; i < cone.length; i++) {
    // lit FLOOR of the beam (a wall it hits shows nothing the guard would not see anyway)
    if (cone[i]! < LIGHT_TUNING.lit || state.tiles[i] !== Tile.Empty) continue;
    const x = i % state.width;
    const y = (i - x) / state.width;
    if (chebyshev(guard, { x, y }) > reach) continue;
    if (!inViewCone(guard, x, y)) continue;
    if (lineOfLight(state, guard.x, guard.y, x, y)) return true;
  }
  return false;
}

/**
 * What a CALM enemy notices of the fighter by night this tick, or null when this match has no night detection (then
 * the territory keeps its own rules).
 */
export function nightNotice(state: GameState, guard: Player, fighter: Player): NightNotice | null {
  const cfg = state.config.nightSight;
  const lighting = cfg ? raidLighting(state) : null;
  if (!cfg || !lighting) return null;
  const d = chebyshev(guard, fighter);
  // decision CV1: contact in the dark is in front of it or at its side, never right behind it
  const ring = state.config.campaignTactics?.classicRaid?.nearRing;
  const close = d <= cfg.contactTiles && (!ring || inViewCone(guard, fighter.x, fighter.y, ring));
  const base = LIGHT_TUNING.guard.range;
  if (!carriesTorch(guard, lighting))
    return { sees: false, close, reactTicks: cfg.reactFarTicks, reach: 0, beamSeen: false };
  const beamSeen = seesFighterBeam(state, guard, fighter);
  const reach = base + (beamSeen ? cfg.beamBonusTiles : 0);
  const facing = torchFacing(guard);
  const v = DIR_VEC[facing];
  const ahead = (fighter.x - guard.x) * v.dx + (fighter.y - guard.y) * v.dy;
  let inTorch = false;
  if (ahead >= 1 && ahead <= reach) {
    const torch = new Uint8Array(state.width * state.height);
    lightCone(state, torch, guard.x, guard.y, facing, reach, LIGHT_TUNING.guard.spread, false);
    inTorch = torch[fighter.y * state.width + fighter.x]! >= LIGHT_TUNING.lit;
  }
  const sees = inTorch && enemySeesPerson(state, guard, fighter, { range: reach + 1, calm: true });
  return { sees, close, reactTicks: nightReactTicks(cfg, d, reach), reach, beamSeen };
}
