/**
 * Spectator arena events (offline: driven by the seeded simulation, not real spectators).
 * Every throw is telegraphed for several seconds at a fixed tile. A bottle dazes; a rare
 * firecracker is lethal to everyone on its tile and the four tiles around it.
 */
import { DIRS, DIR_VEC, tileAt } from '../grid';
import { nextFloat, nextInt } from '../rng';
import { Tile } from '../types';
import type { GameState, SimEvent } from '../types';
import { alivePlayers } from './queries';
import type { LethalHit } from './lethality';

export function updateCrowd(state: GameState, hits: LethalHit[], events: SimEvent[]): void {
  const crowd = state.crowd;
  if (!crowd) return;
  const cfg = state.config.crowd;

  if (state.match.playTicks >= crowd.nextThrowTick) {
    const targets = alivePlayers(state);
    if (targets.length > 0) {
      const target = targets[nextInt(state, targets.length)]!;
      const kind = nextFloat(state) < cfg.firecrackerChance ? 'firecracker' : 'bottle';
      const t = {
        id: state.nextId++,
        x: target.x,
        y: target.y,
        kind,
        landTick: state.tick + cfg.warnTicks,
      } as const;
      crowd.throws.push({ ...t });
      events.push({ type: 'crowdWarning', throwId: t.id, x: t.x, y: t.y, kind, landTick: t.landTick });
    }
    crowd.nextThrowTick =
      state.match.playTicks +
      cfg.minIntervalTicks +
      nextInt(state, cfg.maxIntervalTicks - cfg.minIntervalTicks + 1);
  }

  for (const t of [...crowd.throws]) {
    if (state.tick < t.landTick) continue;
    crowd.throws.splice(crowd.throws.indexOf(t), 1);
    events.push({ type: 'crowdLanded', throwId: t.id, x: t.x, y: t.y, kind: t.kind });
    const area = [{ x: t.x, y: t.y }];
    if (t.kind === 'firecracker') {
      for (const d of DIRS) area.push({ x: t.x + DIR_VEC[d].dx, y: t.y + DIR_VEC[d].dy });
    }
    const eventId = state.nextEventId++;
    for (const g of state.generators) {
      if (
        g.carriedBy === null &&
        g.flight === null &&
        area.some((a) => a.x === g.x && a.y === g.y) &&
        t.kind === 'firecracker'
      )
        g.triggered = true;
    }
    for (const p of state.players) {
      if (!p.alive || !area.some((a) => a.x === p.x && a.y === p.y) || tileAt(state, p.x, p.y) !== Tile.Empty)
        continue;
      if (t.kind === 'bottle') {
        if (state.tick < p.dazeImmuneUntil || p.x !== t.x || p.y !== t.y) continue;
        p.dazedUntil = state.tick + cfg.bottleDazeTicks;
        p.dazeImmuneUntil = p.dazedUntil + state.config.skills.dazeImmunityTicks;
        p.entryUntil = null;
        events.push({ type: 'playerDazed', playerId: p.id, byId: null });
      } else {
        hits.push({
          playerId: p.id,
          eventId,
          cause: { kind: 'crowd', eventId },
          graceUntil: state.tick + state.config.okada.graceTicks,
        });
      }
    }
  }
}
