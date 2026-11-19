/**
 * An eliminated bot on the sideline lane (sim/systems/spectators.ts). Deliberately simple and weaker than a
 * human spectator: it walks the lane to the south-row tile in line with the living player nearest to it,
 * but always off by a tile or two (never a perfectly pre-aimed throw), and it waits `BOT_EXTRA_WAIT` on
 * top of the rule's cooldown before throwing. Levels without `sideline` (Rookie, Beginner) stay passive.
 * Same Intent and same rules as a human spectator; it reads only the Observation.
 */
import { canThrow, spectatorLane, spectatorLanding } from '../sim';
import type { Dir, Intent, Observation } from '../sim';
import type { AiProfile } from './profiles';

/** Extra wait after the cooldown before a bot spectator throws (ticks). */
export const BOT_EXTRA_WAIT = 6 * 60;
/** Aim offsets (tiles along the south row) cycled per throw: never zero. */
const WOBBLE = [1, -1, 2, -1, 1, -2];

export class Sideline {
  private throws = 0;

  decide(obs: Observation, profile: AiProfile): Intent {
    const me = obs.players[obs.selfId];
    const s = me?.spectator;
    if (!me || !s || me.alive || !profile.sideline || obs.match.phase !== 'playing') return {};
    const lane = spectatorLane(obs);
    const here = lane[s.pos]!;
    let target: (typeof obs.players)[number] | null = null;
    let best = Infinity;
    for (const p of obs.players) {
      if (!p.alive) continue;
      const d = Math.abs(p.x - here.x) + Math.abs(p.y - here.y);
      if (d < best) {
        best = d;
        target = p;
      }
    }
    if (!target) return {};
    const x = Math.max(0, Math.min(obs.width - 1, target.x + WOBBLE[this.throws % WOBBLE.length]!));
    const desired = obs.height + 1 + x; // west column (height tiles), the corner, then the south row
    if (s.pos !== desired) {
      const next = lane[s.pos + Math.sign(desired - s.pos)]!;
      return { move: dirTo(here.x, here.y, next.x, next.y) };
    }
    if (obs.tick < s.readyTick + BOT_EXTRA_WAIT || !canThrow(obs, me) || !spectatorLanding(obs, s.pos)) return {};
    this.throws++;
    return { place: true };
  }
}

function dirTo(x0: number, y0: number, x1: number, y1: number): Dir {
  if (x1 > x0) return 'right';
  if (x1 < x0) return 'left';
  return y1 > y0 ? 'down' : 'up';
}
