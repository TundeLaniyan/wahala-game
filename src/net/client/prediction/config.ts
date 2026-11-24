/**
 * Every tunable of the local movement prediction in one place (decisions ON4-ON5, docs/ONLINE_PREDICTION.md section 4).
 * Presentation only: none of these values can change what the server simulates or what the client sends.
 */
import { TICK_RATE } from '../../protocol';

export const TICK_MS = 1000 / TICK_RATE;

export interface PredictionConfig {
  /**
   * The furthest the drawn local fighter may run ahead of the replica's tick (ticks). The display aims at the tick at which
   * an input sent NOW reaches the server (one-way up + playout lag of the replica, i.e. about RTT + batching + jitter buffer);
   * beyond this cap the prediction waits for the server instead of guessing further (long stalls, very bad links).
   */
  maxHorizonTicks: number;
  /** A correction at most `snapTiles` long is blended out with this time constant x3 (about 95 % gone after `blendMs`). */
  blendMs: number;
  /** A correction longer than this (tiles) snaps at once instead of blending (a mispredicted full step, a respawn). */
  snapTiles: number;
  /** Corrections shorter than this (tiles) are dropped (float noise, no visible effect). */
  deadbandTiles: number;
  /**
   * How fast the shown prediction time may move toward its target, in ticks per second on top of real time (both ways).
   * 30 = the local fighter may play at most 1.5x / 0.5x speed while the look-ahead grows (match start, after a hold) or
   * shrinks (the clock estimate moved). Hysteresis: the look-ahead never jumps forward and never oscillates frame to frame.
   */
  slewTicksPerSecond: number;
  /** Ping samples kept for the clock estimate (median, so a delayed pong does not move it). */
  clockSamples: number;
  /** Gain of one calibration probe (a fresh press from rest whose authoritative step start is observed). */
  probeGain: number;
  /** A probe further off than this (ticks) is ignored (a daze, a push, a missed step). */
  probeMaxErrorTicks: number;
  /** A press is a calibration probe only after this long with nothing held (ms). */
  probeIdleMs: number;
  /** A probe that sees no matching step within this time is dropped (ms). */
  probeTimeoutMs: number;
}

export const DEFAULT_PREDICTION: Readonly<PredictionConfig> = Object.freeze({
  maxHorizonTicks: 40,
  blendMs: 120,
  snapTiles: 0.55,
  deadbandTiles: 0.01,
  slewTicksPerSecond: 30,
  clockSamples: 5,
  probeGain: 0.25,
  probeMaxErrorTicks: 12,
  probeIdleMs: 400,
  probeTimeoutMs: 2000,
});

/**
 * Mirror of the server's `PRESS_KEEP_TICKS` (server/src/core/RumbleMatch.ts): how long the server keeps a new direction
 * press that has not produced a step yet. Duplicated (the client chunk must never import the server) and checked equal by
 * tests/net/prediction.test.ts.
 */
export const SERVER_PRESS_KEEP_TICKS = 24;

export function predictionConfig(over: Partial<PredictionConfig> = {}): PredictionConfig {
  return { ...DEFAULT_PREDICTION, ...over };
}

/**
 * The browser default: prediction ON, `?nopredict` turns it off for the page (an escape hatch for diagnosis; the
 * session reads it once when it builds the driver).
 */
export function predictionFromSearch(search: string): boolean {
  return !new URLSearchParams(search).has('nopredict');
}
