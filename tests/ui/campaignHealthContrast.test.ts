/**
 * Day and night readability of the campaign health meter (docs/CAMPAIGN_TEXT_NARRATION.md): every text colour keeps a
 * WCAG AA contrast (>= 4.5:1) against the rail plate composited over WHITE (a day board) and over BLACK (night), and
 * every segment / chip border keeps a 3:1 non-text contrast, so the meter reads without colour alone and in the dark.
 * The colours are read from the stylesheet, so a change there is checked here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/ui/CampaignHealth.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

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
const over = (colour: RGB, alpha: number, under: RGB): RGB =>
  colour.map((v, i) => Math.round(v * alpha + under[i]! * (1 - alpha))) as RGB;
const plate = (backdrop: number): RGB => over([10, 12, 16], 0.88, [backdrop, backdrop, backdrop]);

/** The declaration `prop: #rrggbb` of the rule whose selector list contains `selector`. */
function valueOf(selector: string, prop: 'color' | 'border-color' | 'background'): string {
  const rule = css.split('}').find((r) =>
    r
      .split('{')[0]!
      .split(',')
      .map((x) => x.trim())
      .includes(selector),
  );
  const re =
    prop === 'border-color'
      ? /(?<![-\w])border(?:-color)?:\s*[^;#]*(#[0-9a-f]{6})/i
      : new RegExp(`(?<![-\\w])${prop}:\\s*(#[0-9a-f]{6})`, 'i');
  const m = rule && re.exec(rule);
  if (!m) throw new Error(`no ${prop} for ${selector}`);
  return m[1]!.toLowerCase();
}

describe('the plate is the rail plate', () => {
  it('uses the same dark translucent plate as the mission panel', () => {
    expect(css).toMatch(/\.campaign-health,[\s\S]*?rgba\(10, 12, 16, 0\.88\)/);
  });
});

describe.each([
  ['day (a white board behind)', 255],
  ['night (a black board behind)', 0],
])('contrast on %s', (_name, backdrop) => {
  const bg = plate(backdrop);

  it.each([
    ['.hud-rail .campaign-health', 'color'],
    ['.hud-rail .boss-bar', 'color'],
    ['.ch-title', 'color'],
    ['.ch-text', 'color'],
    ['.ch-chip', 'color'],
    ['.ch-chip.active', 'color'],
    ['.ch-chip.low', 'color'],
    ['.ch-chip.used', 'color'],
    ['.ch-cause', 'color'],
  ] as const)('%s text is readable (AA)', (selector, prop) => {
    expect(
      ratio(hex(valueOf(selector, prop)), bg),
      `${selector} ${valueOf(selector, prop)}`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['.ch-seg', 'border-color'],
    ['.ch-seg.full', 'background'],
    ['.ch-seg.lost', 'background'],
    ['.low .ch-seg.full', 'background'],
    ['.boss-segs .ch-seg.full', 'background'],
    ['.boss-bar.lieutenant .boss-segs .ch-seg.full', 'background'],
    ['.ch-chip.ready', 'border-color'],
  ] as const)('%s keeps a 3:1 shape contrast', (selector, prop) => {
    expect(
      ratio(hex(valueOf(selector, prop)), bg),
      `${selector} ${valueOf(selector, prop)}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('the empty segment outline reads against the plate', () => {
    expect(ratio(hex(valueOf('.ch-seg', 'border-color')), bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('the meter never relies on colour alone', () => {
  it('a segment lost is an empty outline versus a filled block, and a used chip is struck through and dashed', () => {
    expect(css).toMatch(/\.ch-seg\s*{[^}]*background:\s*transparent/);
    expect(css).toMatch(/\.ch-chip\.used\s*{[^}]*text-decoration:\s*line-through/);
    expect(css).toMatch(/\.ch-chip\.used\s*{[^}]*border-style:\s*dashed/);
  });
});
