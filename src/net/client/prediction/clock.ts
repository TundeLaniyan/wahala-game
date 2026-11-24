/**
 * Estimates WHEN the server will apply an input sent now: the server tick at which a message sent at client time `t`
 * arrives (`arrival(t)`, continuous ticks; the message is used by step `floor(arrival) + 1`).
 *
 * Source: the existing ping / pong (no protocol change). The server answers a ping with its tick at the moment it handled it
 * (`PongMsg.t`, server/src/rooms/RumbleRoom.ts), exactly the moment an input sent at the same client time would be handled.
 * So `arrival(t) = t / TICK_MS + (pong.t + 0.5 - pong.c / TICK_MS)`: the uplink delay is measured, not assumed symmetric, and
 * the jitter buffer / send batching (which only delay the DOWNLINK picture) do not enter it. The median of the last few
 * samples rides out a pong delayed by a retransmission. A small bias learned from calibration probes (a press from rest whose
 * authoritative step start is later seen in the replica) absorbs anything systematic the pings miss.
 */
import type { PredictionConfig } from './config';
import { TICK_MS } from './config';

export class InputClock {
  private samples: number[] = [];
  private bias = 0;
  private lastSend = -Infinity;
  probes = 0;

  constructor(private readonly cfg: PredictionConfig) {}

  get ready(): boolean {
    return this.samples.length > 0;
  }

  /** A pong: `c` the client time its ping was sent, `t` the server tick when the server handled it. */
  onPong(c: number, t: number): void {
    if (!Number.isFinite(c) || !Number.isFinite(t)) return;
    this.samples.push(t + 0.5 - c / TICK_MS);
    if (this.samples.length > this.cfg.clockSamples) this.samples.shift();
  }

  /** Continuous server tick at which a message sent at `nowMs` arrives (NaN before the first pong). */
  arrival(nowMs: number): number {
    if (this.samples.length === 0) return NaN;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    return nowMs / TICK_MS + median + this.bias;
  }

  /** `arrival` for a message being sent now; never earlier than the previous message's (the transport is ordered). */
  arrivalForSend(nowMs: number): number {
    const a = Math.max(this.arrival(nowMs), this.lastSend);
    this.lastSend = a;
    return a;
  }

  /** A probe measured the true arrival `errorTicks` later (positive) or earlier than estimated. */
  correct(errorTicks: number): boolean {
    if (!Number.isFinite(errorTicks) || Math.abs(errorTicks) > this.cfg.probeMaxErrorTicks) return false;
    this.bias += this.cfg.probeGain * errorTicks;
    this.probes++;
    return true;
  }

  get biasTicks(): number {
    return this.bias;
  }
}
