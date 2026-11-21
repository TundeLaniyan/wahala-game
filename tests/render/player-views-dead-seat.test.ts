/**
 * A figure created for a seat that is already down (a raid wave not yet on the board, a seat re-dressed when its
 * on-demand model arrives) starts hidden: its death clock is long over, so no tumble or puff is replayed at match start
 * (decision RI5). An alive seat starts with no death clock.
 */
import { describe, expect, it } from 'vitest';
import { initialDeadAt } from '../../src/render/views/PlayerViews';

describe('the death clock of a new figure', () => {
  it('is none for a living seat and long over for a seat already down', () => {
    expect(initialDeadAt(true)).toBeNull();
    const t = initialDeadAt(false)!;
    // poseDead hides the figure once `time - deadAt` passes the 1.7 s death animation: true at any render time
    for (const time of [0, 0.016, 5, 1e6]) expect(time - t).toBeGreaterThan(1.7);
  });
});
