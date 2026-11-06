/**
 * The field mission's objective block (ui/FieldGoal.tsx, docs/CHECKPOINT_CLARITY.md): static render of the tag, the
 * target and the door hold bar from a real simulated mission, the mission panel without a boss row in a field mission,
 * and the WCAG AA contrast of every FieldGoal.css text colour on the rail plate by day and by night.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { missionView } from '../../src/sim';
import { FieldGoal } from '../../src/ui/FieldGoal';
import { MissionPanel } from '../../src/ui/MissionPanel';
import { advance, put } from '../mission-helpers';
import { newField } from '../field-helpers';

const html = (mission: ReturnType<typeof missionView>): string =>
  renderToStaticMarkup(createElement(FieldGoal, { mission }));

describe('FieldGoal block', () => {
  it('GO TO CHECKPOINT A 1 OF 3, no hold bar, the walk-through note', () => {
    const s = newField('oshodi.approach');
    advance(s, 1);
    const out = html(missionView(s));
    expect(out).toContain('data-verb="goTo"');
    expect(out).toContain('GO TO');
    expect(out).toContain('CHECKPOINT A');
    expect(out).toContain('1 OF 3');
    expect(out).toContain('WALK THROUGH, NO WAITING');
    expect(out).not.toContain('data-testid="field-hold"');
  });

  it('HOLD the depot door: the bar fills while standing and drains after a step off', () => {
    const s = newField('oshodi.approach');
    for (const [x, y] of [
      [9, 39],
      [19, 39],
      [26, 40],
    ] as const) {
      put(s, 0, x, y);
      advance(s, 1);
    }
    put(s, 0, 25, 44);
    advance(s, 24);
    let out = html(missionView(s));
    expect(out).toContain('data-verb="hold"');
    expect(out).toContain('DISPATCH DEPOT DOOR');
    expect(out).toContain('data-state="filling"');
    expect(out).toContain('HOLD 0.4 / 1.0 s');
    expect(out).toContain('width:40%');
    put(s, 0, 25, 43);
    advance(s, 6);
    out = html(missionView(s));
    expect(out).toContain('data-state="draining"');
    expect(out).toContain('HOLD 0.2 / 1.0 s');
    expect(out).toContain('STEP BACK ON');
  });

  it('renders nothing outside a field mission', () => {
    expect(html(null)).toBe('');
  });

  it('the mission panel of a field mission has no boss row and no generic objective line', () => {
    const s = newField('oshodi.approach');
    advance(s, 1);
    const out = renderToStaticMarkup(createElement(MissionPanel, { mission: missionView(s) }));
    expect(out).not.toContain('data-testid="mission-boss"');
    expect(out).not.toContain('FOLLOW THE ROUTE');
    expect(out).toContain('Walk through the 3 checkpoints. No need to stop.');
  });
});

// ------------------------------------------------------------------ contrast (same method as combatHudContrast)

const css = readFileSync(new URL('../../src/ui/FieldGoal.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
type RGB = [number, number, number];
const lum = (rgb: RGB): number => {
  const c = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const ratio = (a: RGB, b: RGB): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const plate = (backdrop: number): RGB =>
  [10, 12, 16].map((v) => Math.round(v * 0.88 + backdrop * 0.12)) as RGB;
function rule(selector: string): string {
  const r = css.split('}').find((x) =>
    x
      .split('{')[0]!
      .split(',')
      .map((y) => y.trim())
      .includes(selector),
  );
  if (!r) throw new Error(`no rule ${selector}`);
  return r;
}
const colorOf = (selector: string): RGB =>
  hex(/(?<![-\w])color:\s*(#[0-9a-f]{6})/i.exec(rule(selector))![1]!);
const bgOf = (selector: string): RGB => hex(/background:\s*(#[0-9a-f]{6})/i.exec(rule(selector))![1]!);

describe.each([
  ['day', 255],
  ['night', 0],
])('FieldGoal contrast by %s', (_n, backdrop) => {
  it.each(['.field-goal', '.fg-target', '.fg-step', '.fg-hold-text b', '.fg-hold-text span', '.fg-notes'])(
    '%s on the plate >= 4.5:1',
    (sel) => {
      expect(ratio(colorOf(sel), plate(backdrop))).toBeGreaterThanOrEqual(4.5);
    },
  );
  it('the dark tag text on every tag colour >= 4.5:1', () => {
    const ink = colorOf('.fg-tag');
    for (const sel of ['.fg-tag', '.verb-defeat .fg-tag', '.verb-escape .fg-tag', '.verb-hold .fg-tag'])
      expect(ratio(ink, bgOf(sel)), sel).toBeGreaterThanOrEqual(4.5);
  });
});
