/**
 * iOS / WebKit viewport guard (docs/IOS_VIEWPORT.md, decisions IV1-IV6). Presentation and input-surface only: it never
 * reads or changes the simulation, the camera, input timing or the touch assist rules.
 *
 * On an iPhone both Safari and Chrome are WebKit, and WebKit ignores `user-scalable=no` / `maximum-scale` for the
 * player's own pinch and double-tap. Once the page is zoomed, the game surface (touch-action: none everywhere) offers
 * no way to pinch back out, so the match stays enlarged. This module:
 *  - blocks page gestures while a match is being played (Safari `gesture*` events, multi-finger `touchmove`, page
 *    panning outside a real scroller, a rapid second tap that WebKit could read as a double-tap zoom);
 *  - re-reads the viewport after any visual-viewport, toolbar, fullscreen or rotation change, again after WebKit's late
 *    size updates, and tells the HUD to measure again (a `resize` event) when something moved;
 *  - when the page is still zoomed anyway, counter-scales the match into the visible area (the game root is translated
 *    to the visual viewport and scaled by 1 / zoom), so the whole board, the HUD and the controls show at their normal
 *    size; measuring code maps client coordinates back into the root with `rootRect` / `clientToRoot`; outside active
 *    play the player may pinch back out.
 */

/** A visual viewport scale this close to 1 counts as unzoomed (rounding in WebKit's reported scale). */
export const ZOOM_EPSILON = 0.01;
/** Two touch releases closer than this (ms) are what WebKit can read as a double-tap zoom. */
export const DOUBLE_TAP_MS = 350;
/** Delays (ms) after a resize / rotation at which the sizes are read again: WebKit reports late sizes on rotation. */
export const SETTLE_DELAYS_MS: readonly number[] = [120, 350, 800];

/** `window.visualViewport` as read (null in a browser without it: then nothing is ever zoomed). */
export interface VisualSample {
  offsetLeft: number;
  offsetTop: number;
  scale: number;
}

/**
 * The transform on the game root: client = (left, top) + root * scale. Identity (`fit` false) unless the page is zoomed.
 */
export interface ViewportFit {
  /** The page is pinch / double-tap zoomed (visual viewport scale above 1). */
  zoomed: boolean;
  /** The match is counter-scaled into the visible area. */
  fit: boolean;
  left: number;
  top: number;
  /** The root's scale (1 / the page zoom when fitted). */
  scale: number;
  /** The page zoom the browser reports (visualViewport.scale). */
  pageScale: number;
}

export const IDENTITY_FIT: ViewportFit = {
  zoomed: false,
  fit: false,
  left: 0,
  top: 0,
  scale: 1,
  pageScale: 1,
};

const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);
const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Pure: how to place the match so it exactly covers what the player sees. An unzoomed page keeps the normal layout (a
 * toolbar change or a rotation is a real resize the layout follows by itself); a zoomed page gets the root moved to
 * the visual viewport's offset and scaled by 1 / zoom, which undoes the zoom for everything inside it.
 */
export function viewportFit(visual: VisualSample | null): ViewportFit {
  if (!visual) return IDENTITY_FIT;
  const pageScale = finite(visual.scale, 1) > 0 ? finite(visual.scale, 1) : 1;
  if (pageScale <= 1 + ZOOM_EPSILON) return { ...IDENTITY_FIT, pageScale };
  return {
    zoomed: true,
    fit: true,
    left: round(Math.max(0, finite(visual.offsetLeft, 0))),
    top: round(Math.max(0, finite(visual.offsetTop, 0))),
    scale: round(1 / pageScale),
    pageScale,
  };
}

/** Pure: a client point (pointer event, getBoundingClientRect) in the game root's own CSS px. */
export function mapClientToRoot(fit: ViewportFit, x: number, y: number): { x: number; y: number } {
  if (!fit.fit) return { x, y };
  return { x: (x - fit.left) / fit.scale, y: (y - fit.top) / fit.scale };
}

/** Pure: is this touch release a rapid repeat that WebKit could turn into a double-tap zoom? */
export function isRapidRepeat(previousEndMs: number | null, nowMs: number): boolean {
  return previousEndMs !== null && nowMs >= previousEndMs && nowMs - previousEndMs < DOUBLE_TAP_MS;
}

/** Where a match is: `active` = being played (gestures blocked), `match` = on screen (paused / results / playing). */
export interface ViewportMode {
  match: boolean;
  active: boolean;
}

/** Pure: should a page gesture (pinch, page pan, double-tap) be stopped now? Only while a match is being played. */
export function blocksPageGestures(mode: ViewportMode): boolean {
  return mode.active;
}

