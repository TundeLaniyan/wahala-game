import { describe, expect, it, vi } from 'vitest';
import { createSoundBank, renderSound } from '../../src/audio/bank';
import { SOUND_DEFS, SOUND_IDS } from '../../src/audio/recipes';
import type { SoundId } from '../../src/audio/recipes';
import { hashSeed, peakOf } from '../../src/audio/dsp/core';
import { finalize } from '../../src/audio/recipes/types';
import { createRand } from '../../src/audio/rng';
import { Priority } from '../../src/audio/voices';
import { analyse } from '../../tools/audio/analysis';
import { FakeBuffer, FakeContext } from './fakeContext';

const SCALE = 0.25; // 8 kHz renders keep the whole-bank test fast

describe('sound registry', () => {
  it('contains the sounds the design calls for', () => {
    for (const id of [
      'crowd_loop',
      'crowd_loop_hype',
      'buspark_loop',
      'crowd_cheer_1',
      'crowd_gasp',
      'crowd_groan',
      'crowd_laugh',
      'crowd_roar',
      'explosion_1',
      'explosion_2',
      'explosion_3',
      'gen_run_loop',
      'gen_rattle_loop',
      'gen_powerdown',
      'gen_remote_blip',
      'danfo_horn',
      'taxi_horn',
      'keke_horn',
      'danfo_engine_loop',
      'okada_mount',
      'okada_break',
      'vehicle_wreck',
      'pickup_1',
      'pickup_rare',
      'pickup_curse',
      'pickup_voucher',
      'elim_slide',
      'elim_boing',
      'elim_womp',
      'ui_click',
      'ui_back',
      'ui_start',
      'ui_count',
      'ui_go',
      'win_sting',
      'lose_sting',
      'draw_sting',
      'bottle_smash',
      'crowd_throw_whistle',
      'pothole_thud',
      'oil_squeak',
      'crush_slam',
    ] as SoundId[]) {
      expect(SOUND_IDS, id).toContain(id);
    }
    expect(SOUND_IDS.length).toBeGreaterThanOrEqual(75);
  });

  it('every definition has a sane bus, priority and rate; there is no music category', () => {
    for (const id of SOUND_IDS) {
      const d = SOUND_DEFS[id];
      expect(['sfx', 'warn', 'react', 'amb'], id).toContain(d.bus);
      expect(d.priority).toBeGreaterThanOrEqual(Priority.ambient);
      expect(d.priority).toBeLessThanOrEqual(Priority.jingle);
      expect(d.rate).toBeGreaterThanOrEqual(12000);
      expect(d.rate).toBeLessThanOrEqual(48000);
      expect(id).not.toMatch(/music|song|beat|melody/i);
    }
    // warnings (horns, fuse tick, alarms) have the warning bus; crowd loops the ambience bus
    expect(SOUND_DEFS.danfo_horn.bus).toBe('warn');
    expect(SOUND_DEFS.fuse_tick.bus).toBe('warn');
    expect(SOUND_DEFS.crowd_loop.bus).toBe('amb');
    expect(SOUND_DEFS.crowd_cheer_1.bus).toBe('react');
  });
});

describe('rendering (pure DSP, 8 kHz test scale)', () => {
  it('renders every sound finite, bounded, non-silent, DC-free and with seamless loops', () => {
    const problems: string[] = [];
    for (const id of SOUND_IDS) {
      const r = renderSound(id, SCALE);
      const a = analyse(r.l, r.r, r.rate, SOUND_DEFS[id].kind === 'loop');
      if (a.problems.length) problems.push(`${id}: ${a.problems.join(', ')}`);
      expect(peakOf(r.l), id).toBeLessThanOrEqual(1);
      expect(peakOf(r.r), id).toBeLessThanOrEqual(1);
      expect(r.l.length, id).toBe(r.r.length);
      expect(a.seconds, id).toBeGreaterThan(0.05);
      expect(a.seconds, id).toBeLessThan(20);
    }
    expect(problems).toEqual([]);
  }, 60000);

  it('rendering is deterministic (same id and rate => identical samples)', () => {
    for (const id of ['explosion_2', 'crowd_gasp', 'danfo_horn'] as SoundId[]) {
      const def = SOUND_DEFS[id];
      const run = () => {
        const g = def.render({ rate: 8000, rng: createRand(hashSeed(id)) });
        let s = g.next();
        while (!s.done) s = g.next();
        return finalize(def, s.value);
      };
      const a = run();
      const b = run();
      expect(a.l).toEqual(b.l);
      expect(a.r).toEqual(b.r);
    }
  });

  it('one-shots are normalised near their peak target; loops reach their RMS target', () => {
    const e = renderSound('explosion_1', SCALE);
    expect(peakOf(e.l)).toBeGreaterThan(0.7);
    const loop = renderSound('crowd_loop', SCALE);
    const a = analyse(loop.l, loop.r, loop.rate, true);
    expect(Math.abs(a.rmsDb - SOUND_DEFS.crowd_loop.rmsDb)).toBeLessThan(3);
  });

  it('crowd variants differ from each other', () => {
    const a = renderSound('crowd_cheer_1', SCALE);
    const b = renderSound('crowd_cheer_2', SCALE);
    expect(a.l).not.toEqual(b.l);
    expect(renderSound('explosion_1', SCALE).l).not.toEqual(renderSound('explosion_2', SCALE).l);
  });
});

