/**
 * State-driven loops: the generator putt-putt/rattle that builds as a fuse burns down, and the
 * engine bed of vehicles that are driving. Derived purely from GameState each update; the
 * LoopSet creates, retunes and fades the actual looping voices.
 */
import type { GameState, VehicleKind } from '../sim';
import type { LoopSet } from './loops';

const MAX_GEN_RUN = 3;
const MAX_GEN_RATTLE = 2;
const MAX_VEHICLE_ENGINES = 2;
const RANK = [1, 0.75, 0.55] as const;
const ENGINE_GAIN: Record<VehicleKind, number> = { danfo: 0.9, taxi: 0.75, keke: 0.8 };

const smooth = (v: number): number => {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};

/** Distance falloff relative to the human player (kept gentle: far things stay audible). */
function falloff(state: Readonly<GameState>, x: number, y: number): number {
  const me = state.players.find((p) => !p.isBot && p.alive);
  if (!me) return 1;
  return 1 / (1 + 0.09 * Math.hypot(me.x - x, me.y - y));
}

export function updateStateLoops(
  loops: LoopSet,
  state: Readonly<GameState>,
  panFor: (x: number) => number,
): void {
  loops.begin();
  const fuse = state.config.generator.fuseTicks;

  const burning = state.generators
    .filter((g) => g.mode === 'timed' && g.timer > 0)
    .sort((a, b) => a.timer - b.timer);
  burning.slice(0, MAX_GEN_RUN).forEach((g, rank) => {
    const u = 1 - Math.min(1, g.timer / fuse);
    const near = RANK[rank]! * falloff(state, g.x, g.y);
    const pan = panFor(g.x);
    loops.set(`gen:${g.id}:run`, 'gen_run_loop', {
      gain: (0.22 + 0.7 * Math.pow(u, 1.3)) * near,
      rate: 1 + 0.8 * Math.pow(u, 1.4),
      pan,
    });
    if (rank < MAX_GEN_RATTLE && u > 0.6) {
      loops.set(`gen:${g.id}:rattle`, 'gen_rattle_loop', {
        gain: smooth((u - 0.6) / 0.35) * 0.8 * near,
        rate: 1 + 0.3 * u,
        pan,
      });
    }
  });

  state.vehicles
    .filter((v) => v.phase === 'driving')
    .sort((a, b) => a.id - b.id)
    .slice(0, MAX_VEHICLE_ENGINES)
    .forEach((v) => {
      const at = v.route[Math.min(v.index, v.route.length - 1)];
      if (!at) return;
      loops.set(`veh:${v.id}`, `${v.kind}_engine_loop`, {
        gain: ENGINE_GAIN[v.kind] * Math.max(0.6, falloff(state, at.x, at.y) * 1.6),
        rate: v.slowUntil > state.tick ? 0.82 : 1,
        pan: panFor(at.x),
      });
    });

  loops.end();
}
