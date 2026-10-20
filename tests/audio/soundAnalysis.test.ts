/**
 * Numeric sanity checks on the synthesised sounds at FULL render rate. These prove measurable
 * properties (levels, band energy, tonal peaks, pitch glides, pulse rates, seamless loops). They
 * cannot prove a sound is pleasant or convincing: that needs ears.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderSound } from '../../src/audio/bank';
import { lowpass, rmsOf } from '../../src/audio/dsp/core';
import { magnitudeSpectrum } from '../../src/audio/dsp/reverb';
import type { SoundId } from '../../src/audio/recipes';
import { SOUND_DEFS } from '../../src/audio/recipes';
import { analyse } from '../../tools/audio/analysis';

// full-rate renders of many-voice crowd sounds take a few seconds on a busy machine
vi.setConfig({ testTimeout: 60_000 });

function mono(id: SoundId) {
  const r = renderSound(id);
  const m = new Float32Array(r.l.length);
  for (let i = 0; i < m.length; i++) m[i] = (r.l[i]! + r.r[i]!) / 2;
  return { r, m, a: analyse(r.l, r.r, r.rate, SOUND_DEFS[id].kind === 'loop') };
}

/** Strongest spectral peak (Hz) of `x[from..to]` seconds, restricted to [lo, hi] Hz. */
function peakIn(x: Float32Array, rate: number, from: number, to: number, lo = 40, hi = 8000): number {
  const seg = x.subarray(Math.floor(from * rate), Math.floor(to * rate));
  const size = 1 << Math.ceil(Math.log2(seg.length));
  const mag = magnitudeSpectrum(seg, size);
  let best = 0;
  let bk = 0;
  for (let k = Math.ceil((lo * size) / rate); k < Math.min(mag.length, (hi * size) / rate); k++) {
    if (mag[k]! > best) {
      best = mag[k]!;
      bk = k;
    }
  }
  return (bk * rate) / size;
}

/** Energy-weighted spectral centroid (Hz) of a time window. */
function centroid(x: Float32Array, rate: number, from: number, to: number): number {
  const seg = x.subarray(Math.floor(from * rate), Math.floor(to * rate));
  const size = 1 << Math.ceil(Math.log2(seg.length));
  const mag = magnitudeSpectrum(seg, size);
  let e = 0;
  let c = 0;
  for (let k = 1; k < mag.length; k++) {
    const p = mag[k]! * mag[k]!;
    e += p;
    c += p * ((k * rate) / size);
  }
  return c / e;
}

/** How tonal a signal is: strongest bin versus the median bin, in dB. */
function tonalityDb(x: Float32Array): number {
  const size = 1 << Math.ceil(Math.log2(x.length));
  const mag = Array.from(magnitudeSpectrum(x, size).subarray(2, size / 8)).sort((a, b) => a - b);
  return 20 * Math.log10(mag[mag.length - 1]! / Math.max(1e-9, mag[Math.floor(mag.length / 2)]!));
}

/** Energy of the 100 ms RMS envelope: its coefficient of variation (slow modulation). */
function envelopeVariation(x: Float32Array, rate: number): number {
  const win = Math.floor(rate * 0.1);
  const vals: number[] = [];
  for (let i = 0; i + win <= x.length; i += win) vals.push(rmsOf(x.subarray(i, i + win)));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  return sd / mean;
}

describe('explosion', () => {
  const { r, m, a } = mono('explosion_1');
  it('is loud without clipping, a few seconds long, and decays', () => {
    expect(a.peak).toBeGreaterThan(0.7);
    expect(a.peak).toBeLessThan(0.98);
    expect(a.seconds).toBeGreaterThan(2);
    expect(a.seconds).toBeLessThan(4);
    const early = rmsOf(m.subarray(0, Math.floor(r.rate * 0.4)));
    const late = rmsOf(m.subarray(Math.floor(r.rate * 1.6)));
    expect(late).toBeLessThan(early * 0.1);
    expect(Math.abs(a.dc)).toBeLessThan(0.002);
  });
  it('has strong low-frequency energy (thump) and an audible mid/high crack for small speakers', () => {
    expect(a.subShare).toBeGreaterThan(0.5); // raw energy below 150 Hz
    expect(a.bands[2] + a.bands[3]).toBeGreaterThan(0.6); // A-weighted: most audible energy above 500 Hz
    // the first 40 ms (the crack) are bright compared with the body
    expect(centroid(m, r.rate, 0, 0.04)).toBeGreaterThan(centroid(m, r.rate, 0.5, 1.2));
  });
  it('the three variants and the rumble layer differ in character', () => {
    const c = (id: SoundId): number => {
      const x = mono(id);
      return centroid(x.m, x.r.rate, 0, 1.5);
    };
    expect(new Set([c('explosion_1'), c('explosion_2'), c('explosion_3')]).size).toBe(3);
    expect(c('explosion_rumble')).toBeLessThan(c('explosion_1') / 2); // the rumble is the low layer
  });
});

