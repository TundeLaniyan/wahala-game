import { describe, expect, it } from 'vitest';
import { NOTICE_LEFT, intersects, noticeColumn, playZone } from '../../src/ui/hudZones';
import type { Rect } from '../../src/ui/hudZones';

const VIEWPORTS: [string, number, number][] = [
  ['desktop 1280x720', 1280, 720],
  ['desktop 1920x1080', 1920, 1080],
  ['phone landscape 844x390', 844, 390],
  ['phone landscape 667x375', 667, 375],
  ['phone portrait 390x844', 390, 844],
  ['phone portrait 360x740', 360, 740],
];

/** The column's box at the panel's usual bottom (a phone's panel is short, a desktop one holds the lists). */
const column = (vw: number, vh: number, top: number): Rect => {
  const c = noticeColumn(vw, vh, top);
  return { left: NOTICE_LEFT, right: NOTICE_LEFT + c.width, top, bottom: top + c.maxHeight };
};

describe('HUD play zone', () => {
  it('is centred horizontally and sits around the middle of the screen', () => {
    for (const [name, vw, vh] of VIEWPORTS) {
      const z = playZone(vw, vh);
      expect((z.left + z.right) / 2, name).toBeCloseTo(vw / 2, 5);
      expect(z.top, name).toBeLessThan(vh / 2);
      expect(z.bottom, name).toBeGreaterThan(vh / 2);
    }
  });

  it('scales with the smaller screen side but stays bounded', () => {
    const small = playZone(390, 390);
    const big = playZone(1920, 1080);
    expect(small.right - small.left).toBeLessThan(big.right - big.left);
    expect(big.right - big.left).toBeLessThanOrEqual(300);
  });
});

describe('notice column', () => {
  it('never enters the play zone, at any viewport and panel height', () => {
    for (const [name, vw, vh] of VIEWPORTS)
      for (const top of [60, 100, 160, 260]) {
        const zone = playZone(vw, vh);
        const box = column(vw, vh, top);
        if (box.bottom > box.top) expect(intersects(box, zone), `${name} top ${top}`).toBe(false);
      }
  });

  it('hangs on the left edge and is as wide as the Rumble panel', () => {
    expect(noticeColumn(1280, 720, 100).width).toBe(250);
    expect(noticeColumn(844, 390, 100).width).toBe(186);
    expect(noticeColumn(390, 844, 100).width).toBe(180);
  });

  it('on a wide screen it may use most of the left edge; in portrait it stops above the fighter', () => {
    expect(noticeColumn(1280, 720, 100).maxHeight).toBe(Math.floor(720 * 0.7 - 100));
    const portrait = noticeColumn(390, 844, 100);
    expect(100 + portrait.maxHeight).toBeLessThan(844 * 0.5);
  });

  it('stops above the touch move pad', () => {
    const c = noticeColumn(844, 390, 100, 250);
    expect(100 + c.maxHeight).toBeLessThanOrEqual(240);
  });

  it('is empty rather than negative when the panel leaves no room', () => {
    expect(noticeColumn(390, 844, 800).maxHeight).toBe(0);
  });
});
