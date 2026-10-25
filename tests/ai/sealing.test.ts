import { describe, expect, it } from 'vitest';
import { escapeSurvivesSealing } from '../../src/ai/analysis';
import type { EscapePlan } from '../../src/ai/analysis';
import { getBoard } from '../../src/ai/board';
import { createCtx } from '../../src/ai/context';
import { PROFILES } from '../../src/ai/profiles';
import { createRng, observe } from '../../src/sim';
import type { Dir } from '../../src/sim';
import { put, sandbox } from '../helpers';

/**
 * Regression (decision WB6): the sealing check must judge an escape the bot is COMMITTED to. It used to
 * re-search from the placement tile with hindsight, so a route up a one-tile corridor towards a rival
 * passed (a sideways route existed) and the bot then ran into the dead end the rival closed behind it.
 */
function setup() {
  const s = sandbox({ players: 2 });
  put(s, 0, 4, 6);
  put(s, 1, 4, 4);
  const obs = observe(s, 0);
  const profile = PROFILES.expert;
  const c = createCtx(profile, createRng(1), getBoard(s.width, s.height));
  c.world.refresh(obs, profile);
  const W = s.width;
  const T = s.tick;
  const u = 6 * W + 4;
  const plan = (steps: [Dir, number, number][]): EscapePlan => ({
    actions: steps.map(([d]) => d),
    tiles: [u, ...steps.map(([, x, y]) => y * W + x)],
    times: steps.map((_, i) => T + 1 + i * 10),
    a0: T,
  });
  const mine = { x: 4, y: 6, range: 2, pierce: false, explodeAt: T + s.config.generator.fuseTicks };
  return { c, T, u, plan, mine };
}

describe('escape robustness against a rival sealing it', () => {
  it('rejects running up a one-tile corridor that the rival at its end can close', () => {
    const { c, T, u, plan, mine } = setup();
    const up = plan([
      ['up', 4, 5],
      ['up', 4, 4],
      ['left', 3, 4],
      ['left', 2, 4],
    ]);
    expect(escapeSurvivesSealing(c, u, T, T + 1, 10, up, mine)).toBe(false);
  });

  it('accepts the sideways escape along the open row', () => {
    const { c, T, u, plan, mine } = setup();
    const side = plan([
      ['left', 3, 6],
      ['left', 2, 6],
      ['left', 1, 6],
      ['left', 0, 6],
    ]);
    expect(escapeSurvivesSealing(c, u, T, T + 1, 10, side, mine)).toBe(true);
  });
});
