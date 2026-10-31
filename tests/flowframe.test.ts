/**
 * FlowFrame Performance (decision FP1): the brand is defined in one place, appears on the loading screen with
 * its description, and the adaptive-quality behaviour and notices it names are unchanged.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FLOWFRAME } from '../src/render/perf';
import * as perf from '../src/render/perf';
import { FlowFrameMark } from '../src/ui/FlowFrameMark';
import { qualityNoticeText } from '../src/app/qualityNotice';
import type { QualityChange } from '../src/render/perf';
import { AdaptiveQuality } from '../src/render/perf';

const src = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('the FlowFrame Performance brand', () => {
  it('is named once, as an internal product name, with a plain-language description', () => {
    expect(FLOWFRAME.name).toBe('FlowFrame Performance');
    expect(FLOWFRAME.shortName).toBe('FlowFrame');
    expect(FLOWFRAME.description).toMatch(
      /adjusts the game's rendering quality to match your device's available performance/,
    );
    expect(FLOWFRAME.description).not.toMatch(/™|®|registered|trademark/i);
    expect(perf.FLOWFRAME).toBe(FLOWFRAME); // re-exported from the module's public surface
  });

  it('is the only place the name is written in source (renaming is one edit)', () => {
    for (const file of [
      'src/ui/menu/MainMenu.tsx',
      'src/ui/FlowFrameMark.tsx',
      'src/app/qualityNotice.ts',
      'src/render/perf/adaptive.ts',
      'src/render/perf/capabilities.ts',
      'src/render/perf/learned.ts',
    ])
      expect(src(file), file).not.toMatch(/FlowFrame Performance/);
  });

  it('draws the mark from the central definition', () => {
    const html = renderToStaticMarkup(createElement(FlowFrameMark, { size: 30 }));
    expect(html).toContain('data-testid="flowframe-mark"');
    expect(html).toContain('width="30"');
    for (const d of FLOWFRAME.mark.paths) expect(html).toContain(d);
  });

  it('the brand module is dependency-free so the folder can be lifted into another game', () => {
    expect(src('src/render/perf/brand.ts')).not.toMatch(/^import /m);
  });

  it('the loading screen shows the mark, the name and the description', () => {
    const menu = src('src/ui/menu/MainMenu.tsx');
    expect(menu).toMatch(/FlowFrameMark/);
    expect(menu).toMatch(/FLOWFRAME\.name/);
    expect(menu).toMatch(/FLOWFRAME\.description/);
    expect(menu).toMatch(/data-testid="flowframe-note"/);
  });
});

describe('the adaptive behaviour it names is unchanged', () => {
  const change = (from: number, to: number, reason: QualityChange['reason']): QualityChange => ({
    from,
    to,
    direction: to < from ? 'down' : 'up',
    reason,
    fps: 30,
    at: 10,
  });

  it('keeps the quality notices word for word', () => {
    expect(qualityNoticeText(change(2, 0, 'severe'))).toBe('Graphics reduced · Very Low');
    expect(qualityNoticeText(change(4, 5, 'headroom'))).toBe('Graphics increased · Medium');
  });

  it('still steps down one rung on sustained slow frames and up again with headroom (full coverage: render/adaptive-quality.test.ts)', () => {
    const q = new AdaptiveQuality({ start: 5, now: 0 });
    let now = 0;
    const feed = (fps: number, seconds: number): QualityChange[] => {
      const out: QualityChange[] = [];
      const dt = 1 / fps;
      for (const end = now + seconds; now < end;) {
        now += dt;
        const c = q.frame(dt, now, {});
        if (c) out.push(c);
      }
      return out;
    };
    expect(feed(30, 6)).toEqual([]);
    const down = feed(30, 6);
    expect(down).toHaveLength(1);
    expect(down[0]).toMatchObject({ from: 5, to: 4, direction: 'down', reason: 'sustained-slow' });
    const up = feed(60, 80).filter((c) => c.direction === 'up');
    expect(up.length).toBeGreaterThan(0);
    expect(qualityNoticeText(up[0]!)).toMatch(/^Graphics increased · /);
  });
});
