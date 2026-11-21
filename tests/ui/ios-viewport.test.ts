/**
 * iOS / WebKit viewport guard (docs/IOS_VIEWPORT.md, decisions IV1-IV6): the pure fit and mapping helpers, and the
 * guard itself on a minimal fake window (gesture blocking only while a match is played, the counter-scale written to
 * <html> when the page is zoomed, the HUD told to measure again, late WebKit sizes re-read).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DOUBLE_TAP_MS,
  IDENTITY_FIT,
  blocksPageGestures,
  installViewportGuard,
  isRapidRepeat,
  mapClientToRoot,
  viewportFit,
} from '../../src/platform/viewport';

describe('viewportFit (pure)', () => {
  it('an unzoomed page keeps the normal layout', () => {
    expect(viewportFit({ offsetLeft: 0, offsetTop: 0, scale: 1 })).toEqual(IDENTITY_FIT);
    // WebKit rounding just above 1 is still unzoomed; a scroll offset alone never transforms the game
    expect(viewportFit({ offsetLeft: 3, offsetTop: 40, scale: 1.004 }).fit).toBe(false);
    expect(viewportFit(null)).toEqual(IDENTITY_FIT);
  });

  it('a zoomed page is counter-scaled into the visible area', () => {
    const f = viewportFit({ offsetLeft: 120, offsetTop: 33.5, scale: 1.6 });
    expect(f).toMatchObject({ zoomed: true, fit: true, left: 120, top: 33.5, pageScale: 1.6 });
    expect(f.scale).toBeCloseTo(1 / 1.6, 3);
  });

  it('bad numbers never produce a broken transform', () => {
    expect(viewportFit({ offsetLeft: NaN, offsetTop: -5, scale: 2 })).toMatchObject({
      left: 0,
      top: 0,
      scale: 0.5,
    });
    expect(viewportFit({ offsetLeft: 0, offsetTop: 0, scale: 0 }).fit).toBe(false);
    expect(viewportFit({ offsetLeft: 0, offsetTop: 0, scale: Infinity }).fit).toBe(false);
  });

  it('mapping a client point into the root undoes the transform exactly (controls hit where drawn)', () => {
    const f = viewportFit({ offsetLeft: 200, offsetTop: 50, scale: 2 });
    // the root's local point (100, 60) is drawn at client (200 + 100 * 0.5, 50 + 60 * 0.5)
    expect(mapClientToRoot(f, 250, 80)).toEqual({ x: 100, y: 60 });
    expect(mapClientToRoot(IDENTITY_FIT, 250, 80)).toEqual({ x: 250, y: 80 });
    // a whole 844 x 390 root maps onto the visible 422 x 195 window at the offset
    expect(mapClientToRoot(f, 200 + 422, 50 + 195)).toEqual({ x: 844, y: 390 });
  });

  it('rapid repeats and the gesture rule', () => {
    expect(isRapidRepeat(null, 100)).toBe(false);
    expect(isRapidRepeat(100, 100 + DOUBLE_TAP_MS - 1)).toBe(true);
    expect(isRapidRepeat(100, 100 + DOUBLE_TAP_MS)).toBe(false);
    expect(isRapidRepeat(500, 100)).toBe(false);
    expect(blocksPageGestures({ match: true, active: true })).toBe(true);
    expect(blocksPageGestures({ match: true, active: false })).toBe(false);
    expect(blocksPageGestures({ match: false, active: false })).toBe(false);
  });
});

// ---- the guard on a fake window ----------------------------------------------------------------------------------

interface FakeHtml {
  dataset: Record<string, string | undefined>;
  style: {
    props: Map<string, string>;
    setProperty(k: string, v: string): void;
    removeProperty(k: string): void;
  };
  clientWidth: number;
  clientHeight: number;
}

function fakeWindow() {
  const props = new Map<string, string>();
  const html: FakeHtml = {
    dataset: {},
    style: {
      props,
      setProperty: (k, v) => void props.set(k, v),
      removeProperty: (k) => void props.delete(k),
    },
    clientWidth: 844,
    clientHeight: 390,
  };
  const doc = Object.assign(new EventTarget(), { documentElement: html, body: {} });
  const vv = Object.assign(new EventTarget(), {
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1,
    width: 844,
    height: 390,
  });
  const win = Object.assign(new EventTarget(), {
    document: doc,
    visualViewport: vv,
    innerWidth: 844,
    innerHeight: 390,
    scrollX: 0,
    scrollY: 0,
    scrollTo: vi.fn(),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => undefined,
    getComputedStyle: () => ({ overflowX: 'visible', overflowY: 'visible' }),
    screen: {},
  });
  let resizes = 0;
  win.addEventListener('resize', () => resizes++);
  return { win: win as unknown as Window, html, doc, vv, resizes: () => resizes };
}

function touchEvent(type: string, fingers: number, timeStamp = 0): Event {
  const e = new Event(type, { cancelable: true });
  Object.defineProperty(e, 'touches', { value: Array.from({ length: fingers }) });
  Object.defineProperty(e, 'timeStamp', { value: timeStamp });
  return e;
}

describe('installViewportGuard', () => {
  afterEach(() => vi.useRealTimers());

  it('blocks pinch, two-finger moves, page pans and rapid double taps only while a match is played', () => {
    const { win, doc, html } = fakeWindow();
    const guard = installViewportGuard(win);
    const pinch = (): boolean => {
      const e = new Event('gesturestart', { cancelable: true });
      doc.dispatchEvent(e);
      return e.defaultPrevented;
    };
    // menus: the browser's own behaviour (the menus keep their scrolling and the escape from a zoom)
    expect(pinch()).toBe(false);
    guard.setMode({ match: true, active: true });
    expect(html.dataset.play).toBe('active');
    expect(pinch()).toBe(true);
    const two = touchEvent('touchmove', 2);
    doc.dispatchEvent(two);
    expect(two.defaultPrevented).toBe(true);
    doc.dispatchEvent(touchEvent('touchstart', 1));
    const pan = touchEvent('touchmove', 1);
    doc.dispatchEvent(pan);
    expect(pan.defaultPrevented).toBe(true); // nothing on the game surface scrolls the page
    const first = touchEvent('touchend', 0, 1000);
    doc.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(false);
    const second = touchEvent('touchend', 0, 1000 + DOUBLE_TAP_MS / 2);
    doc.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(true);
    // paused: the pause menu is the browser's again
    guard.setMode({ match: true, active: false });
    expect(html.dataset.play).toBe('match');
    expect(pinch()).toBe(false);
    const later = touchEvent('touchmove', 2);
    doc.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
    guard.dispose();
    expect(html.dataset.play).toBeUndefined();
  });

  it('counter-scales a zoomed match, tells the HUD to measure, and undoes it when the zoom is gone', () => {
    vi.useFakeTimers();
    const { win, vv, html, resizes } = fakeWindow();
    const guard = installViewportGuard(win);
    guard.setMode({ match: true, active: true });
    const before = resizes();
    Object.assign(vv, { scale: 1.5, offsetLeft: 90, offsetTop: 20, width: 562.67, height: 260 });
    vv.dispatchEvent(new Event('resize'));
    expect(html.dataset.vv).toBe('zoomed');
    expect(html.dataset.vvFit).toBe('');
    expect(html.style.props.get('--vv-left')).toBe('90px');
    expect(html.style.props.get('--vv-top')).toBe('20px');
    expect(Number(html.style.props.get('--vv-scale'))).toBeCloseTo(1 / 1.5, 3);
    expect(resizes()).toBeGreaterThan(before);
    expect(guard.current()).toMatchObject({ zoomed: true, fit: true });
    // the zoom is gone (pinched out from the pause menu): the normal layout comes back
    Object.assign(vv, { scale: 1, offsetLeft: 0, offsetTop: 0, width: 844, height: 390 });
    vv.dispatchEvent(new Event('resize'));
    expect(html.dataset.vv).toBeUndefined();
    expect(html.dataset.vvFit).toBeUndefined();
    expect(html.style.props.size).toBe(0);
    guard.dispose();
  });

  it('menus are never transformed, even on a zoomed page', () => {
    const { win, vv, html } = fakeWindow();
    Object.assign(vv, { scale: 2, offsetLeft: 10, offsetTop: 10 });
    const guard = installViewportGuard(win);
    vv.dispatchEvent(new Event('resize'));
    expect(html.dataset.vv).toBe('zoomed'); // the zoom escape (pinch out) is allowed
    expect(html.dataset.vvFit).toBeUndefined();
    guard.dispose();
  });

  it('re-reads late WebKit sizes after a rotation and re-sends resize when they moved', () => {
    vi.useFakeTimers();
    const f = fakeWindow();
    const guard = installViewportGuard(f.win);
    guard.setMode({ match: true, active: true });
    // the browser's resize arrives with the old (portrait) sizes ...
    f.win.dispatchEvent(new Event('resize'));
    const afterFirst = f.resizes();
    // ... and the real landscape sizes only land a moment later, with no new event
    Object.assign(f.win, { innerWidth: 390, innerHeight: 844 });
    Object.assign(f.html, { clientWidth: 390, clientHeight: 844 });
    vi.advanceTimersByTime(1000);
    expect(f.resizes()).toBe(afterFirst + 1);
    // nothing moved: no extra events
    vi.advanceTimersByTime(1000);
    expect(f.resizes()).toBe(afterFirst + 1);
    guard.dispose();
  });

  it('puts a scrolled page back during a match', () => {
    const f = fakeWindow();
    const guard = installViewportGuard(f.win);
    Object.assign(f.win, { scrollY: 48 });
    guard.setMode({ match: true, active: true });
    expect((f.win as unknown as { scrollTo: ReturnType<typeof vi.fn> }).scrollTo).toHaveBeenCalledWith(0, 0);
    guard.dispose();
  });
});
