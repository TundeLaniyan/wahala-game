import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, ticks } from '../../src/sim';
import { SLIP_DOWN_S, SLIP_MAX_S, SLIP_RECOVER_S, slipPose } from '../../src/render/views/slip';
import type { SlipState } from '../../src/render/views/slip';

const oil = (): SlipState => ({ kind: 'oil', start: 10, endedAt: null, holdUntil: 10 });
const hole = (): SlipState => ({ kind: 'pothole', start: 10, endedAt: null, holdUntil: 10 });

describe('floor-trap feedback: the fighter visibly slips, stays down while the sim says so, then stands again', () => {
  it('oil: starts upright, falls backwards fast, and lifts the feet off the ground', () => {
    const s = oil();
    const t0 = slipPose(s, 10, true);
    expect(t0.pitch).toBeCloseTo(0, 5);
    const down = slipPose(s, 10 + SLIP_DOWN_S, true);
    expect(down.pitch).toBeLessThan(-1); // well past 57 degrees back: unmistakably on the ground
    expect(down.lift).toBeGreaterThan(0);
    expect(down.done).toBe(false);
  });

  it('stays down for exactly as long as the sim keeps the fighter sliding (no animation timer of its own)', () => {
    const s = oil();
    const a = slipPose(s, 10.8, true);
    const b = slipPose(s, 11.4, true);
    expect(b.pitch).toBeCloseTo(a.pitch, 1);
    expect(s.endedAt).toBeNull();
  });

  it('recovers to standing: the lean eases back, there is a small hop up, and the pose ends exactly upright', () => {
    const s = oil();
    slipPose(s, 11, true);
    const first = slipPose(s, 11.5, false); // sim says they are free; recovery begins
    expect(s.endedAt).toBe(11.5);
    const mid = slipPose(s, 11.5 + SLIP_RECOVER_S / 2, false);
    expect(Math.abs(mid.pitch)).toBeLessThan(Math.abs(first.pitch) + 1e-9);
    expect(Math.abs(mid.pitch)).toBeGreaterThan(0.05);
    expect(mid.lift).toBeGreaterThan(0); // the hop back up
    const end = slipPose(s, 11.5 + SLIP_RECOVER_S, false);
    expect(end).toEqual({ pitch: 0, roll: 0, lift: 0, done: true });
  });

  it('pothole: a trip pitches forward (the opposite way to the oil fall), recovers the same way', () => {
    const s = hole();
    const down = slipPose(s, 10 + SLIP_DOWN_S, true);
    expect(down.pitch).toBeGreaterThan(0.4);
    slipPose(s, 10.7, false);
    expect(slipPose(s, 10.7 + SLIP_RECOVER_S, false).done).toBe(true);
  });

  it('never stays down longer than SLIP_MAX_S even if the sim state were stuck', () => {
    const s = oil();
    slipPose(s, 10 + SLIP_MAX_S + 0.1, true);
    expect(s.endedAt).not.toBeNull();
    expect(slipPose(s, 10 + SLIP_MAX_S + 0.1 + SLIP_RECOVER_S, true).done).toBe(true);
  });
});

describe('floor-trap tuning is unchanged (this pass is presentation only)', () => {
  it('oil slides 2 tiles, a pothole stumbles for 0.6 s, and nothing here deals damage', () => {
    expect(DEFAULT_CONFIG.hazards.oilSlideTiles).toBe(2);
    expect(DEFAULT_CONFIG.hazards.potholeStumbleTicks).toBe(ticks(0.6));
    expect(Object.keys(DEFAULT_CONFIG.hazards).filter((k) => /damage|kill|lethal/i.test(k))).toEqual([]);
  });
});
