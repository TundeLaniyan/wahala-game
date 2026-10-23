/**
 * Deterministic script player for tutorial demos. Each tick it turns the current beat's actions into
 * the same `Intent`s a human or bot would send (plus vehicle-selector commands for the local player);
 * the real simulation does everything else. Same script + same starting state = same demo, always.
 */
import { DIR_VEC, readyToStep } from '../sim';
import type { Dir, GameState, Intent, Intents, SimEvent } from '../sim';
import type { Act, Beat, UiCommand, UntilTest } from './types';

/** Ticks of reading time for a caption: about 4 words a second plus a second to find it. */
export function readingTicks(caption: string): number {
  const words = caption.trim().split(/\s+/).length;
  return Math.round(60 * (1 + words * 0.26));
}

/** Live progress of one act. */
interface Running {
  act: Act;
  started: number;
  /** walk: steps still to take; wait: ticks left. */
  left: number;
  /** walk: position before the tick a step was requested (to confirm it began). */
  from: { x: number; y: number } | null;
  lastProgress: number;
  seen: SimEvent[];
}

const STALL_TICKS = 360;

export interface ScriptTick {
  intents: Intents;
  ui: UiCommand[];
}

export class ScriptRunner {
  private beat = -1;
  private beatStart = 0;
  private queues = new Map<number, Running[]>();
  /** Acts that hit their time limit (tests assert this stays empty). */
  readonly problems: string[] = [];

  constructor(private readonly beats: readonly Beat[]) {}

  get beatIndex(): number {
    return Math.max(0, Math.min(this.beat, this.beats.length - 1));
  }

  get beatCount(): number {
    return this.beats.length;
  }

  get done(): boolean {
    return this.beat >= this.beats.length;
  }

  get caption(): string {
    return this.beats[this.beatIndex]?.caption ?? '';
  }

  get step(): string | null {
    return this.beats[this.beatIndex]?.step ?? null;
  }

  /** Intents and selector commands for the coming tick. */
  beforeTick(state: GameState): ScriptTick {
    const out: ScriptTick = { intents: {}, ui: [] };
    if (this.beat < 0) this.enter(0, state);
    // a finished beat hands over to the next one within the same tick
    for (let guard = 0; guard < 4 && !this.done; guard++) {
      for (const [actor, queue] of this.queues) this.runActor(state, actor, queue, out);
      if (!this.beatFinished(state)) break;
      this.enter(this.beat + 1, state);
    }
    return out;
  }

  /** Feeds back what the tick did (step confirmation, events for `until`). */
  afterTick(state: GameState, events: readonly SimEvent[]): void {
    for (const [actor, queue] of this.queues) {
      const head = queue[0];
      if (!head) continue;
      head.seen.push(...events);
      if (head.act.kind === 'walk' && head.from) {
        const p = state.players[actor]!;
        const v = DIR_VEC[head.act.dir];
        if (p.x === head.from.x + v.dx && p.y === head.from.y + v.dy) {
          head.left--;
          head.lastProgress = state.tick;
        }
        head.from = null;
      }
    }
  }

  private enter(index: number, state: GameState): void {
    this.beat = index;
    this.beatStart = state.tick;
    this.queues = new Map();
    const beat = this.beats[index];
    if (!beat) return;
    for (const [id, acts] of Object.entries(beat.acts ?? {})) {
      this.queues.set(
        Number(id),
        acts.map((act) => ({
          act,
          started: -1,
          left: act.kind === 'walk' ? act.tiles : act.kind === 'wait' ? act.ticks : 0,
          from: null,
          lastProgress: state.tick,
          seen: [],
        })),
      );
    }
  }

  private beatFinished(state: GameState): boolean {
    const beat = this.beats[this.beat]!;
    const hold = beat.hold ?? readingTicks(beat.caption);
    if (state.tick - this.beatStart < hold) return false;
    return [...this.queues.values()].every((q) => q.length === 0);
  }

  /** Runs one actor's queue until an act emits input this tick or has to wait. */
  private runActor(state: GameState, actor: number, queue: Running[], out: ScriptTick): void {
    const p = state.players[actor];
    while (queue.length > 0) {
      const r = queue[0]!;
      if (r.started < 0) {
        r.started = state.tick;
        r.lastProgress = state.tick;
      }
      const act = r.act;
      if (!p || !p.alive) {
        // an eliminated actor simply stops acting
        queue.length = 0;
        return;
      }
      switch (act.kind) {
        case 'walk': {
          if (r.left <= 0) {
            if (!readyToStep(p)) return;
            queue.shift();
            continue;
          }
          if (state.tick - r.lastProgress > STALL_TICKS) {
            this.problems.push(`walk ${act.dir} by ${actor} stalled at ${p.x},${p.y}`);
            queue.shift();
            continue;
          }
          if (readyToStep(p) && !p.slide) {
            r.from = { x: p.x, y: p.y };
            this.intent(out, actor).move = act.dir;
          }
          return;
        }
        case 'bump':
          if (!readyToStep(p) || p.slide) return;
          this.intent(out, actor).move = act.dir;
          queue.shift();
          return;
        case 'press':
          if (!readyToStep(p)) return;
          this.intent(out, actor)[act.button] = true;
          queue.shift();
          return;
        case 'wait':
          if (r.left-- > 0) return;
          queue.shift();
          continue;
        case 'until':
          if (act.test(state, r.seen)) {
            queue.shift();
            continue;
          }
          if (state.tick - r.started > act.max) {
            this.problems.push(`until "${act.label}" timed out`);
            queue.shift();
            continue;
          }
          return;
        case 'ui':
          out.ui.push(act.command);
          queue.shift();
          return;
        case 'do':
          act.run(state);
          queue.shift();
          continue;
      }
    }
  }

  private intent(out: ScriptTick, actor: number): Intent {
    return (out.intents[actor] ??= {});
  }
}

// ------------------------------------------------------------------ script vocabulary

export const walk = (dir: Dir, tiles = 1): Act => ({ kind: 'walk', dir, tiles });
export const bump = (dir: Dir): Act => ({ kind: 'bump', dir });
export const place: Act = { kind: 'press', button: 'place' };
export const action: Act = { kind: 'press', button: 'action' };
export const skill: Act = { kind: 'press', button: 'skill' };
export const detonate: Act = { kind: 'press', button: 'detonate' };
export const wait = (ticks: number): Act => ({ kind: 'wait', ticks });
export const until = (label: string, test: UntilTest, max = 900): Act => ({
  kind: 'until',
  test,
  max,
  label,
});
export const ui = (command: UiCommand): Act => ({ kind: 'ui', command });
export const direct = (run: (state: GameState) => void): Act => ({ kind: 'do', run });

/** Waits for a simulation event of `type` (optionally matching `match`). */
export function untilEvent<T extends SimEvent['type']>(
  type: T,
  match: (e: Extract<SimEvent, { type: T }>) => boolean = () => true,
  max = 900,
): Act {
  return until(
    type,
    (_s, seen) => seen.some((e) => e.type === type && match(e as Extract<SimEvent, { type: T }>)),
    max,
  );
}

/** Waits until no flame is burning (so walking back is safe). */
export const untilNoFlames: Act = until('flames out', (s) => s.flames.length === 0);
