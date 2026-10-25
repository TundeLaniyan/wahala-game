/**
 * Button B: tap = context special, hold = Remote Detonator. Pure (ticks, no DOM), shared by every device.
 *
 * Rule (decision WA4):
 *  - no live remote generator when B goes down: the special fires AT ONCE on the press (no delay at all);
 *  - a live remote generator: the press is held back; letting go before `SPECIAL_HOLD_TICKS` fires the
 *    special on release, keeping it down that long detonates instead (once, at the threshold, while still
 *    held), and the release after a detonation does nothing. A long press never also fires the tap.
 *
 * Several sources (keys K and E, a touch and a pad button) can hold B at once; it counts as one button
 * that is down while any of them is.
 */

/** Hold this long (ticks, 60/s) to detonate: 400 ms. */
export const SPECIAL_HOLD_TICKS = 24;
export const SPECIAL_HOLD_MS = Math.round((SPECIAL_HOLD_TICKS * 1000) / 60);

export type SpecialOutput = 'special' | 'detonate' | null;

export class SpecialHold {
  private readonly down = new Set<string>();
  /** The current press, while its outcome is still open. */
  private press: { since: number; resolved: boolean } | null = null;
  private queued: SpecialOutput = null;

  /** True while B is down and waiting to become a tap or a hold (UI fill feedback). */
  get pending(): boolean {
    return this.press !== null && !this.press.resolved;
  }

  /** Fraction (0..1) of the hold threshold reached by the open press, null when none. */
  progress(tick: number): number | null {
    if (!this.press || this.press.resolved) return null;
    return Math.min(1, Math.max(0, (tick - this.press.since) / SPECIAL_HOLD_TICKS));
  }

  /** `source` pressed B at `tick`. `remoteReady`: the player owns a live remote generator right now. */
  pressDown(source: string, tick: number, remoteReady: boolean): void {
    const wasDown = this.down.size > 0;
    this.down.add(source);
    if (wasDown) return; // a second finger / key on an already held B is the same press
    if (!remoteReady) {
      this.queued = 'special';
      this.press = { since: tick, resolved: true };
      return;
    }
    this.press = { since: tick, resolved: false };
  }

  /** `source` let go of B. */
  release(source: string): void {
    if (!this.down.delete(source) || this.down.size > 0) return;
    if (this.press && !this.press.resolved) this.queued = 'special';
    this.press = null;
  }

  /** What B produces on this tick (called once per simulation tick). */
  take(tick: number): SpecialOutput {
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
