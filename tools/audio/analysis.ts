/** IEC A-weighting gain (linear power) at frequency f: approximates how loud a band sounds to a listener. */
export function aWeightPower(f: number): number {
  const f2 = f * f;
  const ra =
    (12194 ** 2 * f2 * f2) /
    ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return ra * ra * 1.2589 ** 2; // +2.0 dB normalisation so 1 kHz = 0 dB
}

/** Numeric analysis helpers shared by tools/audio/render.ts and the vitest sound checks. */
import { magnitudeSpectrum } from '../../src/audio/dsp/reverb';
import { gainToDb } from '../../src/audio/dsp/core';

export interface Analysis {
  seconds: number;
  peak: number;
  rmsDb: number;
  dc: number;
  centroid: number;
  /** A-weighted share of spectral energy: below 150 Hz, 150-500 Hz, 500 Hz-4 kHz, above 4 kHz. */
  bands: [number, number, number, number];
  /** Strongest spectral peaks (Hz), most prominent first. */
  tones: number[];
  /** Unweighted share of energy below 150 Hz (sub-bass that small speakers cannot reproduce). */
  subShare: number;
  /** For loops: |last - first| step relative to the 99.9th percentile ordinary step (<= 1 = no worse than the sharpest ordinary step). */
  seam: number;
  nonFinite: number;
  problems: string[];
}

export function analyse(l: Float32Array, r: Float32Array, rate: number, isLoop: boolean): Analysis {
  const n = l.length;
  const mono = new Float32Array(n);
  let peak = 0;
  let sum = 0;
  let sq = 0;
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const m = (l[i]! + r[i]!) / 2;
    if (!Number.isFinite(m)) bad++;
    mono[i] = Number.isFinite(m) ? m : 0;
    peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!));
    sum += m;
    sq += m * m;
  }
  const rms = Math.sqrt(sq / n);
  // spectrum of up to the loudest 2^16-sample window
  const size = 1 << Math.min(16, Math.max(10, Math.ceil(Math.log2(n))));
  let start = 0;
  if (n > size) {
    let best = -1;
    for (let s = 0; s + size <= n; s += size >> 1) {
      let e = 0;
      for (let i = s; i < s + size; i += 8) e += mono[i]! * mono[i]!;
      if (e > best) {
        best = e;
        start = s;
      }
    }
  }
  const mag = magnitudeSpectrum(mono.subarray(start, start + size), size);
  const hz = (k: number): number => (k * rate) / size;
  let tot = 0;
  let rawTot = 0;
  let rawLow = 0;
  let cen = 0;
  const b: [number, number, number, number] = [0, 0, 0, 0];
  for (let k = 1; k < mag.length; k++) {
    const f = hz(k);
    rawTot += mag[k]! * mag[k]!;
    if (f < 150) rawLow += mag[k]! * mag[k]!;
    const e = mag[k]! * mag[k]! * aWeightPower(f);
    tot += e;
    cen += e * f;
    b[f < 150 ? 0 : f < 500 ? 1 : f < 4000 ? 2 : 3] += e;
  }
  const tones: number[] = [];
  const order = Array.from(mag.keys())
    .slice(2)
    .sort((x, y) => mag[y]! - mag[x]!);
  for (const k of order) {
    if (tones.length >= 4) break;
    if (tones.every((t) => Math.abs(t - hz(k)) > 40)) tones.push(Math.round(hz(k)));
  }
  // seam = step across the loop point relative to the 99.9th percentile of ordinary sample steps
  let seam = 0;
  if (isLoop) {
    const steps = new Float32Array(n - 1);
    for (let i = 1; i < n; i++) steps[i - 1] = Math.abs(l[i]! - l[i - 1]!);
    steps.sort();
    seam = Math.abs(l[n - 1]! - l[0]!) / Math.max(1e-9, steps[Math.floor((n - 2) * 0.999)]!);
  }
  const a: Analysis = {
    seconds: n / rate,
    peak,
    rmsDb: gainToDb(rms),
    dc: sum / n,
    centroid: tot > 0 ? cen / tot : 0,
    bands: tot > 0 ? [b[0] / tot, b[1] / tot, b[2] / tot, b[3] / tot] : [0, 0, 0, 0],
    tones,
    subShare: rawTot > 0 ? rawLow / rawTot : 0,
    seam,
    nonFinite: bad,
    problems: [],
  };
  if (bad) a.problems.push('non-finite samples');
  if (peak > 0.999) a.problems.push('clips');
  if (peak < 0.05) a.problems.push('near silent');
  if (Math.abs(a.dc) > 0.01) a.problems.push(`DC offset ${a.dc.toFixed(4)}`);
  if (isLoop && seam > 1.5) a.problems.push(`loop seam ${seam.toFixed(2)}`);
  return a;
}

export function formatRow(id: string, a: Analysis, ms: number): string {
  return [
    id,
    a.seconds.toFixed(2),
    a.peak.toFixed(2),
    a.rmsDb.toFixed(1),
    a.dc.toFixed(4),
    a.centroid.toFixed(0),
    a.bands.map((x) => (x * 100).toFixed(0) + '%').join(' ') +
      ` (raw<150: ${(a.subShare * 100).toFixed(0)}%)`,
    isFinite(a.seam) && a.seam > 0 ? a.seam.toFixed(2) : '-',
    ms.toFixed(0),
    [...a.problems, a.tones.length ? `peaks ${a.tones.join('/')}` : ''].filter(Boolean).join('; '),
  ].join('\t');
}

/** 16-bit stereo PCM WAV. */
export function wavBytes(l: Float32Array, r: Float32Array, rate: number): Uint8Array {
  const n = l.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const w = (o: number, s: string): void => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 4, true);
  const q = (x: number): number => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, q(l[i]!), true);
    v.setInt16(46 + i * 4, q(r[i]!), true);
  }
  return new Uint8Array(buf);
}
