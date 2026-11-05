import { missionView, tick } from '../src/sim';
import type { GameState, Intent, RaidOutcome, SimEvent } from '../src/sim';
import type { RaidId } from '../src/sim';
import { dangerTiles, firstStep, newMission } from './mission-helpers';

/** A section field mission ready to play (crates cleared, stage hazards off, playing). */
export function newField(
  fieldId: string,
  o: { seed?: number; lives?: number; stage?: boolean } = {},
): GameState {
  const district = fieldId.split('.')[0] as never;
  return newMission({ id: district, fieldId, ...(o.lives ? { lives: o.lives } : {}) }, o);
}

export function raidOutcome(raidId: RaidId, o: Partial<RaidOutcome> = {}): RaidOutcome {
  return {
    raidId,
    result: 'completed',
    seconds: 40,
    optionalRoomsOpened: 0,
    optionalRoomsTotal: 1,
    cargoDestroyed: 3,
    cargoTotal: 3,
    hpLeft: 3,
    livesUsed: 0,
    stars: 2,
    ...o,
  };
}

/**
 * A scripted human for field missions: walks (ordinary intents only) to the nearest live node of the mission view,
 * never onto a telegraphed or burning tile, and holds still on it. `blocked` node ids are skipped (to test a leg order).
 */
export class FieldWalker {
  constructor(private readonly skip: ReadonlySet<string> = new Set()) {}

  decide(state: GameState): Intent {
    const me = state.players[0]!;
    const view = missionView(state);
    if (!me.alive || !view || view.pendingRaid) return {};
    const danger = dangerTiles(state);
    const goals = new Set(
      view.nodes
        .filter((n) => n.state !== 'done' && n.state !== 'locked' && !this.skip.has(n.id))
        .map((n) => n.y * state.width + n.x),
    );
    if (goals.size === 0 || goals.has(me.y * state.width + me.x)) return {};
    const dir = firstStep(state, me.x, me.y, (x, y) => goals.has(y * state.width + x), danger);
    return dir ? { move: dir } : {};
  }
}

export interface WalkResult {
  events: SimEvent[];
  ticks: number;
}

/**
 * Plays the walker until `stop` says so, the match ends or `max` ticks pass. `onRaid` answers a raised raid request
 * (it is called once per request, between ticks, exactly like the app does).
 */
export function walkField(
  state: GameState,
  max: number,
  o: {
    onRaid?: (state: GameState, events: SimEvent[]) => void;
    stop?: (state: GameState) => boolean;
    walker?: FieldWalker;
  } = {},
): WalkResult {
  const walker = o.walker ?? new FieldWalker();
  const events: SimEvent[] = [];
  let n = 0;
  for (; n < max && state.match.phase !== 'ended'; n++) {
    if (state.mission?.pendingRaid) {
      o.onRaid?.(state, events);
      if (state.mission?.pendingRaid) break; // unanswered: the field waits
    }
    events.push(...tick(state, { 0: walker.decide(state) }));
    if (o.stop?.(state)) break;
  }
  return { events, ticks: n };
}
