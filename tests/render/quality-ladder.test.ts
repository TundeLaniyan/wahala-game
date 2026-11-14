import { describe, expect, it } from 'vitest';
import {
  MAX_RUNG,
  QUALITY,
  QUALITY_PRESETS,
  QUALITY_SETTINGS,
  isQualitySetting,
  profileFor,
  rungOfPreset,
  rungOfSetting,
} from '../../src/render/quality';
import type { QualityProfile } from '../../src/render/quality';

const NUMERIC: (keyof QualityProfile)[] = [
  'maxPixelRatio',
  'shadowMapSize',
  'particleDensity',
  'crowd',
  'parkedBuses',
  'flameLights',
  'streetLife',
  'ambient',
];

describe('quality ladder', () => {
  it('has a Very Low rung below Low and several steps between Low and High', () => {
    expect(rungOfPreset('veryLow')).toBe(0);
    expect(rungOfPreset('low')).toBeGreaterThan(rungOfPreset('veryLow'));
    expect(rungOfPreset('high')).toBe(MAX_RUNG);
    expect(MAX_RUNG).toBeGreaterThanOrEqual(7);
    const presets = QUALITY_PRESETS.map(rungOfPreset);
    expect([...presets].sort((a, b) => a - b)).toEqual(presets);
    expect(new Set(presets).size).toBe(presets.length);
    expect(QUALITY_PRESETS.length).toBeGreaterThanOrEqual(5);
  });

  it('never gets more expensive going down: every budget is non-decreasing up the ladder', () => {
    for (let r = 1; r <= MAX_RUNG; r++) {
      const lo = profileFor(r - 1);
      const hi = profileFor(r);
      for (const k of NUMERIC)
        expect(hi[k] as number, `${k} at rung ${r}`).toBeGreaterThanOrEqual(lo[k] as number);
      expect(Number(hi.shadows)).toBeGreaterThanOrEqual(Number(lo.shadows));
      expect(Number(hi.antialias)).toBeGreaterThanOrEqual(Number(lo.antialias));
      // animation updates get rarer (a larger stride) on the way down
      expect(hi.animationStride).toBeLessThanOrEqual(lo.animationStride);
      // the view-clear test runs at least as often higher up
      expect(hi.viewClearStride).toBeLessThanOrEqual(lo.viewClearStride);
      // a rung must differ from its neighbour in something, otherwise stepping is pointless
      expect(JSON.stringify({ ...hi, rung: 0, name: '' })).not.toBe(
        JSON.stringify({ ...lo, rung: 0, name: '' }),
      );
    }
  });

  it('the view-clear fade (scenery that hides the fighter) is on at every rung: only its test rate varies', () => {
    for (let r = 0; r <= MAX_RUNG; r++) {
      const stride = profileFor(r).viewClearStride;
      expect(Number.isInteger(stride), `stride at rung ${r}`).toBe(true);
      expect(stride, `stride at rung ${r}`).toBeGreaterThanOrEqual(1);
      expect(stride, `stride at rung ${r}`).toBeLessThanOrEqual(4); // under half a second even at 8 fps
    }
    expect(profileFor(MAX_RUNG).viewClearStride).toBe(1);
  });

  it('the two lowest tiers draw no shadows and no flame lights', () => {
    for (let r = 0; r <= rungOfPreset('low') + 1; r++) {
      expect(profileFor(r).shadows).toBe(false);
      expect(profileFor(r).flameLights).toBe(0);
    }
  });

  it('keeps one representative profile per coarse tier and clamps odd rungs', () => {
    expect(QUALITY.veryLow.level).toBe('veryLow');
    expect(QUALITY.low.level).toBe('low');
    expect(QUALITY.medium.level).toBe('medium');
    expect(QUALITY.high.level).toBe('high');
    expect(profileFor(-5).rung).toBe(0);
    expect(profileFor(999).rung).toBe(MAX_RUNG);
    expect(profileFor(Number.NaN).rung).toBe(0);
  });

  it('resolves settings: presets are anchors, auto uses the fallback, junk is rejected', () => {
    for (const s of QUALITY_SETTINGS) expect(isQualitySetting(s)).toBe(true);
    expect(isQualitySetting('ultra')).toBe(false);
    expect(isQualitySetting(undefined)).toBe(false);
    expect(rungOfSetting('medium', 2)).toBe(rungOfPreset('medium'));
    expect(rungOfSetting('auto', 3)).toBe(3);
    expect(rungOfSetting('auto', 99)).toBe(MAX_RUNG);
  });
});
