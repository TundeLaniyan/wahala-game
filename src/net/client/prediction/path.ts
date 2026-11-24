/**
 * The predicted path of the local fighter: the sim's OWN movement rules (`updateMovement`, which calls `canPlayerEnter`,
 * `playerStepTicks`, `isActing`, `tryContact` ...; then `armTeleports`) replayed tick by tick from the replica's
 * authoritative local player, with the input the server is estimated to apply at each tick (`latch.ts`).
 *
 * The replay runs on a PRIVATE view: a shallow copy of the state whose `players` is `[a deep copy of the local player]` and
 * whose `generators` are copies (walking into a generator runs the contact ability, which mutates the generator). The
 * board (tiles, stage, config, match) is shared read-only; nothing the movement system writes can reach the replica
 * (tests/net/prediction.test.ts hashes the replica before and after). Other fighters, flames and blasts are not predicted.
 */
import type { GameState, Player, SimEvent } from '../../../sim';
import { updateMovement } from '../../../sim/systems/movement';
import { armTeleports } from '../../../sim/systems/stage';
import { suddenDeathHoldsInput } from '../../../sim/systems/suddenDeath';
import type { StepFields, Vec } from './drawn';
import { drawnPosition, pickStep } from './drawn';
import type { Latch, SentMove } from './latch';
import { afterStep, cloneLatch, moveFor, receive } from './latch';

/** Snapshots of the predicted local fighter at ticks `base`, `base + 1`, ... (`snaps[0]` is the authoritative state). */
export interface Path {
  base: number;
  snaps: StepFields[];
}

/**
 * Why the prediction must not run ahead right now (the fighter is then drawn where the server says). These are moves the
 * client cannot foresee or that other systems drive: an oil slide, a manhole trip, a vehicle entrance, inverted controls,
 * the SUDDEN DEATH title card, a daze / knockdown, an attack's planted wind-up or recoil.
 */
export type HoldReason =
  'slide' | 'teleport' | 'entry' | 'inverted' | 'suddenDeath' | 'dazed' | 'rooted' | 'attack';

export function holdReason(state: GameState, p: Readonly<Player>): HoldReason | null {
  const next = state.tick + 1; // the step the server runs next
  if (p.slide) return 'slide';
  if (p.teleportPending) return 'teleport';
  if (p.entryUntil !== null) return 'entry';
  if (p.curse?.kind === 'inverted' && next < p.curse.until) return 'inverted';
  if (next < p.dazedUntil || next < p.knockedUntil) return 'dazed';
  if (next < p.rootedUntil) return 'rooted';
  if (p.attack) return 'attack';
  if (suddenDeathHoldsInput(state)) return 'suddenDeath';
  return null;
}

/** The authoritative local player alone, as a one-snapshot path (a hold). */
export function standPath(tick: number, p: Readonly<StepFields>): Path {
  return { base: tick, snaps: [pickStep(p)] };
}

/**
 * Replays ticks `state.tick + 1 .. endTick` for the player `auth` (the replica's authoritative object, only READ).
 * `latch` is the server's latch state as of `state.tick` (also only read), `pending` the messages the server has not
 * received by then, in send order. Stops early when the fighter steps onto a manhole or starts sliding: from there on the
 * server decides.
 */
export function replayPath(
  state: GameState,
  auth: Readonly<Player>,
  latch: Readonly<Latch>,
  pending: readonly SentMove[],
  endTick: number,
): Path {
  const me = structuredClone(auth) as Player;
  const view: GameState = {
    ...state,
    players: [me],
    generators: state.generators.map((g) => ({ ...g })),
  };
  const l = cloneLatch(latch);
  const snaps: StepFields[] = [pickStep(me)];
  const events: SimEvent[] = [];
  let next = 0;
  for (let t = state.tick + 1; t <= endTick; t++) {
    while (next < pending.length && pending[next]!.r <= t - 1) receive(l, pending[next++]!);
    view.tick = t - 1;
    const heldBack = suddenDeathHoldsInput(view);
    const move = moveFor(l, t - 1);
    view.tick = t;
    const bx = me.x;
    const by = me.y;
    updateMovement(view, heldBack ? {} : { [me.id]: { move } }, events);
    armTeleports(view);
    afterStep(l, me.x !== bx || me.y !== by, me.alive);
    snaps.push(pickStep(me));
    events.length = 0;
    if (me.teleportPending || me.slide) break;
  }
  return { base: state.tick, snaps };
}

function indexAt(path: Path, t: number): number {
  return Math.min(path.snaps.length - 1, Math.max(0, Math.floor(t) - path.base));
}

/**
 * The drawn position at continuous tick `t` (tick + interpolation fraction, as the renderer draws a state with its alpha).
 * Outside the path the nearest snapshot is extrapolated within its own step and then held.
 */
export function evalPath(path: Path, t: number): Vec {
  const i = indexAt(path, t);
  return drawnPosition(path.snaps[i]!, t - (path.base + i));
}

/** The snapshot shown at continuous tick `t` (its logical tile and facing are what the overlay keeps). */
export function snapAt(path: Path, t: number): StepFields {
  return path.snaps[indexAt(path, t)]!;
}
