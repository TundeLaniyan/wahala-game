/**
 * The practice engine: an ordered list of tasks checked against the REAL simulation after every tick
 * (state, events and the intents that were applied). It never moves anything itself: the human plays,
 * the session only watches, explains and, after a failure, hands back the state saved at the latest
 * checkpoint so the attempt can be retried (unlimited retries).
 */
import { DIRS, DIR_VEC, Tile, previewBlast } from '../sim';
import type { EliminationCause, GameState, PickupKind, SimEvent, TilePos } from '../sim';
import type { Detector, Failure, Mistake, PracticeContext, PracticeDef, TaskDef } from './types';

export type PracticeSignal =
  | { kind: 'taskDone'; index: number; praise: string | null }
  | { kind: 'guidance'; text: string; mistake: string }
  | { kind: 'failed'; text: string; reason: string }
  | { kind: 'respawned'; text: string }
  | { kind: 'complete' };

/** The same tip is not repeated sooner than this (ticks). */
const TIP_COOLDOWN = 150;

interface ArmedTask {
  done: (ctx: PracticeContext) => boolean;
  mistakes: { def: Mistake; test: (ctx: PracticeContext) => string | null; last: number }[];
  failures: { def: Failure; test: (ctx: PracticeContext) => string | null }[];
}

export class PracticeSession {
  /** Index of the active task (== tasks.length once complete). */
  index = 0;
  readonly done: boolean[];
  /** Latest corrective tip (null after a task is done). */
  guidance: string | null = null;
  /** Number of retries so far (failures). */
  attempts = 0;
  /** Every tip and failure shown, in order (tests and debugging). */
  readonly log: string[] = [];
  /** Set when the attempt failed; cleared by `restore()`. */
  failure: { text: string; reason: string } | null = null;
  private armed: ArmedTask | null = null;
  private checkpoint: { index: number; state: GameState } | null = null;
  private wasAlive = true;

  constructor(
    readonly def: PracticeDef,
    readonly localId = 0,
  ) {
    this.done = def.tasks.map(() => false);
  }

  get tasks(): readonly TaskDef[] {
    return this.def.tasks;
  }

  get complete(): boolean {
    return this.index >= this.def.tasks.length;
  }

  get current(): TaskDef | null {
    return this.def.tasks[this.index] ?? null;
  }

  /** Call once with the freshly built practice state (it becomes the first checkpoint). */
  begin(state: GameState): void {
    this.checkpoint = { index: 0, state: structuredClone(state) };
    this.index = 0;
    this.done.fill(false);
    this.failure = null;
    this.guidance = null;
    this.wasAlive = state.players[this.localId]?.alive ?? true;
    this.arm();
  }

  /** The state to retry from (a fresh copy of the latest checkpoint); resets the tasks after it. */
  restore(): GameState {
    const cp = this.checkpoint!;
    this.index = cp.index;
    for (let i = cp.index; i < this.done.length; i++) this.done[i] = false;
    this.failure = null;
    this.attempts++;
    this.wasAlive = true;
    this.arm();
    return structuredClone(cp.state);
  }

  /** Floor markers for the active task. */
  markers(state: GameState): TilePos[] {
    return this.current?.markers?.(state, this.localId) ?? [];
  }

  update(ctx: PracticeContext): PracticeSignal[] {
    const out: PracticeSignal[] = [];
    if (this.complete || this.failure || !this.armed) return out;
    const me = ctx.state.players[this.localId];
    const caught = !!me && !me.alive && this.wasAlive;
    this.wasAlive = !!me?.alive;
    const retry = (this.def.onCaught ?? 'retry') === 'retry';

    // being caught ends the attempt (unless this practice is about respawning)
    if (caught && retry) return this.fail(out, caughtText(me!.elimination, this.localId), 'caught');

    // the active task: done?
    const armed = this.armed;
    if (armed.done(ctx)) {
      const task = this.current!;
      this.done[this.index] = true;
      this.index++;
      this.guidance = null;
      out.push({ kind: 'taskDone', index: this.index - 1, praise: task.praise ?? null });
      if (this.complete) {
        out.push({ kind: 'complete' });
        this.armed = null;
        return out;
      }
      if (this.current!.checkpoint)
        this.checkpoint = { index: this.index, state: structuredClone(ctx.state) };
      this.arm();
      return out;
    }

    if (caught) {
      const text = 'Caught! In this mode you come back after a short wait, with spawn protection.';
      this.guidance = text;
      this.log.push(text);
      out.push({ kind: 'respawned', text });
    }
    if (ctx.state.match.phase === 'ended')
      return this.fail(out, 'That round is over. Let us try again.', 'ended');
    for (const f of armed.failures) {
      const text = f.test(ctx);
      if (text) return this.fail(out, text, f.def.id);
    }
    for (const m of armed.mistakes) {
      const text = m.test(ctx);
      if (!text || ctx.state.tick - m.last < TIP_COOLDOWN) continue;
      m.last = ctx.state.tick;
      this.guidance = text;
      this.log.push(text);
      out.push({ kind: 'guidance', text, mistake: m.def.id });
      break;
    }
    return out;
  }

