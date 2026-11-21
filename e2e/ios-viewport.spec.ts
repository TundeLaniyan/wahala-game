/**
 * iOS viewport (docs/IOS_VIEWPORT.md, decisions IV1-IV6). No WebKit build is available offline, so this runs in
 * Chromium with an iPhone 17 landscape emulation (iPhone Safari user agent, 874 x 402, isMobile, hasTouch, DPR 3) and the
 * page's viewport tag served the way WebKit effectively reads it: WebKit ignores `maximum-scale` / `user-scalable=no`
 * for the player's own zoom, so those two keys are removed here and Chromium lets the page be zoomed like an iPhone
 * does. Real touches go through CDP (`Input.dispatchTouchEvent`: rapid taps, double taps, a two-finger pinch on the pad
 * and the buttons), the toolbar collapse and the rotations are viewport resizes, and a stuck zoom is injected with
 * `Emulation.setPageScaleFactor`. After each step the canvas and the HUD must fit what is visible, nothing may scroll,
 * and each control must be the element under its own drawn box. Safari's `gesture*` events do not exist in Chromium:
 * their cancellation is checked by dispatching them. An Android (Pixel) pass with the real tag guards the regression.
 */
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { getState, open, startMatch, stepTicks } from './helpers';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
const IPHONE = { width: 874, height: 402 };

/**
 * The page as an iPhone sees it: index.html's viewport tag as WebKit applies it to user zoom (no maximum-scale, no
 * user-scalable), and no element fullscreen (an iPhone has none, so enterImmersiveMode does nothing there; Chromium's
 * fullscreen would also pin the page scale at 1).
 */
async function iphonePage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined, configurable: true });
  });
  await page.route(
    (u) => u.pathname === '/wahala-game/' || u.pathname === '/wahala-game/index.html',
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/maximum-scale=1\.0, user-scalable=no, /, '');
      await route.fulfill({ response, body });
    },
  );
}

async function enterMatch(page: Page): Promise<void> {
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

type Box = { l: number; t: number; r: number; b: number };
interface Fit {
  scale: number;
  scrolled: boolean;
  overflow: boolean;
  visible: Box;
  canvas: Box;
  hud: { sel: string; box: Box }[];
  /** For each control: is it the element under the centre and four inner points of its drawn box? */
  hits: { sel: string; ok: boolean }[];
  guard: { zoomed: boolean; fit: boolean } | null;
}

/** Reads the fit in client coordinates: the visible area is the visual viewport inside the layout viewport. */
const readFit = (page: Page): Promise<Fit> =>
  page.evaluate(() => {
    const vv = window.visualViewport!;
    const box = (r: DOMRect) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    const visible = {
      l: vv.offsetLeft,
      t: vv.offsetTop,
      r: vv.offsetLeft + vv.width,
      b: vv.offsetTop + vv.height,
    };
    const canvas = box(document.querySelector('[data-testid="game-canvas"]')!.getBoundingClientRect());
    const HUD = [
      '[data-testid="hud-rail"]',
      '.timer',
      '.top-buttons',
      '[data-testid="btn-place"]',
      '[data-testid="btn-special"]',
      '[data-testid="stick-pad"]',
      '[data-testid="stick-zone"]',
    ];
    const hud = HUD.flatMap((sel) =>
      [...document.querySelectorAll(sel)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ sel, box: box(r) })),
    );
    const hits = [
      '[data-testid="btn-place"]',
      '[data-testid="btn-special"]',
      '[data-testid="stick-pad"]',
    ].map((sel) => {
      const el = document.querySelector(sel)!;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // the centre and four points 30 % of the way to the edge (inside the round buttons' circle)
      const pts = [
        [cx, cy],
        [cx - r.width * 0.3, cy],
        [cx + r.width * 0.3, cy],
        [cx, cy - r.height * 0.3],
        [cx, cy + r.height * 0.3],
      ];
      const owner = sel.includes('stick') ? document.querySelector('[data-testid="stick-zone"]')! : el;
      const ok = pts.every(([x, y]) => {
        const hit = document.elementFromPoint(x!, y!);
        return !!hit && (hit === owner || owner.contains(hit));
      });
      return { sel, ok };
    });
    const de = document.documentElement;
    const guard = (
      window as unknown as { __WAHALA__: { viewport(): { zoomed: boolean; fit: boolean } | null } }
    ).__WAHALA__.viewport();
    return {
      scale: vv.scale,
      scrolled: scrollX !== 0 || scrollY !== 0,
      overflow: de.scrollWidth > de.clientWidth + 1 || de.scrollHeight > de.clientHeight + 1,
      visible,
      canvas,
      hud,
      hits,
      guard,
    };
  });

