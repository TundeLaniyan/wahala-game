/**
 * Practice goals: per-tick checks over the real simulation (state, events and the intents that were
 * applied). A check stays ticked once it has passed; the practice is complete when every check is.
 */
import type { GameState, PickupKind, SimEvent } from '../sim';
import type { PracticeCheck, PracticeContext } from './types';

export class PracticeTracker {
  private readonly tests: ((ctx: PracticeContext) => boolean)[];
  readonly done: boolean[];

  constructor(readonly checks: readonly PracticeCheck[]) {
    this.tests = checks.map((c) => c.create());
    this.done = checks.map(() => false);
  }

  /** Returns true when a check changed this tick. */
  update(ctx: PracticeContext): boolean {
    let changed = false;
    this.tests.forEach((test, i) => {
      if (this.done[i]) return;
      if (test(ctx)) {
        this.done[i] = true;
        changed = true;
      }
    });
    return changed;
  }

  get complete(): boolean {
    return this.done.every(Boolean);
  }
}

// ------------------------------------------------------------------ reusable checks

const has = <T extends SimEvent['type']>(
  events: readonly SimEvent[],
  type: T,
  match: (e: Extract<SimEvent, { type: T }>) => boolean,
): boolean => events.some((e) => e.type === type && match(e as Extract<SimEvent, { type: T }>));

export function eventCheck<T extends SimEvent['type']>(
  label: string,
  type: T,
  match: (e: Extract<SimEvent, { type: T }>, ctx: PracticeContext) => boolean,
  count = 1,
): PracticeCheck {
  return {
    label,
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

export function stateCheck(
  label: string,
  test: (state: GameState, localId: number) => boolean,
): PracticeCheck {
  return { label, create: () => (ctx) => test(ctx.state, ctx.localId) };
}

export const collected = (label: string, kind: PickupKind, count = 1): PracticeCheck =>
  eventCheck(label, 'pickupCollected', (e, c) => e.playerId === c.localId && e.kind === kind, count);

export const flameBrokeCrates = (label: string, count: number): PracticeCheck =>
  eventCheck(label, 'blockDestroyed', (e) => e.by === 'flame', count);

export { has as hasEvent };