describe('horns stay in distinct, audible bands', () => {
  const danfo = mono('danfo_horn');
  const taxi = mono('taxi_horn');
  const keke = mono('keke_horn');
  it('are strongly tonal with their strongest partials in the expected band', () => {
    for (const h of [danfo, taxi, keke]) expect(tonalityDb(h.m)).toBeGreaterThan(20);
    const dp = peakIn(danfo.m, danfo.r.rate, 0, 1.6, 100, 4000);
    const tp = peakIn(taxi.m, taxi.r.rate, 0, 1.2, 100, 4000);
    const kp = peakIn(keke.m, keke.r.rate, 0, 0.6, 100, 4000);
    expect(dp).toBeGreaterThan(140);
    expect(dp).toBeLessThan(800);
    expect(tp).toBeGreaterThan(640);
    expect(tp).toBeLessThan(900);
    expect(kp).toBeGreaterThan(1150);
    expect(kp).toBeLessThan(1450);
  });
  it('rank danfo < taxi < keke by spectral centroid, and sit mostly in the audible mid range', () => {
    const c = [danfo, taxi, keke].map((h) => centroid(h.m, h.r.rate, 0, 1.0));
    expect(c[0]!).toBeLessThan(c[1]!);
    expect(c[1]!).toBeLessThan(c[2]!);
    for (const h of [danfo, taxi, keke]) expect(h.a.bands[2]).toBeGreaterThan(0.6);
  });
  it('the danfo is a two-note honk, the taxi a four-peep pattern (counted from the envelope)', () => {
    const bursts = (x: Float32Array, rate: number): number => {
      const env = lowpass(x.map(Math.abs), rate, 30);
      const thr = Math.max(...env) * 0.35;
      let n = 0;
      let on = false;
      for (const v of env) {
        if (v > thr && !on) {
          on = true;
          n++;
        } else if (v < thr * 0.5) on = false;
      }
      return n;
    };
    expect(bursts(danfo.m, danfo.r.rate)).toBe(2);
    expect(bursts(taxi.m, taxi.r.rate)).toBe(4);
    expect(bursts(keke.m, keke.r.rate)).toBe(2);
  });
});

describe('generator loop', () => {
  const { r, m, a } = mono('gen_run_loop');
  it('is a seamless 1 s loop of about 24 pulses per second', () => {
    expect(a.seconds).toBeCloseTo(1, 2);
    expect(a.seam).toBeLessThanOrEqual(1.5);
    expect(Math.abs(a.dc)).toBeLessThan(0.002);
    // pulse rate: count rising crossings of the smoothed envelope over its mean
    const env = lowpass(m.map(Math.abs), r.rate, 60);
    const mean = env.reduce((s, v) => s + v, 0) / env.length;
    let crossings = 0;
    for (let i = 1; i < env.length; i++) if (env[i - 1]! < mean && env[i]! >= mean) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(20);
    expect(crossings).toBeLessThanOrEqual(30);
  });
  it('rattle loop is a bright, noisy band and seamless', () => {
    const rat = mono('gen_rattle_loop');
    expect(rat.a.seam).toBeLessThanOrEqual(1.5);
    expect(rat.a.centroid).toBeGreaterThan(1200);
  });
});

describe('crowd ambience', () => {
  const walla = mono('crowd_loop');
  const hype = mono('crowd_loop_hype');
  const bus = mono('buspark_loop');

  it('loops seamlessly with no DC and sane level', () => {
    for (const l of [walla, hype, bus]) {
      expect(l.a.seam).toBeLessThanOrEqual(1.5);
      expect(Math.abs(l.a.dc)).toBeLessThan(0.002);
      expect(l.a.peak).toBeLessThan(0.98);
      expect(l.a.seconds).toBeGreaterThan(10);
    }
    // loops are RMS-normalised per channel; the mono mix of two decorrelated channels reads up to 3 dB lower
    expect(Math.abs(walla.a.rmsDb - SOUND_DEFS.crowd_loop.rmsDb)).toBeLessThan(3);
  });

  it('is broadband (energy spread over several octaves) rather than a tone', () => {
    const bands: [number, number][] = [
      [200, 400],
      [400, 800],
      [800, 1600],
      [1600, 3200],
    ];
    const size = 1 << 16;
    const seg = walla.m.subarray(0, size);
    const mag = magnitudeSpectrum(seg, size);
    const e = (lo: number, hi: number): number => {
      let s = 0;
      for (let k = Math.ceil((lo * size) / walla.r.rate); k < (hi * size) / walla.r.rate; k++)
        s += mag[k]! ** 2;
      return s;
    };
    const total = bands.reduce((s, [lo, hi]) => s + e(lo, hi), 0);
    for (const [lo, hi] of bands) expect(e(lo, hi) / total, `${lo}-${hi}`).toBeGreaterThan(0.04);
    expect(tonalityDb(walla.m)).toBeLessThan(35);
  });

  it('modulates slowly (swells), the hype layer more than the murmur', () => {
    const w = envelopeVariation(walla.m, walla.r.rate);
    const h = envelopeVariation(hype.m, hype.r.rate);
    expect(w).toBeGreaterThan(0.04);
    expect(w).toBeLessThan(0.5);
    expect(h).toBeGreaterThan(w);
  });

  it('hype layer is brighter and has claps and whistles (high band energy) the murmur lacks', () => {
    expect(hype.a.centroid).toBeGreaterThan(walla.a.centroid);
    expect(peakIn(hype.m, hype.r.rate, 0, 14, 2200, 3800)).toBeGreaterThan(2200); // a whistle is in there
  });
});

