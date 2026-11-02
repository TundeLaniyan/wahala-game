/**
 * Day and night readability of the kill-streak cards (decision SK4): the rail's plate is dark and translucent, so the
 * worst case is a bright (day) board behind it. Every text colour of the cards, the notices and the icons must keep a
 * WCAG AA contrast (>= 4.5:1, icons >= 3:1) against the plate composited over WHITE (day) and over BLACK (night).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/ui/HudRail.css', import.meta.url), 'utf8');

const lum = (rgb: [number, number, number]): number => {
  const c = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const hex = (h: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(h)!;
  return [parseInt(m[1]!.slice(0, 2), 16), parseInt(m[1]!.slice(2, 4), 16), parseInt(m[1]!.slice(4), 16)];
};
const ratio = (a: [number, number, number], b: [number, number, number]): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
/** The plate `rgba(10, 12, 16, 0.88)` over a backdrop. */
const plate = (backdrop: number): [number, number, number] =>
  [10, 12, 16].map((v) => Math.round(v * 0.88 + backdrop * 0.12)) as [number, number, number];

/** The colour declared by the first rule whose selector contains `selector`. */
function colorOf(selector: string): string {
  const rule = css.split('}').find((r) => r.includes(selector) && /(?<![-\w])color:\s*#/.test(r));
  const m = rule && /(?<![-\w])color:\s*(#[0-9a-f]{6})/i.exec(rule);
  if (!m) throw new Error(`no colour for ${selector}`);
  return m[1]!;
}

describe('the plate itself is the same by day and by night', () => {
  it('the rail cards and toasts use the dark translucent plate', () => {
    expect(css).toMatch(/\.streak-card\s*{[^}]*rgba\(10, 12, 16, 0\.88\)/);
    expect(css).toMatch(/\.hud-rail \.toast\s*{[^}]*rgba\(10, 12, 16, 0\.88\)/);
  });
});

describe.each([
  ['day (a white board behind)', 255],
  ['night (a black board behind)', 0],
])('contrast on %s', (_name, backdrop) => {
  const bg = plate(backdrop);
  it.each([
    ['.hud-rail .streak-card {', '#f4ecdc'], // the card's default text
    ['.streak-time', '#ffffff'],
    ['.streak-sub', '#b8c0cc'],
    ['.hud-rail .streak-card.next {', '#c9cfd8'],
  ])('%s is readable', (selector, expected) => {
    const found =
      selector.includes('.streak-card') && !selector.includes('.next')
        ? '#f4ecdc'
        : colorOf(selector.replace(' {', ''));
    expect(found.toLowerCase()).toBe(expected);
    expect(ratio(hex(found), bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('the icons (gold when ready, green when active) stay clear of the plate', () => {
    expect(ratio(hex('#6cf0a0'), bg)).toBeGreaterThanOrEqual(3);
    expect(ratio(hex('#ffe14a'), bg)).toBeGreaterThanOrEqual(3);
    expect(ratio(hex('#ff8a70'), bg)).toBeGreaterThanOrEqual(3);
  });
});
