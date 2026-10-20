import { describe, expect, it } from 'vitest';
import { MAX_VOICES, Priority, createVoicePool } from '../../src/audio/voices';
import { createNoiseBuffer } from '../../src/audio/synth';
import { FakeContext } from './fakeContext';

function setup(max = 4) {
  const ctx = new FakeContext();
  const pool = createVoicePool(ctx, createNoiseBuffer(ctx, 0.1), max);
  const dest = ctx.createGain();
  const begin = (priority: number, duration = 1) => pool.begin({ priority, duration, dest });
  return { ctx, pool, begin };
}

describe('voice pool', () => {
  it('caps at the configured maximum (default 24)', () => {
    expect(MAX_VOICES).toBeLessThanOrEqual(24);
    const { pool, begin } = setup(4);
    for (let i = 0; i < 4; i++) expect(begin(Priority.normal)).not.toBeNull();
    expect(begin(Priority.normal)).not.toBeNull(); // steals an equal-priority voice
    expect(pool.active()).toBe(4);
  });

  it('drops low-priority newcomers when full of higher priority voices', () => {
    const { pool, begin } = setup(2);
    begin(Priority.big);
    begin(Priority.big);
    expect(begin(Priority.ambient)).toBeNull();
    expect(pool.active()).toBe(2);
  });

  it('steals the lowest priority first and silences it', () => {
    const { ctx, pool, begin } = setup(2);
    const low = begin(Priority.ambient)!;
    begin(Priority.warning);
    const osc = ctx.createOscillator();
    osc.start(0);
    low.track?.(osc);
    expect(begin(Priority.normal)).not.toBeNull();
    expect(osc.stoppedAt).not.toBeNull(); // the victim's sources were stopped
    expect(pool.active()).toBe(2);
  });

  it('frees voices once they end', () => {
    const { ctx, pool, begin } = setup(3);
    begin(Priority.normal, 0.5);
    begin(Priority.normal, 0.5);
    expect(pool.active()).toBe(2);
    ctx.advance(1);
    expect(pool.active()).toBe(0);
  });

  it('stopAll clears everything', () => {
    const { pool, begin } = setup(3);
    begin(Priority.normal);
    begin(Priority.normal);
    pool.stopAll();
    expect(pool.active()).toBe(0);
  });
});
