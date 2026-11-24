/**
 * Footsteps, derived from the simulation's state (presentation only: the sim has no footstep event, and no rule lives
 * here). A fighter starting a new step (its `stepFromX/Y` changes) makes one step sound.
 *
 * Budget for 32-fighter City Rumble: the human always steps; other fighters only when close to the human, at most
 * MAX_OTHERS per update, quieter with distance; a boss walks heavier and is always heard. Mounted, sliding, dazed,
 * eliminated and teleporting fighters make no step. The same fighter never steps faster than MIN_GAP.
 */
import type { GameState, Player } from '../sim';
import type { Mixer } from './mixer';

export const MAX_OTHERS = 4;
const MIN_GAP = 0.09;
const RUN_GAP = 0.2;
const HEAR_RANGE = 9;

export interface Footsteps {
  update(state: Readonly<GameState>, now: number, panFor: (x: number) => number): void;
  reset(): void;
}

interface Seen {
  sx: number;
  sy: number;
  at: number;
  last: number;
}

export function createFootsteps(mixer: Mixer, rand: () => number): Footsteps {
  const seen = new Map<number, Seen>();
  let flip = 1;
  return {
    reset: () => seen.clear(),
    update(state, now, panFor) {
      const me = state.players.find((p) => !p.isBot && p.alive);
      const bossId = state.mission?.boss.maxHits !== undefined ? state.mission.bossId : -1;
      const others: { p: Player; d: number }[] = [];
      for (const p of state.players) {
        const s = seen.get(p.id);
        if (!s) {
          seen.set(p.id, { sx: p.stepFromX, sy: p.stepFromY, at: now, last: -1 });
          continue;
        }
        const started = p.stepFromX !== s.sx || p.stepFromY !== s.sy;
        const jump = Math.abs(p.stepFromX - s.sx) + Math.abs(p.stepFromY - s.sy) > 2; // a teleport, not a step
        const dt = now - s.at;
        s.sx = p.stepFromX;
        s.sy = p.stepFromY;
        if (
          !started ||
          jump ||
          !p.alive ||
          p.mounted ||
          p.slide !== null ||
          p.dazedUntil > state.match.playTicks
        )
          continue;
        if (now - s.last < MIN_GAP) continue;
        const d = me ? Math.hypot(me.x - p.x, me.y - p.y) : 0;
        if (p === me || p.id === bossId) {
          const running = dt < RUN_GAP;
          flip = -flip;
          if (p.id === bossId) {
            mixer.play('step_heavy', {
              pan: panFor(p.x),
              gain: 0.8 / (1 + 0.04 * d),
              rate: 0.95 + rand() * 0.1,
            });
          } else {
            mixer.play('step_ground', {
              pan: flip * 0.06,
              gain: running ? 0.85 : 0.6,
              rate: (running ? 1.12 : 1) * (0.95 + rand() * 0.1),
            });
          }
          s.last = now;
          s.at = now;
        } else if (d <= HEAR_RANGE) others.push({ p, d });
        else s.at = now;
      }
      others.sort((a, b) => a.d - b.d);
      for (const { p, d } of others.slice(0, MAX_OTHERS)) {
        const s = seen.get(p.id)!;
        mixer.play('step_ground', {
          pan: panFor(p.x),
          gain: 0.4 / (1 + 0.35 * d),
          rate: 0.9 + rand() * 0.2,
        });
        s.last = now;
        s.at = now;
      }
    },
  };
}
