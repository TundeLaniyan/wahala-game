import { describe, expect, it } from 'vitest';
import { KNOCKDOWN_MAX_S, SLIP_DOWN_S, SLIP_MAX_S, SLIP_RECOVER_S, slipPose } from '../../src/render/views/slip';
import type { SlipState } from '../../src/render/views/slip';

/** The GLOBAL KNOCKDOWN fall (decision GK1): flat on the back for the sim's whole knockdown, then back on their feet. */
describe('knockdown fall pose', () => {
  const state = (): SlipState => ({ kind: 'knockdown', start: 0, endedAt: null, holdUntil: 0 });

  it('falls in fast and lies flat on the back, lower than an oil slip', () => {
    const s = state();
    const down = slipPose(s, SLIP_DOWN_S + 0.2, true);
    expect(down.pitch).toBeLessThan(-1.4);
    const oil = slipPose({ kind: 'oil', start: 0, endedAt: null, holdUntil: 0 }, SLIP_DOWN_S + 0.2, true);
    expect(down.pitch).toBeLessThan(oil.pitch);
    expect(down.done).toBe(false);
  });

  it('stays down as long as the sim says (up to the 3 s tuning range) - longer than a slip may', () => {
    expect(KNOCKDOWN_MAX_S).toBeGreaterThan(3);
    expect(KNOCKDOWN_MAX_S).toBeGreaterThan(SLIP_MAX_S);
    const s = state();
    const still = slipPose(s, 3, true);
    expect(still.pitch).toBeLessThan(-1.4);
    expect(s.endedAt).toBeNull();
  });

  it('gets back up once the knockdown ends, and the state is dropped', () => {
    const s = state();
    slipPose(s, 2, true);
    slipPose(s, 2.1, false);
    expect(s.endedAt).toBe(2.1);
    const mid = slipPose(s, 2.1 + SLIP_RECOVER_S / 2, false);
    expect(mid.pitch).toBeGreaterThan(-1.5);
    expect(mid.pitch).toBeLessThan(0);
    expect(slipPose(s, 2.1 + SLIP_RECOVER_S + 0.01, false).done).toBe(true);
  });
});
