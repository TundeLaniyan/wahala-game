/**
 * Server-side press latching (docs/CITY_RUMBLE_ONLINE.md section 4.6): online, a tap's press and release can both
 * reach the server while the player is still finishing a step. Offline `MoveGate` would keep that press until the step
 * ends; the server must do the same, or taps are silently lost on real networks.
 */
import { describe, expect, it } from 'vitest';
import type { Dir } from '../../src/sim';
import { DIR_VEC } from '../../src/sim';
import { PRESS_KEEP_TICKS } from '../../server/src/core/RumbleMatch';
import { makeMatch } from './helpers';

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

function playing(m: ReturnType<typeof makeMatch>): void {
  while (m.state.match.phase !== 'playing') m.step();
}

describe('press latching', () => {
  it('a tap sent and released while the player is mid-step still produces exactly one step', () => {
    let checked = 0;
    for (const d of ['up', 'right', 'down', 'left'] as Dir[]) {
      const m = makeMatch({ humans: 1, bots: 3, dropPolicy: 'idle' });
      playing(m);
      const me = m.state.players[0]!;
      let seq = 0;
      // start a step in direction d (hold for one tick, then release)
      m.input(0, { s: seq++, m: d, h: false, b: 0 }, 0);
      m.step();
      m.input(0, { s: seq++, m: null, h: false, b: 0 }, 20);
      if (me.stepRemaining <= 1) continue; // blocked that way: try another direction
      const mid = { x: me.x, y: me.y };
      // mid-step: tap the opposite direction (press and release before the server's next tick)
      const back = OPPOSITE[d];
      m.input(0, { s: seq++, m: back, h: false, b: 0 }, 40);
      m.input(0, { s: seq, m: null, h: false, b: 0 }, 41);
      for (let i = 0; i < PRESS_KEEP_TICKS + 20; i++) m.step();
      const v = DIR_VEC[back];
      if (!me.alive) continue;
      expect({ x: me.x, y: me.y }).toEqual({ x: mid.x + v.dx, y: mid.y + v.dy });
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a held direction keeps walking; releasing stops after the current step', () => {
    // spawns differ (some are crate pockets): at least one of several human seats must walk >= 2 tiles on one hold
    const m = makeMatch({ humans: 8, bots: 0, dropPolicy: 'idle' });
    playing(m);
    let walked = 0;
    const seq = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const d of ['up', 'right', 'down', 'left'] as Dir[]) {
      const starts = m.state.players.map((p) => ({ x: p.x, y: p.y }));
      for (let seat = 0; seat < 8; seat++) m.input(seat, { s: seq[seat]!++, m: d, h: false, b: 0 }, 0);
      for (let i = 0; i < 90; i++) m.step();
      for (let seat = 0; seat < 8; seat++) m.input(seat, { s: seq[seat]!++, m: null, h: false, b: 0 }, 0);
      for (let i = 0; i < 20; i++) m.step();
      const after = m.state.players.map((p) => ({ x: p.x, y: p.y }));
      for (let i = 0; i < 60; i++) m.step();
      m.state.players.forEach((p, seat) => {
        if (!p.alive) return;
        expect({ x: p.x, y: p.y }).toEqual(after[seat]); // released: no further steps
        const dist = Math.abs(after[seat]!.x - starts[seat]!.x) + Math.abs(after[seat]!.y - starts[seat]!.y);
        if (dist >= 2) walked++;
      });
    }
    expect(walked).toBeGreaterThan(0);
  });
});