  private fail(out: PracticeSignal[], text: string, reason: string): PracticeSignal[] {
    this.failure = { text, reason };
    this.guidance = text;
    this.log.push(text);
    out.push({ kind: 'failed', text, reason });
    return out;
  }

  private arm(): void {
    const task = this.current;
    if (!task) {
      this.armed = null;
      return;
    }
    const mistakes = [...(task.mistakes ?? []), ...(task.noLaneTip ? [] : [IN_OWN_LANE])];
    this.armed = {
      done: task.done.create(),
      mistakes: mistakes.map((def) => ({ def, test: def.create(), last: -1e9 })),
      failures: (task.failures ?? []).map((def) => ({ def, test: def.create() })),
    };
  }
}

function caughtText(cause: EliminationCause | null, localId: number): string {
  switch (cause?.kind) {
    case 'flame':
      return cause.ownerId === localId
        ? 'Caught in your own blast! The red tiles show where the fire will go: get out of its lines. Try again.'
        : 'Caught in a blast! Keep out of the red lanes. Try again.';
    case 'vehicle':
      return 'Hit by a vehicle! Keep off its flashing lane. Try again.';
    case 'crush':
      return 'Crushed by the closing walls! Step off a flashing tile at once. Try again.';
    default:
      return 'Caught! Try again.';
  }
}

// ------------------------------------------------------------------ reusable detectors

const me = (ctx: PracticeContext) => ctx.state.players[ctx.localId]!;

/** Passes once `count` matching events have been seen (since the task started). */
export function onEvent<T extends SimEvent['type']>(
  type: T,
  match: (e: Extract<SimEvent, { type: T }>, ctx: PracticeContext) => boolean = () => true,
  count = 1,
): Detector {
  return {
    create: () => {
      let n = 0;
      return (ctx) => {
        for (const e of ctx.events)
          if (e.type === type && match(e as Extract<SimEvent, { type: T }>, ctx)) n++;
        return n >= count;
      };
    },
  };
}

export function when(test: (ctx: PracticeContext) => boolean): Detector {
  return { create: () => test };
}

/** The human stands on (has committed a step onto) this tile. */
export const reach = (x: number, y: number): Detector =>
  when((ctx) => me(ctx).alive && me(ctx).x === x && me(ctx).y === y);

export const collect = (kind: PickupKind): Detector =>
  onEvent('pickupCollected', (e, c) => e.playerId === c.localId && e.kind === kind);

export const placed = (): Detector => onEvent('generatorPlaced', (e, c) => e.ownerId === c.localId);

/** One of the human's generators exploded this tick and the human is still standing. */
export const survivedOwnBlast = (): Detector =>
  when(
    (ctx) =>
      me(ctx).alive && ctx.events.some((e) => e.type === 'generatorExploded' && e.ownerId === ctx.localId),
  );

/** Someone else went down with the human credited (fire, vehicle or any), the human still standing. */
export const eliminatedBy = (
  kind: 'flame' | 'vehicle' | 'any',
  victim: (id: number) => boolean = () => true,
): Detector =>
  when(
    (ctx) =>
      me(ctx).alive &&
      ctx.events.some(
        (e) =>
          e.type === 'playerEliminated' &&
          e.playerId !== ctx.localId &&
          victim(e.playerId) &&
          e.creditId === ctx.localId &&
          (kind === 'any' || e.cause.kind === kind),
      ),
  );

// ------------------------------------------------------------------ common mistakes

/** A mistake whose tip is always the same text. */
export function tip(id: string, text: string, test: (ctx: PracticeContext) => boolean): Mistake {
  return { id, create: () => (ctx) => (test(ctx) ? text : null) };
}

