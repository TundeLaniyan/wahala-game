/**
 * Touch layout (decision MC1): exactly two action buttons, A in the lower-right and B diagonally above-left of
 * it (never stacked), the cluster clear of the screen edge and the safe areas, a large movement pad that says
 * the whole pad is the touch area, and visible pressed / disabled / remote states. Portrait, landscape, narrow
 * phones and safe-area devices (the safe areas are simulated with the --test-sa-* variables the touch layer
 * reads next to env(safe-area-inset-*)).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mutate, open, startMatch, stepTicks } from './helpers';

test.describe('touch layout', () => {
  test.slow();
  test.skip(({ isMobile }) => !isMobile, 'mobile project only');

  const SIZES = [
    [844, 390, 'landscape iPhone 14'],
    [667, 375, 'landscape iPhone 8'],
    [568, 320, 'landscape iPhone SE (narrowest)'],
    [740, 360, 'landscape Android'],
    [932, 430, 'landscape Pro Max'],
    [390, 844, 'portrait iPhone 14'],
    [360, 640, 'portrait narrow Android'],
    [320, 568, 'portrait iPhone SE (narrowest)'],
  ] as const;

  type Box = { x: number; y: number; w: number; h: number };
  const boxes = (page: Page) =>
    page.evaluate(() => {
      const b = (sel: string) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      };
      return {
        a: b('[data-testid="btn-place"]'),
        b: b('[data-testid="btn-special"]'),
        pad: b('[data-testid="stick-pad"]'),
        count: document.querySelectorAll('.abtn').length,
        vw: innerWidth,
        vh: innerHeight,
      };
    });
  const centre = (r: Box) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const overlap = (p: Box, q: Box) =>
    p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;

  async function enter(page: Page, w: number, h: number): Promise<void> {
    await page.setViewportSize({ width: w, height: h });
    await open(page, '&nobots');
    await page.evaluate(() => {
      const st = (
        window as unknown as {
          __WAHALA__: { store: { getState(): { settings: object }; setState(p: object): void } };
        }
      ).__WAHALA__.store;
      st.setState({ settings: { ...st.getState().settings, play: 'classic' } });
    });
    await startMatch(page, { competitors: 2 });
    await page.evaluate(() =>
      (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
    );
    await expect(page.getByTestId('btn-special')).toBeVisible();
  }

  for (const [w, h, name] of SIZES) {
    test(`${name} ${w}x${h}: A lower-right, B diagonally above-left, clear of edges, big pad`, async ({
      page,
    }, info) => {
      await enter(page, w, h);
      const m = await boxes(page);
      expect(m.count).toBe(2);
      const a = centre(m.a);
      const b = centre(m.b);
      // A is the lower-right button, B sits above and to the left of it
      expect(b.x).toBeLessThan(a.x);
      expect(b.y).toBeLessThan(a.y);
      // diagonal, not stacked: the horizontal offset is a real share of the button size (>= 25 % of A)
      expect(a.x - b.x).toBeGreaterThanOrEqual(m.a.w * 0.25);
      // round buttons: their circles never touch (the square boxes may share a corner)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual((m.a.w + m.b.w) / 2);
      // A is in the lower-right quarter of the screen
      expect(a.x).toBeGreaterThan(m.vw * 0.6);
      expect(a.y).toBeGreaterThan(m.vh * 0.55);
      // tap targets >= 44 px, A at least as big as B
      expect(m.b.w).toBeGreaterThanOrEqual(44);
      expect(m.a.w).toBeGreaterThanOrEqual(m.b.w);
      // away from the screen edge (>= 12 px) on the right and bottom
      expect(m.vw - (m.a.x + m.a.w)).toBeGreaterThanOrEqual(12);
      expect(m.vh - (m.a.y + m.a.h)).toBeGreaterThanOrEqual(12);
      // the movement pad: bounded, clear of the edge, never under the buttons, and big
      expect(m.pad.x).toBeGreaterThanOrEqual(12);
      expect(m.vh - (m.pad.y + m.pad.h)).toBeGreaterThanOrEqual(12);
      expect(overlap(m.pad, m.a) || overlap(m.pad, m.b)).toBe(false);
      expect(m.pad.w).toBeGreaterThanOrEqual(Math.min(90, m.vh * 0.25));
      expect(m.pad.h).toBeGreaterThanOrEqual(m.pad.w * 0.95);
      await expect(page.getByTestId('stick-pad')).toContainText('press anywhere on this pad');
      await page.screenshot({ path: `e2e-shots/${info.project.name}-controls-${w}x${h}.png` });
    });
  }

  for (const [w, h] of [
    [844, 390],
    [390, 844],
  ] as const) {
    test(`${w}x${h} with a notch and home indicator: the cluster and the pad stay inside the safe areas`, async ({
      page,
    }, info) => {
      await enter(page, w, h);
      // landscape notch 48 px each side, home indicator 21 px (portrait: 34 px)
      const inset = w > h ? { l: 48, r: 48, b: 21 } : { l: 0, r: 0, b: 34 };
      await page.evaluate((i) => {
        const root = document.documentElement.style;
        root.setProperty('--test-sa-l', `${i.l}px`);
        root.setProperty('--test-sa-r', `${i.r}px`);
        root.setProperty('--test-sa-b', `${i.b}px`);
      }, inset);
      const m = await boxes(page);
      expect(m.vw - (m.a.x + m.a.w)).toBeGreaterThanOrEqual(inset.r + 6);
      expect(m.vh - (m.a.y + m.a.h)).toBeGreaterThanOrEqual(inset.b + 6);
      expect(m.pad.x).toBeGreaterThanOrEqual(inset.l + 6);
      expect(m.vh - (m.pad.y + m.pad.h)).toBeGreaterThanOrEqual(inset.b + 6);
      await page.screenshot({ path: `e2e-shots/${info.project.name}-controls-safe-${w}x${h}.png` });
    });
  }

  test('pressed, held (remote) and disabled states are visible and the buttons still behave', async ({
    page,
  }) => {
    await enter(page, 844, 390);
    const a = page.getByTestId('btn-place');
    const b = page.getByTestId('btn-special');
    await expect(a).toHaveAttribute('data-state', 'idle');
    await expect(b).toHaveAttribute('data-state', 'disabled'); // nothing for B to do: dimmed, but still pressable
    await expect(b).toHaveAttribute('aria-disabled', 'true');

    // pressed: a finger is down
    await a.dispatchEvent('pointerdown', { pointerId: 5, isPrimary: true, pointerType: 'touch' });
    await expect(a).toHaveAttribute('data-state', 'pressed');
    await a.dispatchEvent('pointerup', { pointerId: 5, isPrimary: true, pointerType: 'touch' });
    await expect(a).toHaveAttribute('data-state', 'idle');
    await stepTicks(page, 2);
    const placed = await page.evaluate(
      () =>
        (window as never as { __WAHALA__: { getState(): { generators: unknown[] } } }).__WAHALA__.getState()
          .generators.length,
    );
    expect(placed).toBeGreaterThanOrEqual(1); // A still places a generator

    // every generator out: A reads as disabled (a press would do nothing)
    await mutate(page, `s.players[0].capacity = 1;`);
    await page.evaluate(() =>
      (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
    );
    await expect(a).toHaveAttribute('data-state', 'disabled');

    // remote detonation: a remote generator is waiting
    await mutate(
      page,
      `s.players[0].remote = true; s.generators.forEach((g) => { if (g.ownerId === 0) g.mode = 'remote'; });`,
    );
    await page.evaluate(() =>
      (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
    );
    await expect(a).toHaveAttribute('data-state', 'remote');
    await expect(a).toContainText('HOLD: BOOM!');
    await a.dispatchEvent('pointerdown', { pointerId: 6, isPrimary: true, pointerType: 'touch' });
    await expect(a).toHaveAttribute('data-state', 'holding');
    await a.dispatchEvent('pointerup', { pointerId: 6, isPrimary: true, pointerType: 'touch' });
  });
});