/** The canvas covers exactly the visible area, every HUD block and control is inside it and hits where drawn. */
async function expectFits(
  page: Page,
  opts: { zoom?: number; controls?: boolean; hud?: boolean } = {},
): Promise<Fit> {
  // the HUD re-measures from frames and resize events: poll until it has settled
  await expect
    .poll(async () => {
      const f = await readFit(page);
      const inside = (b: Box) =>
        b.l >= f.visible.l - 1 && b.t >= f.visible.t - 1 && b.r <= f.visible.r + 1 && b.b <= f.visible.b + 1;
      const near = (a: number, b: number) => Math.abs(a - b) <= 1.5;
      const canvasFits =
        near(f.canvas.l, f.visible.l) &&
        near(f.canvas.t, f.visible.t) &&
        near(f.canvas.r, f.visible.r) &&
        near(f.canvas.b, f.visible.b);
      // upright, the rotate hint covers the match: only the canvas and the page itself are checked there
      const outside = opts.hud === false ? [] : f.hud.filter((h) => !inside(h.box)).map((h) => h.sel);
      const misses = opts.controls === false ? [] : f.hits.filter((h) => !h.ok).map((h) => h.sel);
      return {
        zoom: Math.round(f.scale * 100) / 100,
        scrolled: f.scrolled,
        overflow: f.overflow,
        canvasFits,
        outside,
        misses,
      };
    })
    .toEqual({
      zoom: opts.zoom ?? 1,
      scrolled: false,
      overflow: false,
      canvasFits: true,
      outside: [],
      misses: [],
    });
  return readFit(page);
}