describe('sound bank', () => {
  const make = (extra = {}) => {
    const ctx = new FakeContext();
    const jobs: (() => void)[] = [];
    const bank = createSoundBank(ctx, {
      rateScale: SCALE,
      cache: true,
      schedule: (fn) => (jobs.push(fn), () => undefined),
      ...extra,
    });
    return { ctx, bank, jobs };
  };

  it('renders cheap one-shots on demand into stereo AudioBuffers at the render rate', () => {
    const { bank } = make();
    expect(bank.ready('ui_click')).toBe(false);
    const buf = bank.get('ui_click')!;
    expect(buf).toBeTruthy();
    expect(buf.sampleRate).toBe(Math.round(SOUND_DEFS.ui_click.rate * SCALE));
    expect((buf as FakeBuffer).numberOfChannels).toBe(2);
    expect(bank.get('ui_click')).toBe(buf); // cached
    expect(Array.from(buf.getChannelData(0)).some((v) => Math.abs(v) > 0.1)).toBe(true);
  });

  it('never renders loops or crowd reactions synchronously, but queues them first', () => {
    const { bank, jobs } = make();
    expect(bank.get('crowd_loop')).toBeNull();
    expect(bank.get('crowd_cheer_1')).toBeNull();
    expect(jobs.length).toBeGreaterThan(0); // a warm-up slice was scheduled
    expect(bank.pending()).toBeGreaterThan(0);
  });

  it('does not render the long-reverb one-shots (explosions, wreck) on the spot either', () => {
    const { bank, jobs } = make();
    expect(bank.get('explosion_1')).toBeNull();
    expect(bank.get('vehicle_wreck')).toBeNull();
    expect(bank.get('pickup_1')).toBeTruthy(); // cheap: rendered on demand
    expect(jobs.length).toBeGreaterThan(0);
  });

  it('syncRender mode renders anything on demand and never schedules work', () => {
    const { bank, jobs } = make({ syncRender: true });
    expect(bank.get('crowd_loop')).toBeTruthy();
    expect(bank.get('explosion_2')).toBeTruthy();
    bank.warm();
    expect(jobs).toHaveLength(0);
  });

  it('background warm-up renders in slices, announces each sound, and finishes', () => {
    const { bank, jobs } = make({ sliceMs: 0 }); // one step per slice
    const ready: string[] = [];
    bank.onReady((id) => ready.push(id));
    bank.warm();
    expect(jobs).toHaveLength(1);
    let guard = 0;
    while (jobs.length && guard++ < 100000) jobs.shift()!();
    expect(bank.pending()).toBe(0);
    expect(ready.length).toBe(SOUND_IDS.length);
    expect(ready.slice(0, 5)).toEqual(['ui_click', 'ui_back', 'ui_start', 'ui_count', 'ui_go']); // UI first
    expect(ready.indexOf('crowd_loop')).toBeLessThan(ready.indexOf('explosion_3'));
    expect(guard).toBeGreaterThan(SOUND_IDS.length); // spread over many slices, not one blocking call
    expect(bank.get('crowd_loop')).toBeTruthy();
  });

  it('prioritize moves requested ids to the front of the queue', () => {
    const { bank, jobs } = make({ sliceMs: 0 });
    const order: string[] = [];
    bank.onReady((id) => order.push(id));
    bank.warm();
    bank.prioritize(['win_sting', 'lose_sting']);
    let guard = 0;
    while (order.length < 3 && jobs.length && guard++ < 10000) jobs.shift()!();
    expect(order.slice(0, 2)).toEqual(['win_sting', 'lose_sting']);
  });

  it('warmAll renders everything synchronously', () => {
    const { bank } = make();
    bank.warmAll();
    expect(bank.pending()).toBe(0);
    for (const id of SOUND_IDS) expect(bank.ready(id), id).toBe(true);
  });

  it('a recorded sample takes priority over the synthesised one, with its trim', () => {
    const { bank } = make();
    const synth = bank.get('ui_click')!;
    const rec = new FakeBuffer(4410, 44100, 2);
    bank.setRecorded('ui_click', rec, { gain: 0.5 });
    expect(bank.get('ui_click')).toBe(rec);
    expect(bank.get('ui_click')).not.toBe(synth);
    expect(bank.isRecorded('ui_click')).toBe(true);
    expect(bank.trim('ui_click')).toBe(0.5);
    expect(bank.trim('ui_back')).toBe(1);
    // a recording makes a loop available immediately (no rendering needed)
    bank.setRecorded('crowd_loop', rec);
    expect(bank.get('crowd_loop')).toBe(rec);
  });

  it('dispose stops the warm-up', () => {
    const { bank, jobs } = make();
    bank.warm();
    bank.dispose();
    const cancel = vi.fn();
    expect(bank.get('crowd_loop')).toBeNull();
    expect(cancel).not.toHaveBeenCalled();
    jobs.shift()?.();
    expect(bank.pending()).toBe(0);
  });
});
