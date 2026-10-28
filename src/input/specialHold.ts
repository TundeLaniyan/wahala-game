/**
 * The tap / hold split of a button, pure (ticks, no DOM) and shared by every device. Two buttons use it:
 * B (tap = context special) and A (tap = place a generator); on both, HOLDING it detonates the Remote
 * Detonator generators (decisions WA4, WA5).
 *
 * Rule:
 *  - no live remote generator when the button goes down: the tap fires AT ONCE on the press (no delay);
 *  - a live remote generator: the press is held back; letting go before `SPECIAL_HOLD_TICKS` fires the
 *    tap on release, keeping it down that long detonates instead (once, at the threshold, while still
 *    held), and the release after a detonation does nothing. A long press never also fires the tap, so
 *    a hold on A never drops a generator and a quick tap never detonates.
 *
 * Several sources (keys K and E, a touch and a pad button) can hold the button at once; it counts as one
 * button that is down while any of them is.
 */

/** Hold this long (ticks, 60/s) to detonate: 400 ms. */
export const SPECIAL_HOLD_TICKS = 24;
export const SPECIAL_HOLD_MS = Math.round((SPECIAL_HOLD_TICKS * 1000) / 60);

export type HoldOutput<Tap extends string> = Tap | 'detonate' | null;
export type SpecialOutput = HoldOutput<'special'>;
export type PlaceOutput = HoldOutput<'place'>;

export class HoldButton<Tap extends string> {
  private readonly down = new Set<string>();
  /** The current press, while its outcome is still open. */
  private press: { since: number; resolved: boolean } | null = null;
  private queued: HoldOutput<Tap> = null;

  constructor(private readonly tap: Tap) {}

  /** True while the button is down and waiting to become a tap or a hold (UI fill feedback). */
  get pending(): boolean {
    return this.press !== null && !this.press.resolved;
  }

  /** Fraction (0..1) of the hold threshold reached by the open press, null when none. */
  progress(tick: number): number | null {
    if (!this.press || this.press.resolved) return null;
    return Math.min(1, Math.max(0, (tick - this.press.since) / SPECIAL_HOLD_TICKS));
  }

  /** `source` pressed the button at `tick`. `remoteReady`: the player owns a live remote generator right now. */
  pressDown(source: string, tick: number, remoteReady: boolean): void {
    const wasDown = this.down.size > 0;
    this.down.add(source);
    if (wasDown) return; // a second finger / key on an already held B is the same press
    if (!remoteReady) {
      this.queued = this.tap;
      this.press = { since: tick, resolved: true };
      return;
    }
    this.press = { since: tick, resolved: false };
  }

  /** `source` let go of the button. */
  release(source: string): void {
    if (!this.down.delete(source) || this.down.size > 0) return;
    if (this.press && !this.press.resolved) this.queued = this.tap;
    this.press = null;
  }

  /** What the button produces on this tick (called once per simulation tick). */
  take(tick: number): HoldOutput<Tap> {
    if (this.press && !this.press.resolved && tick - this.press.since >= SPECIAL_HOLD_TICKS) {
      this.press.resolved = true;
      this.queued = 'detonate';
    }
    const out = this.queued;
    this.queued = null;
    return out;
  }

  /** Drops everything (pause, menus, lost focus). */
  clear(): void {
    this.down.clear();
    this.press = null;
    this.queued = null;
  }
}

/** Button B: tap = context special. */
export class SpecialHold extends HoldButton<'special'> {
  constructor() {
    super('special');
  }
}

/** Button A: tap = place a generator. */
export class PlaceHold extends HoldButton<'place'> {
  constructor() {
    super('place');
  }
}