/** A failure with a fixed explanation. */
export function failWhen(id: string, text: string, test: (ctx: PracticeContext) => boolean): Failure {
  return { id, create: () => (ctx) => (test(ctx) ? text : null) };
}

/** Tiles of the human's own timed generators that are about to blow (the red danger lanes). */
export function ownDangerTiles(state: GameState, localId: number, withinTicks = 75): Set<number> {
  const out = new Set<number>();
  for (const g of state.generators) {
    if (g.ownerId !== localId || g.mode !== 'timed' || g.flight || g.carriedBy !== null) continue;
    if (g.timer > withinTicks) continue;
    for (const t of previewBlast(state, g)) out.add(t);
  }
  return out;
}

/** Standing in your own blast lane with the fuse nearly out. */
export const IN_OWN_LANE: Mistake = tip(
  'own-lane',
  'You are on a red tile! Get off the red tiles before it blows.',
  (ctx) => {
    const p = me(ctx);
    return p.alive && ownDangerTiles(ctx.state, ctx.localId, 60).has(p.y * ctx.state.width + p.x);
  },
);

/** Button B was tapped but did nothing (no opponent next to the player, and nothing else to do). */
export const whiffedB = (text: string): Mistake =>
  tip(
    'b-whiff',
    text,
    (ctx) =>
      !!ctx.intents[ctx.localId]?.special &&
      !ctx.events.some((e) => e.type === 'specialUsed' && e.playerId === ctx.localId),
  );

/** Button A was pressed but no generator went down (e.g. already at the limit). */
export const placeRefused = (text: string): Mistake =>
  tip(
    'a-refused',
    text,
    (ctx) =>
      !!ctx.intents[ctx.localId]?.place &&
      !ctx.events.some((e) => e.type === 'generatorPlaced' && e.ownerId === ctx.localId),
  );

/** The human keeps walking away from a target tile (by path distance through the open lanes). */
export function wrongWay(target: TilePos): Mistake {
  return {
    id: 'wrong-way',
    create: () => {
      let best = Infinity;
      let lastTile = -1;
      let worse = 0;
      return (ctx) => {
        const p = me(ctx);
        if (lastTile < 0) {
          // first look: count from where the current step began (the move may already be under way)
          best = pathDistance(ctx.state, { x: p.stepFromX, y: p.stepFromY }, target);
          lastTile = p.stepFromY * ctx.state.width + p.stepFromX;
        }
        const tile = p.y * ctx.state.width + p.x;
        if (!p.alive || tile === lastTile) return null;
        lastTile = tile;
        const d = pathDistance(ctx.state, p, target);
        if (d < best) {
          best = d;
          worse = 0;
          return null;
        }
        if (d > best) worse++;
        if (worse < 2) return null;
        worse = 0;
        best = d;
        return `Wrong way! The glowing marker is ${directionWords(p, target)}.`;
      };
    },
  };
}

export function directionWords(from: TilePos, to: TilePos): string {
  const parts: string[] = [];
  if (to.y < from.y) parts.push('up');
  if (to.y > from.y) parts.push('down');
  if (to.x > from.x) parts.push('to the right');
  if (to.x < from.x) parts.push('to the left');
  return parts.length === 0 ? 'right here' : parts.join(' and ');
}

/** Steps along open tiles (no concrete, crates or grounded generators) from `a` to `b`; Infinity if cut off. */
export function pathDistance(state: GameState, a: TilePos, b: TilePos): number {
  const w = state.width;
  const goal = b.y * w + b.x;
  const start = a.y * w + a.x;
  if (start === goal) return 0;
  const blocked = new Set<number>();
  for (const g of state.generators) if (g.carriedBy === null && !g.flight) blocked.add(g.y * w + g.x);
  const dist = new Map<number, number>([[start, 0]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const d of DIRS) {
      const nx = cx + DIR_VEC[d].dx;
      const ny = cy + DIR_VEC[d].dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= state.height) continue;
      const i = ny * w + nx;
      if (dist.has(i) || state.tiles[i] !== Tile.Empty || (blocked.has(i) && i !== goal)) continue;
      dist.set(i, dist.get(cur)! + 1);
      if (i === goal) return dist.get(i)!;
      queue.push(i);
    }
  }
  return Infinity;
}
