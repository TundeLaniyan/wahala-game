/**
 * Day and night readability of the combat HUD text (decisions HC1-HC5): the kill feed, the QUICK HANDS tag, the SUDDEN
 * DEATH status and the mission panel all sit on the rail's dark translucent plate, so the worst case is a bright (day)
 * board behind it. Every text colour must keep a WCAG AA contrast (>= 4.5:1) against its plate composited over WHITE
 * (day) and over BLACK (night). The colours are read from the stylesheets, so a change there is checked here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string): string =>
  readFileSync(new URL(`../../src/ui/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const kill = read('KillFeed.css');
const mission = read('MissionPanel.css');
const rail = read('HudRail.css');
const sudden = read('SuddenDeath.css');

type RGB = [number, number, number];
const lum = (rgb: RGB): number => {
  const c = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const hex = (h: string): RGB => {
  const m = /^#([0-9a-f]{6})$/i.exec(h)!;
  return [parseInt(m[1]!.slice(0, 2), 16), parseInt(m[1]!.slice(2, 4), 16), parseInt(m[1]!.slice(4), 16)];
};
const ratio = (a: RGB, b: RGB): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
/** `colour` at `alpha` over `under`. */
const over = (colour: RGB, alpha: number, under: RGB): RGB =>
  colour.map((v, i) => Math.round(v * alpha + under[i]! * (1 - alpha))) as RGB;
const flat = (v: number): RGB => [v, v, v];

/** The rail plate rgba(10, 12, 16, 0.88) over a backdrop; the sudden-death plate is rgba(12, 10, 8, 0.9). */
const plate = (backdrop: number): RGB => over([10, 12, 16], 0.88, flat(backdrop));
const sdPlate = (backdrop: number): RGB => over([12, 10, 8], 0.9, flat(backdrop));

/** The `color` declared by the rule whose selector list contains `selector` (exact selector text). */
function colorOf(css: string, selector: string): string {
  const rule = css.split('}').find((r) => {
    const head = r.split('{')[0]!;
    return head
      .split(',')
      .map((x) => x.trim())
      .includes(selector);
  });
  const m = rule && /(?<![-\w])color:\s*(#[0-9a-f]{6})/i.exec(rule);
  if (!m) throw new Error(`no colour for ${selector}`);
  return m[1]!.toLowerCase();
}

describe('the plates are the same by day and by night', () => {
  it('kill feed and mission panel use the rail plate', () => {
    expect(kill).toMatch(/\.kill-feed \.kf-line\s*{[^}]*rgba\(10, 12, 16, 0\.88\)/);
    expect(mission).toMatch(/\.mission-panel\s*{[^}]*rgba\(10, 12, 16, 0\.88\)/);
    expect(sudden).toMatch(/\.sd-clock\s*{[^}]*rgba\(12, 10, 8, 0\.9\)/);
  });
});

describe.each([
  ['day (a white board behind)', 255],
  ['night (a black board behind)', 0],
])('contrast on %s', (_name, backdrop) => {
  const bg = plate(backdrop);
  const AA = 4.5;

  it.each([
    ['.kill-feed .kf-line', kill],
    ['.kill-feed .kf-line.kill', kill],
    ['.kill-feed .kf-line.death', kill],
    ['.kill-feed .kf-line.assist', kill],
    ['.kill-feed .kf-line.other', kill],
    ['.hud-rail .mission-panel', mission],
    ['.hud-rail .mp-phase', mission],
    ['.hud-rail .mp-time', mission],
    ['.hud-rail .mp-objective', mission],
    ['.hud-rail .mp-progress-text', mission],
    ['.hud-rail .mp-callout', mission],
    ['.hud-rail .mp-boss.shielded', mission],
    ['.hud-rail .mp-boss.exposed', mission],
    ['.hud-rail .mp-boss.defeated', mission],
    ['.hud-rail .mp-lives', mission],
    ['.hud-rail .streak-state', rail],
    ['.hud-rail .streak-card.stored .streak-state', rail],
  ])('%s is readable', (selector, css) => {
    expect(
      ratio(hex(colorOf(css, selector)), bg),
      `${selector} ${colorOf(css, selector)}`,
    ).toBeGreaterThanOrEqual(AA);
  });

  it('the cause word sits on a lighter chip on the plate and stays readable', () => {
    const chip = over([255, 255, 255], 0.1, bg);
    expect(ratio(hex(colorOf(kill, '.kill-feed .kf-cause')), chip)).toBeGreaterThanOrEqual(AA);
  });

  it('warning lines sit on a red tint over the plate and stay readable', () => {
    const tint = over([255, 59, 31], 0.14, bg);
    expect(ratio(hex(colorOf(mission, '.hud-rail .mp-warnings li')), tint)).toBeGreaterThanOrEqual(AA);
    expect(ratio(hex(colorOf(mission, '.hud-rail .mp-warnings li.urgent')), tint)).toBeGreaterThanOrEqual(AA);
  });

  it('the sudden-death status colours read on their own plate', () => {
    const sd = sdPlate(backdrop);
    expect(ratio(hex(colorOf(sudden, '.sd-clock .sd-shields')), sd)).toBeGreaterThanOrEqual(AA);
    expect(ratio(hex(colorOf(sudden, '.sd-clock.final .sd-shields')), sd)).toBeGreaterThanOrEqual(AA);
    expect(ratio(hex(colorOf(sudden, '.sd-clock .sd-yours')), sd)).toBeGreaterThanOrEqual(AA);
  });
});