/** One finger down and up at a client point. */
async function tap(cdp: CDPSession, x: number, y: number, id = 1): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** A two-finger pinch: both fingers land, spread apart in steps, lift. */
async function pinch(
  cdp: CDPSession,
  a: [number, number],
  b: [number, number],
  spread: number,
): Promise<void> {
  const pts = (d: number) => [
    { x: a[0] - d, y: a[1], id: 1 },
    { x: b[0] + d, y: b[1], id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
  for (let i = 1; i <= 6; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts((spread * i) / 6) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * A control's drawn centre in client coordinates. Chromium's CDP touches take client (layout-viewport) coordinates even
 * on a zoomed page, so a touch here lands on what is drawn at that spot, through the zoom and the counter-scale.
 */
const centreOf = (page: Page, testId: string): Promise<[number, number]> =>
  page.evaluate((id) => {
    const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }, testId);

/** Safari's gesture events (WebKit only), dispatched by hand: are they cancelled? */
const gestureCancelled = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const e = new Event('gesturestart', { cancelable: true, bubbles: true });
    document.querySelector('[data-testid="game-canvas"]')!.dispatchEvent(e);
    return e.defaultPrevented;
  });

test.describe('iOS viewport (iPhone landscape, WebKit-like emulation in Chromium)', () => {
  test.slow();
  test.use({
    userAgent: IPHONE_UA,
    viewport: IPHONE,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test('rapid taps, double taps, a pinch, a toolbar change and rotations never zoom or misplace the game', async ({
    page,
  }, info) => {
    // test.use emulates the device here, so the desktop project would only repeat it
    test.skip(info.project.name !== 'mobile', 'one project is enough: the device is emulated here');
    await iphonePage(page);
    await enterMatch(page);
    const cdp = await page.context().newCDPSession(page);
    await expectFits(page);
    expect(await gestureCancelled(page)).toBe(true);

    // repeated rapid taps and double taps on A, B and the move pad
    const a = await centreOf(page, 'btn-place');
    const b = await centreOf(page, 'btn-special');
    const pad = await centreOf(page, 'stick-pad');
    for (let i = 0; i < 4; i++) {
      await tap(cdp, ...a);
      await tap(cdp, ...b);
      await tap(cdp, ...pad);
    }
    for (const p of [a, b, pad]) {
      await tap(cdp, ...p);
      await tap(cdp, ...p);
    }
    await stepTicks(page, 2);
    // the taps reached the game: A laid a generator
    expect((await getState(page)).generators.length).toBeGreaterThan(0);
    await expectFits(page);

    // two fingers: thumb on the pad and a finger on A spreading apart, then a pinch across both buttons
    await pinch(cdp, pad, a, 120);
    await pinch(cdp, a, b, 90);
    await expectFits(page);

    // the browser toolbar collapses and comes back mid-match
    await page.setViewportSize({ width: IPHONE.width, height: 360 });
    await expectFits(page);
    await page.setViewportSize(IPHONE);
    await expectFits(page);

    // landscape -> portrait -> landscape (portrait shows the rotate hint over the match; the controls sit under it)
    await page.setViewportSize({ width: IPHONE.height, height: IPHONE.width });
    await expect(page.getByTestId('rotate')).toBeVisible();
    await expectFits(page, { controls: false, hud: false });
    await page.setViewportSize(IPHONE);
    await expect(page.getByTestId('rotate')).toHaveCount(0);
    const after = await expectFits(page);
    expect(after.guard).toMatchObject({ zoomed: false, fit: false });

    // paused: the pause menu is the browser's again (a zoomed player could pinch out there)
    await page.getByTestId('pause-button').click();
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    expect(await gestureCancelled(page)).toBe(false);
  });

  test('a page that is zoomed anyway: the match is counter-scaled into view and its controls still work', async ({
    page,
  }, info) => {
    // test.use emulates the device here, so the desktop project would only repeat it
    test.skip(info.project.name !== 'mobile', 'one project is enough: the device is emulated here');
    await iphonePage(page);
    await enterMatch(page);
    const cdp = await page.context().newCDPSession(page);
    await expectFits(page);

    // what an iPhone can be left with: the page zoomed to 1.6 and panned
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.6 });
    await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeCloseTo(1.6, 2);
    await expect(page.locator('html')).toHaveAttribute('data-vv-fit', '');
    const zoomed = await expectFits(page, { zoom: 1.6 });
    expect(zoomed.guard).toMatchObject({ zoomed: true, fit: true });

    // a tap on A where it is drawn lays a generator; the pad steers from where the thumb lands
    const before = (await getState(page)).generators.length;
    await tap(cdp, ...(await centreOf(page, 'btn-place')));
    await stepTicks(page, 2);
    expect((await getState(page)).generators.length).toBeGreaterThan(before);
    const [px, py] = await centreOf(page, 'stick-pad');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: px, y: py, id: 3 }],
    });
    // the stick is drawn where the thumb landed (its origin is mapped into the counter-scaled root)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const r = document.querySelector('.stick')?.getBoundingClientRect();
          return r ? [Math.round(r.left), Math.round(r.top)] : null;
        }),
      )
      .toEqual([Math.round(px), Math.round(py)]);
    for (let i = 1; i <= 4; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: px + i * 14, y: py, id: 3 }],
      });
    await expect(page.getByTestId('stick-zone')).toHaveAttribute('data-dir', 'right');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByTestId('stick-zone')).toHaveAttribute('data-dir', '');

    // rapid taps and a pinch on the zoomed page change nothing
    for (let i = 0; i < 3; i++) await tap(cdp, ...(await centreOf(page, 'btn-special')));
    await pinch(cdp, await centreOf(page, 'stick-pad'), await centreOf(page, 'btn-place'), 80);
    await expectFits(page, { zoom: 1.6 });

    // the zoom goes away (pinched out from the pause menu): the normal layout is back, no state lost
    const tick = (await getState(page)).tick;
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBe(1);
    await expect(page.locator('html')).not.toHaveAttribute('data-vv-fit', '');
    const back = await expectFits(page);
    expect(back.guard).toMatchObject({ zoomed: false, fit: false });
    expect((await getState(page)).tick).toBeGreaterThanOrEqual(tick);
    expect((await getState(page)).phase).toBe('playing');
  });
});

test.describe('Android viewport regression (Pixel, real viewport tag)', () => {
  test.slow();
  test.use({ viewport: { width: 915, height: 412 } });

  test('taps, a pinch and a rotation keep the page unzoomed and the controls in place', async ({
    page,
  }, info) => {
    // test.use emulates the device here, so the desktop project would only repeat it
    test.skip(info.project.name !== 'mobile', 'one project is enough: the device is emulated here');
    await enterMatch(page);
    const cdp = await page.context().newCDPSession(page);
    await expectFits(page);
    const a = await centreOf(page, 'btn-place');
    const b = await centreOf(page, 'btn-special');
    for (let i = 0; i < 3; i++) {
      await tap(cdp, ...a);
      await tap(cdp, ...b);
    }
    await stepTicks(page, 2);
    expect((await getState(page)).generators.length).toBeGreaterThan(0);
    await pinch(cdp, await centreOf(page, 'stick-pad'), a, 120);
    await expectFits(page);
    await page.setViewportSize({ width: 412, height: 915 });
    await expectFits(page, { controls: false, hud: false });
    await page.setViewportSize({ width: 915, height: 412 });
    const f = await expectFits(page);
    expect(f.guard).toMatchObject({ zoomed: false, fit: false });
  });
});
