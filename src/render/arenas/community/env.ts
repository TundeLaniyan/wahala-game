/**
 * The living environment of a researched community, as data derived from the arena's own layout: ambient loops of
 * vehicles on the roads beyond every road mouth (in one lane pair, out the other; never on the board), plus the
 * arena's crowds, practical lights and audio identity. Ambient vehicles are presentation only (never gameplay
 * entities, never on the board, never wearing a hazard or attack-vehicle look); `validateEnvironment` checks it.
 */
import { getArena } from '../../../sim';
import type {
  AmbientVehicleKind,
  BoardSize,
  CrowdZoneDef,
  LightPocket,
  StageEnvironment,
  TrafficRouteDef,
} from '../../env/types';

export interface EnvSpec {
  seed: number;
  /** mix of ambient vehicles on the approach roads */
  kinds: readonly AmbientVehicleKind[];
  /** vehicles per lane pair at full quality, and cruising speed (tiles / s) */
  count?: number;
  speed?: number;
  /** extra routes (elevated rail / expressway decks, ring roads) */
  routes?: readonly TrafficRouteDef[];
  crowds: readonly CrowdZoneDef[];
  lights: readonly LightPocket[];
  beds: readonly string[];
  boost?: StageEnvironment['boost'];
  cutaway?: readonly { x0: number; y0: number; x1: number; y1: number }[];
  budget?: StageEnvironment['budget'];
}

/** One in / out route pair per road mouth (a mouth is a run of road tiles on the board's edge). */
function mouthRoutes(arenaId: string, o: EnvSpec): TrafficRouteDef[] {
  const layout = getArena(arenaId).layout;
  const H = layout.length;
  const W = layout[0]!.length;
  const out: TrafficRouteDef[] = [];
  const runs = (n: number, road: (i: number) => boolean): [number, number][] => {
    const r: [number, number][] = [];
    let s = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && road(i);
      if (on && s < 0) s = i;
      if (!on && s >= 0) {
        r.push([s, i - 1]);
        s = -1;
      }
    }
    return r;
  };
  const count = o.count ?? 3;
  const speed = o.speed ?? 3.4;
  let n = 0;
  const add = (edge: 'W' | 'E' | 'N' | 'S', from: number, to: number): void => {
    // right-hand traffic: half the lanes come in, half go out
    const mid = (from + to + 1) / 2;
    const inLane = edge === 'W' || edge === 'N' ? mid + (to - mid + 1) / 2 : mid - (mid - from) / 2;
    const outLane = edge === 'W' || edge === 'N' ? mid - (mid - from) / 2 : mid + (to - mid + 1) / 2;
    const far = 42;
    const near = 1.8;
    const route = (id: string, a: [number, number], b: [number, number], k: number): TrafficRouteDef => ({
      id,
      kinds: o.kinds.slice(k % o.kinds.length).concat(o.kinds.slice(0, k % o.kinds.length)),
      path: [a, b],
      count,
      speed,
      spacing: 4.2,
      priority: 2,
      fade: 2.2,
    });
    const id = `${edge}${from}`;
    if (edge === 'W') {
      out.push(route(`${id}in`, [-far, inLane], [-near, inLane], n++));
      out.push(route(`${id}out`, [-near, outLane], [-far, outLane], n++));
    } else if (edge === 'E') {
      out.push(route(`${id}in`, [W + far, inLane], [W + near, inLane], n++));
      out.push(route(`${id}out`, [W + near, outLane], [W + far, outLane], n++));
    } else if (edge === 'N') {
      out.push(route(`${id}in`, [inLane, -far], [inLane, -near], n++));
      out.push(route(`${id}out`, [outLane, -near], [outLane, -far], n++));
    }
    // the south (camera) side carries no ambient vehicles: it stays low and clear
  };
  for (const [a, b] of runs(H, (y) => layout[y]![0] === '=')) add('W', a, b);
  for (const [a, b] of runs(H, (y) => layout[y]![W - 1] === '=')) add('E', a, b);
  for (const [a, b] of runs(W, (x) => layout[0]![x] === '=')) add('N', a, b);
  return out;
}

export function communityEnv(arenaId: string, board: BoardSize, o: EnvSpec): StageEnvironment {
  void board;
  return {
    id: arenaId,
    seed: o.seed,
    traffic: [...mouthRoutes(arenaId, o), ...(o.routes ?? [])],
    crowds: o.crowds,
    reactions: {
      blast: { reaction: 'duck', radius: 7, chance: 0.5, minRange: 3 },
      elimination: { reaction: 'cheer', radius: 14, chance: 0.4 },
      stage: { reaction: 'look', radius: 12, chance: 0.5 },
    },
    lights: o.lights,
    audio: {
      beds: o.beds,
      reactions: [
        { on: 'blast', sound: 'crowd_ooh' },
        { on: 'elimination', sound: 'crowd_gasp' },
      ],
    },
    occlusion: o.cutaway ? { cutaway: o.cutaway } : undefined,
    boost: o.boost,
    budget: o.budget,
  };
}