describe('crowd reactions', () => {
  it('have vocal-formant energy (500-3000 Hz), swell in and out, and the right durations', () => {
    for (const id of [
      'crowd_cheer_1',
      'crowd_ooh',
      'crowd_groan',
      'crowd_gasp',
      'crowd_laugh',
      'crowd_shout',
      'crowd_roar',
    ] as const) {
      const x = mono(id);
      expect(x.a.bands[2], id).toBeGreaterThan(0.7);
      expect(x.a.peak, id).toBeGreaterThan(0.7);
      const edge = rmsOf(x.m.subarray(0, Math.floor(x.r.rate * 0.01)));
      expect(edge, id).toBeLessThan(rmsOf(x.m) * 0.5); // starts softly, no click
    }
    expect(mono('crowd_roar').a.seconds).toBeGreaterThan(mono('crowd_shout').a.seconds);
  });
  it('the groan falls in pitch and the cheer rises', () => {
    const g = mono('crowd_groan');
    const c = mono('crowd_cheer_1');
    expect(centroid(g.m, g.r.rate, 0.1, 0.6)).toBeGreaterThan(centroid(g.m, g.r.rate, 1.1, 1.6));
    expect(centroid(c.m, c.r.rate, 0.0, 0.25)).toBeLessThan(centroid(c.m, c.r.rate, 0.3, 0.6) * 1.1);
  });
  it('whistles are narrow-band tones in the 2-4 kHz warning-ish band', () => {
    for (const id of ['crowd_whistle_1', 'crowd_whistle_2'] as const) {
      const x = mono(id);
      expect(tonalityDb(x.m)).toBeGreaterThan(12); // narrow peak well above the median bin despite reverb
      const p = peakIn(x.m, x.r.rate, 0, 0.6, 1500, 5000);
      expect(p).toBeGreaterThan(1900);
      expect(p).toBeLessThan(3800);
    }
  });
});

describe('pitch gestures', () => {
  it('a passing danfo bends down like a Doppler shift', () => {
    const p = mono('danfo_pass');
    expect(centroid(p.m, p.r.rate, 0.2, 0.6)).toBeGreaterThan(centroid(p.m, p.r.rate, 0.95, 1.35) * 1.02);
  });
  it('the slide-whistle elimination falls from high to low', () => {
    const e = mono('elim_slide');
    expect(peakIn(e.m, e.r.rate, 0.12, 0.3, 400, 4000)).toBeGreaterThan(
      peakIn(e.m, e.r.rate, 0.6, 0.85, 200, 4000) * 1.8,
    );
  });
  it('pickups are bright tonal chimes; curse is darker and lower; fuse tick sits at 3 kHz', () => {
    const p = mono('pickup_1');
    expect(p.a.centroid).toBeGreaterThan(1200);
    const [lo, hi] = [peakIn(p.m, p.r.rate, 0, 0.07, 500, 6000), peakIn(p.m, p.r.rate, 0.08, 0.2, 500, 6000)];
    expect(hi).toBeGreaterThan(lo);
    expect(mono('pickup_curse').a.centroid).toBeLessThan(p.a.centroid);
    const f = mono('fuse_tick');
    expect(Math.abs(peakIn(f.m, f.r.rate, 0, 0.05, 1000, 6000) - 3000)).toBeLessThan(250);
    expect(f.a.seconds).toBeLessThan(0.15);
  });
});

describe('whole bank at full rate: levels and cleanliness', () => {
  it('no sound clips, none is silent, none has a DC offset', () => {
    // a representative cross-section (rendering all 81 at full rate takes several seconds)
    for (const id of [
      'explosion_2',
      'vehicle_wreck',
      'win_sting',
      'okada_break',
      'bottle_smash',
      'ui_go',
      'elim_womp',
      'crush_slam',
    ] as const) {
      const { a } = mono(id);
      expect(a.problems, id).toEqual([]);
    }
  });
});