// ---------------------------------------------------------------------------------------------------------------
// The fit applied right now (one game root per page). Identity until the guard fits a zoomed match.
let applied: ViewportFit = IDENTITY_FIT;

/** A client point in the game root's CSS px (identity unless a zoomed match is counter-scaled). */
export function clientToRoot(x: number, y: number): { x: number; y: number } {
  return mapClientToRoot(applied, x, y);
}

export interface RootRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** `el.getBoundingClientRect()` in the game root's CSS px: what HUD layout code compares and writes as styles. */
export function rootRect(el: Element): RootRect {
  const r = el.getBoundingClientRect();
  const a = mapClientToRoot(applied, r.left, r.top);
  const b = mapClientToRoot(applied, r.right, r.bottom);
  return { left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y };
}

/** The game root's size in its own CSS px (the window's inner size before the root exists). */
export function rootSize(): { width: number; height: number } {
  const el = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.game-root');
  if (el && el.clientWidth > 0 && el.clientHeight > 0)
    return { width: el.clientWidth, height: el.clientHeight };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Elements whose own click must survive a quick second tap (the pause / mute buttons, menu controls). */
const CLICK_TARGETS = 'a, input, select, textarea, label, button:not(.abtn), [role="button"]:not(.abtn)';

/** The event target as an element (a text node's parent; null for the window / document). */
function asElement(target: EventTarget | null): Element | null {
  const node = target as Node | null;
  if (!node || typeof node.nodeType !== 'number') return null;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

function insideScroller(target: EventTarget | null, win: Window): boolean {
  for (let el = asElement(target); el; el = el.parentElement) {
    if (el === win.document.documentElement || el === win.document.body) return false;
    const s = win.getComputedStyle(el);
    const y = (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
    const x = (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
    if (x || y) return true;
  }
  return false;
}

export interface ViewportGuard {
  /** The match state changed (from the UI store). */
  setMode(mode: ViewportMode): void;
  /** Read the sizes again now and after WebKit's late updates. */
  refit(): void;
  /** The current fit (tests / debug handle). */
  current(): ViewportFit;
  dispose(): void;
}

function sampleVisual(win: Window): VisualSample | null {
  const vv = win.visualViewport;
  return vv ? { offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop, scale: vv.scale } : null;
}

/**
 * Installs the guard on a window. Writes `data-play` (`active` / `match`), `data-vv` (`zoomed`) and `data-vv-fit` with
 * the `--vv-*` transform on <html>; styles.css turns those into the game root's transform and the touch rules.
 */
export function installViewportGuard(win: Window = window): ViewportGuard {
  const doc = win.document;
  const html = doc.documentElement;
  let mode: ViewportMode = { match: false, active: false };
  let fit = viewportFit(sampleVisual(win));
  let lastKey = '';
  let dispatching = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let raf = 0;
  let lastTapEnd: number | null = null;
  let panAllowed = false;

  const notify = (): void => {
    // the HUD rail, the thumbstick and the mission dock measure on `resize`; the canvas has its own ResizeObserver
    dispatching = true;
    try {
      win.dispatchEvent(new Event('resize'));
    } finally {
      dispatching = false;
    }
  };

  /** Applies the current viewport. `fromResize`: the browser already sent `resize` for this change. */
  const apply = (fromResize = false): void => {
    fit = viewportFit(sampleVisual(win));
    if (fit.zoomed) html.dataset.vv = 'zoomed';
    else delete html.dataset.vv;
    const fitNow = mode.match && fit.fit;
    applied = fitNow ? fit : IDENTITY_FIT;
    if (fitNow) {
      html.dataset.vvFit = '';
      html.style.setProperty('--vv-left', `${fit.left}px`);
      html.style.setProperty('--vv-top', `${fit.top}px`);
      html.style.setProperty('--vv-scale', `${fit.scale}`);
    } else if (html.dataset.vvFit !== undefined) {
      delete html.dataset.vvFit;
      for (const p of ['--vv-left', '--vv-top', '--vv-scale']) html.style.removeProperty(p);
    }
    // a page that scrolled (a WebKit rotation can leave the document offset) is put back: nothing in the game scrolls
    if (mode.match && !fit.zoomed && (win.scrollX !== 0 || win.scrollY !== 0)) win.scrollTo(0, 0);
    const key = [
      win.innerWidth,
      win.innerHeight,
      html.clientWidth,
      html.clientHeight,
      fitNow,
      fit.left,
      fit.top,
      fit.scale,
    ];
    const keyText = key.join(',');
    if (keyText === lastKey) return;
    lastKey = keyText;
    // WebKit's first `resize` after a rotation can carry stale sizes: a later re-read that differs re-sends it
    if (!fromResize) notify();
  };

  const schedule = (fromResize = false): void => {
    apply(fromResize);
    for (const t of timers) clearTimeout(t);
    win.cancelAnimationFrame?.(raf);
    raf = win.requestAnimationFrame?.(() => apply()) ?? 0;
    timers = SETTLE_DELAYS_MS.map((ms) => setTimeout(() => apply(), ms));
  };

  const onResize = (): void => {
    if (!dispatching) schedule(true);
  };
  const onViewport = (): void => schedule();

  // Safari's own pinch events (WebKit only): cancelled while a match is played, left alone otherwise so a zoomed
  // player can pinch back out from the pause menu or the menus.
  const onGesture = (e: Event): void => {
    if (blocksPageGestures(mode) && e.cancelable) e.preventDefault();
  };
  const onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 1) panAllowed = insideScroller(e.target, win);
  };
  const onTouchMove = (e: TouchEvent): void => {
    if (!blocksPageGestures(mode) || !e.cancelable) return;
    // two fingers never zoom; one finger pans only inside a real scroller (the tutorial's lesson panel)
    if (e.touches.length > 1 || !panAllowed) e.preventDefault();
  };
  const onTouchEnd = (e: TouchEvent): void => {
    if (!blocksPageGestures(mode) || e.touches.length > 0) return;
    const now = e.timeStamp;
    const repeat = isRapidRepeat(lastTapEnd, now);
    lastTapEnd = now;
    // the pointer events (the pad, A and B) have already fired; only the synthesised click and the zoom are dropped
    if (repeat && e.cancelable && !asElement(e.target)?.closest(CLICK_TARGETS)) e.preventDefault();
  };
  const onDblClick = (e: Event): void => {
    if (blocksPageGestures(mode) && e.cancelable) e.preventDefault();
  };

  let touchOn = false;
  const setTouch = (on: boolean): void => {
    if (on === touchOn) return;
    touchOn = on;
    // non-passive document touch listeners only while a match is played (menus keep the browser's fast scrolling)
    const opts: AddEventListenerOptions = { passive: false, capture: true };
    if (on) {
      doc.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
      doc.addEventListener('touchmove', onTouchMove, opts);
      doc.addEventListener('touchend', onTouchEnd, opts);
      doc.addEventListener('dblclick', onDblClick, opts);
    } else {
      doc.removeEventListener('touchstart', onTouchStart, { capture: true });
      doc.removeEventListener('touchmove', onTouchMove, { capture: true });
      doc.removeEventListener('touchend', onTouchEnd, { capture: true });
      doc.removeEventListener('dblclick', onDblClick, { capture: true });
      lastTapEnd = null;
    }
  };

  const GESTURES = ['gesturestart', 'gesturechange', 'gestureend'];
  for (const g of GESTURES) doc.addEventListener(g, onGesture, { passive: false, capture: true });
  win.addEventListener('resize', onResize);
  win.addEventListener('orientationchange', onViewport);
  doc.addEventListener('fullscreenchange', onViewport);
  win.visualViewport?.addEventListener('resize', onViewport);
  win.visualViewport?.addEventListener('scroll', onViewport);
  const orientation = win.screen?.orientation;
  orientation?.addEventListener?.('change', onViewport);
  apply(true);

  return {
    setMode(next: ViewportMode): void {
      if (next.match === mode.match && next.active === mode.active) return;
      mode = { ...next };
      if (mode.active) html.dataset.play = 'active';
      else if (mode.match) html.dataset.play = 'match';
      else delete html.dataset.play;
      setTouch(mode.active);
      schedule();
    },
    refit: () => schedule(),
    current: () => ({ ...fit, fit: applied.fit }),
    dispose(): void {
      setTouch(false);
      for (const t of timers) clearTimeout(t);
      win.cancelAnimationFrame?.(raf);
      for (const g of GESTURES) doc.removeEventListener(g, onGesture, { capture: true });
      win.removeEventListener('resize', onResize);
      win.removeEventListener('orientationchange', onViewport);
      doc.removeEventListener('fullscreenchange', onViewport);
      win.visualViewport?.removeEventListener('resize', onViewport);
      win.visualViewport?.removeEventListener('scroll', onViewport);
      orientation?.removeEventListener?.('change', onViewport);
      applied = IDENTITY_FIT;
      delete html.dataset.play;
      delete html.dataset.vv;
      delete html.dataset.vvFit;
    },
  };
}
