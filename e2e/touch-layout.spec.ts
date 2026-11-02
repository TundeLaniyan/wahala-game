/**
 * Touch layout (decisions MC1-MC3): exactly two action buttons, the first action (GENERATOR) the lower-left button of the cluster and the second diagonally above and right of
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
      const text = (sel: string) => (document.querySelector(sel) as HTMLElement).innerText;
      const rect = (sel: string) =>
        [...document.querySelectorAll(sel)].map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height };
        });
      const corners = (
        window as unknown as {
          __WAHALA__: { renderer(): { boardScreenCorners(): { x: number; y: number }[] | null } };
        }
      ).__WAHALA__
        .renderer()
        .boardScreenCorners();
      // the painted content of a button (each text run's glyph box and the icon): what must stay inside the circle
      const content = (sel: string) => {
        const btn = document.querySelector(sel)!;
        const out: { x: number; y: number; w: number; h: number }[] = [];
        const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const r = range.getBoundingClientRect();
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
        for (const img of btn.querySelectorAll('img')) {
          const r = img.getBoundingClientRect();
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
        return out;
      };
      return {
        aContent: content('[data-testid="btn-place"]'),
        bContent: content('[data-testid="btn-special"]'),
        aText: text('[data-testid="btn-place"]'),
        bText: text('[data-testid="btn-special"]'),
        aIcon: !!document.querySelector('[data-testid="btn-place"] img'),
        aAria: document.querySelector('[data-testid="btn-place"]')!.getAttribute('aria-label') ?? '',
        bAria: document.querySelector('[data-testid="btn-special"]')!.getAttribute('aria-label') ?? '',
        keyLetters: document.querySelectorAll('.abtn-key').length,
        board: corners,
        hud: rect('[data-testid="inventory"], .timer, .portrait, .round-btn, [data-testid="hud-rail"]'),
        a: b('[data-testid="btn-place"]'),
        b: b('[data-testid="btn-special"]'),
        pad: b('[data-testid="stick-pad"]'),
        count: document.querySelectorAll('.abtn').length,
        vw: innerWidth,
        vh: innerHeight,
      };
    });
  const centre = (r: Box) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  /**
   * How far the painted content of a round button pokes out of its usable face, in px (<= 0 = fully inside).
   * The face is the circle minus the 3 px border and a 2 px margin; every corner of every text run and icon
   * box must lie inside it, so no glyph is ever clipped by the circular edge.
   */
  const spill = (button: Box, content: Box[]): number => {
    const c = centre(button);
    const face = button.w / 2 - 5;
    let worst = -Infinity;
    for (const r of content)
      for (const [px, py] of [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x, r.y + r.h],
        [r.x + r.w, r.y + r.h],
      ] as const)
        worst = Math.max(worst, Math.hypot(px - c.x, py - c.y) - face);
    return worst;
  };
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
    test(`${name} ${w}x${h}: A lower-left, B diagonally above-right, clear of edges, big pad`, async ({
      page,
    }, info) => {
      await enter(page, w, h);
      const m = await boxes(page);
      expect(m.count).toBe(2);
      const a = centre(m.a);
      const b = centre(m.b);
      // A is the lower-left button of the cluster, B sits above and to the right of it (a physical controller)
      expect(b.x).toBeGreaterThan(a.x);
      expect(b.y).toBeLessThan(a.y);
      // diagonal, not stacked: the horizontal offset is a real share of the button size (>= 25 % of A)
      expect(b.x - a.x).toBeGreaterThanOrEqual(m.a.w * 0.25);
      // round buttons: their circles never touch (the square boxes may share a corner)
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual((m.a.w + m.b.w) / 2);
      // the cluster lives in the lower-right of the screen
      expect(a.x).toBeGreaterThan(m.vw * 0.5); // A, the cluster's left button, is still in the right half
      expect(b.x).toBeGreaterThan(m.vw * 0.6);
      expect(a.y).toBeGreaterThan(m.vh * 0.55);
      // tap targets >= 44 px, A at least as big as B
      expect(m.b.w).toBeGreaterThanOrEqual(44);
      expect(m.a.w).toBeGreaterThanOrEqual(m.b.w);
      // large practical buttons (decision MC3): the old landscape sizes were 19 / 17 vh
      const landscape = m.vw > m.vh;
      if (landscape) {
        expect(m.a.w).toBeGreaterThanOrEqual(m.vh * 0.225);
        expect(m.b.w).toBeGreaterThanOrEqual(m.vh * 0.2);
      } else {
        expect(m.a.w).toBeGreaterThanOrEqual(m.vw * 0.3);
        expect(m.b.w).toBeGreaterThanOrEqual(m.vw * 0.22);
      }
      // far enough apart that a thumb cannot hit the wrong one: a gap of at least 8 px between the edges
      expect(Math.hypot(b.x - a.x, b.y - a.y) - (m.a.w + m.b.w) / 2).toBeGreaterThanOrEqual(8);
      // the buttons name their action and show its icon: no controller letters anywhere
      expect(m.keyLetters).toBe(0);
      expect(m.aText.split(/\s+/).filter(Boolean)).toContain('GENERATOR');
      expect(m.aIcon).toBe(true);
      // nothing is clipped by the round edge: the full GENERATOR word and its icon sit inside the face
      expect(m.aContent.length).toBeGreaterThanOrEqual(2);
      expect(spill(m.a, m.aContent), 'GENERATOR + icon inside the circle').toBeLessThanOrEqual(0);
      expect(spill(m.b, m.bContent), 'second label inside the circle').toBeLessThanOrEqual(0);
      expect(m.bText.trim()).toBe('PUNCH'); // streetBaller's own ability (the vehicle replaces it with a voucher)
      for (const t of [m.aText, m.bText]) expect(t.split(/\s+/).filter(Boolean)).not.toContain('A');
      for (const t of [m.aText, m.bText]) expect(t.split(/\s+/).filter(Boolean)).not.toContain('B');
      expect(`${m.aAria}|${m.bAria}`).not.toMatch(/(^|\|)[AB]:/);
      // never over the board or the HUD (landscape: the playable layout; portrait shows the rotate notice)
      if (landscape) {
        const quad = m.board!;
        const inside = (px: number, py: number) => {
          let sign = 0;
          for (let i = 0; i < quad.length; i++) {
            const p1 = quad[i]!;
            const p2 = quad[(i + 1) % quad.length]!;
            const cross = (p2.x - p1.x) * (py - p1.y) - (p2.y - p1.y) * (px - p1.x);
            if (cross !== 0) {
              if (sign !== 0 && Math.sign(cross) !== sign) return false;
              sign = Math.sign(cross);
            }
          }
          return true;
        };
        for (const [name, r] of [
          ['A', m.a],
          ['B', m.b],
        ] as const) {
          const c = centre(r);
          const pts = [
            [c.x, c.y],
            ...Array.from({ length: 24 }, (_, i) => [
              c.x + (r.w / 2) * Math.cos((i / 24) * 2 * Math.PI),
              c.y + (r.w / 2) * Math.sin((i / 24) * 2 * Math.PI),
            ]),
          ];
          expect(pts.filter(([px, py]) => inside(px!, py!)).length, `${name} covers the board`).toBe(0);
          for (const h of m.hud) expect(overlap(r, h), `${name} covers a HUD element`).toBe(false);
        }
      }
      // away from the screen edge (>= 12 px) on the right and bottom
      expect(m.vw - Math.max(m.a.x + m.a.w, m.b.x + m.b.w)).toBeGreaterThanOrEqual(12);
      expect(m.vh - (m.a.y + m.a.h)).toBeGreaterThanOrEqual(12);
      // the movement pad: bounded, clear of the edge, never under the buttons, and big
      expect(m.pad.x).toBeGreaterThanOrEqual(12);
      expect(m.vh - (m.pad.y + m.pad.h)).toBeGreaterThanOrEqual(12);
      expect(overlap(m.pad, m.a) || overlap(m.pad, m.b)).toBe(false);
      expect(m.pad.w).toBeGreaterThanOrEqual(Math.min(90, m.vh * 0.25));
      expect(m.pad.h).toBeGreaterThanOrEqual(m.pad.w * 0.95);
      await expect(page.getByTestId('stick-pad')).toContainText('press anywhere on this pad');
      await page.screenshot({ path: `e2e-shots/${info.project.name}-controls-${w}x${h}.png` });
      // a close-up of the cluster for the art review
      const pad = 16;
      await page.screenshot({
        path: `e2e-shots/${info.project.name}-controls-cluster-${w}x${h}.png`,
        clip: {
          x: Math.max(0, Math.min(m.a.x, m.b.x) - pad),
          y: Math.max(0, Math.min(m.a.y, m.b.y) - pad),
          width:
            Math.min(m.vw, Math.max(m.a.x + m.a.w, m.b.x + m.b.w) + pad) -
            Math.max(0, Math.min(m.a.x, m.b.x) - pad),
          height: Math.min(m.vh, m.a.y + m.a.h + pad) - Math.max(0, Math.min(m.a.y, m.b.y) - pad),
        },
      });
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
      expect(m.vw - Math.max(m.a.x + m.a.w, m.b.x + m.b.w)).toBeGreaterThanOrEqual(inset.r + 6);
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

  test('the second action names what it does: the vehicle (with its icon) when there is a voucher, the ability otherwise', async ({
    page,
  }, info) => {
    await enter(page, 844, 390);
    const b = page.getByTestId('btn-special');
    await expect(b).toHaveText(/PUNCH/);
    await mutate(page, `s.players[0].hasVoucher = true;`);
    await page.evaluate(() =>
      (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
    );
    await expect(b).toHaveText(/DANFO/);
    await expect(b.locator('img')).toHaveCount(1);
    await expect(b).toHaveAttribute('data-special', 'vehicle');
    expect(await b.getAttribute('aria-label')).toBe('DANFO');
    await page.screenshot({ path: `e2e-shots/${info.project.name}-controls-vehicle.png` });
  });

  // Decision MC4: every label stays inside its round button at every landscape size, in every state: the
  // plain labels, the remote-ready "HOLD: BOOM!" line, and each vehicle name (YELLOW CAB is the longest).
  for (const [w, h, name] of SIZES.filter(([vw, vh]) => vw > vh)) {
    test(`labels stay inside the round buttons ${w}x${h} (${name}): ability, remote line and every vehicle`, async ({
      page,
    }) => {
      await enter(page, w, h);
      const settle = () =>
        page.evaluate(() =>
          (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
        );
      const check = async (what: string, aText: RegExp, bText: RegExp): Promise<void> => {
        // the HUD publishes on rendered frames (throttled): advance until it shows the state under test
        let m = await boxes(page);
        for (let i = 0; i < 20 && !(aText.test(m.aText) && bText.test(m.bText)); i++) {
          await settle();
          await page.waitForTimeout(60);
          m = await boxes(page);
        }
        expect(m.aText, `${what}: A text`).toMatch(aText);
        expect(m.bText, `${what}: B text`).toMatch(bText);
        expect(spill(m.a, m.aContent), `${what}: A inside the circle`).toBeLessThanOrEqual(0);
        expect(spill(m.b, m.bContent), `${what}: B inside the circle`).toBeLessThanOrEqual(0);
        // the words are not shrunk to nothing: GENERATOR is at least 7 px tall text on the narrowest phone
        const size = await page.evaluate(() =>
          parseFloat(getComputedStyle(document.querySelector('[data-testid="btn-place"] b')!).fontSize),
        );
        expect(size, `${what}: label size`).toBeGreaterThanOrEqual(7);
      };
      await check('ability', /GENERATOR/, /PUNCH/);
      for (const [character, vehicle] of [
        ['streetBaller', /DANFO/],
        ['lekkiBoy', /YELLOW CAB/],
        ['campusQueen', /KEKE/],
      ] as const) {
        await mutate(page, `s.players[0].characterId = '${character}'; s.players[0].hasVoucher = false;`);
        await check(`${character} ability`, /GENERATOR/, /PUNCH|DAZE|SHOVE/);
        await mutate(page, `s.players[0].hasVoucher = true;`);
        await check(`${character} vehicle`, /GENERATOR/, vehicle);
      }
      const place = page.getByTestId('btn-place');
      await place.dispatchEvent('pointerdown', { pointerId: 9, isPrimary: true, pointerType: 'touch' });
      await place.dispatchEvent('pointerup', { pointerId: 9, isPrimary: true, pointerType: 'touch' });
      await stepTicks(page, 2);
      await mutate(
        page,
        `s.players[0].remote = true; s.generators.forEach((g) => { if (g.ownerId === 0) g.mode = 'remote'; });`,
      );
      await check('remote ready', /GENERATOR\s+HOLD: BOOM!/, /HOLD: BOOM!/);
    });
  }

  test('spectator state: once the player is out only the THROW button remains, named as such', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page, '&nobots');
    await page.evaluate(() => {
      const st = (
        window as unknown as {
          __WAHALA__: { store: { getState(): { settings: object }; setState(p: object): void } };
        }
      ).__WAHALA__.store;
      st.setState({ settings: { ...st.getState().settings, play: 'classic' } });
    });
    await startMatch(page, { competitors: 3 });
    await mutate(
      page,
      `const me = s.players[0]; me.alive = false; me.eliminatedTick = s.tick; me.elimination = { kind: 'crush', eventId: 0 };
       me.spectator = { pos: 0, readyTick: s.tick, stepRemaining: 0 };`,
    );
    await page.evaluate(() =>
      (window as never as { __WAHALA__: { advance(n: number): void } }).__WAHALA__.advance(1),
    );
    await expect(page.getByTestId('btn-throw')).toBeVisible();
    await expect(page.getByTestId('btn-throw')).toHaveText('THROW');
    await expect(page.getByTestId('btn-place')).toHaveCount(0);
    await expect(page.getByTestId('btn-special')).toHaveCount(0);
    await page.screenshot({ path: `e2e-shots/${info.project.name}-controls-spectator.png` });
  });
});
