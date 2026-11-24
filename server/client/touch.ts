/**
 * Minimal on-screen controls for phones in landscape: a thumbstick (left) and A / B buttons (right), driving the REAL
 * `InputManager` (`setTouchDir`, `touchDown` / `touchUp`). A = place, B = special; the input layer turns holds into
 * detonate exactly as offline. Each finger is its own source id so two thumbs never cancel each other.
 */
import type { InputManager } from '../../src/input';
import type { Dir } from '../../src/sim';

const DEAD_ZONE = 0.28;

/** The stick's cardinal direction for an offset from its centre (screen coordinates: y grows downward). */
export function stickDir(dx: number, dy: number, radius: number): Dir | null {
  if (Math.hypot(dx, dy) < radius * DEAD_ZONE) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function setupTouch(root: HTMLElement, input: InputManager): { visible(on: boolean): void } {
  const stick = root.querySelector<HTMLElement>('#stick')!;
  const knob = root.querySelector<HTMLElement>('#stick-knob')!;
  const a = root.querySelector<HTMLElement>('#btn-a')!;
  const b = root.querySelector<HTMLElement>('#btn-b')!;

  let stickPointer: number | null = null;
  const moveStick = (e: PointerEvent): void => {
    const r = stick.getBoundingClientRect();
    const radius = r.width / 2;
    const dx = e.clientX - (r.left + radius);
    const dy = e.clientY - (r.top + radius);
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, radius / len);
    knob.style.transform = `translate(${dx * k * 0.6}px, ${dy * k * 0.6}px)`;
    input.setTouchDir(stickDir(dx, dy, radius));
  };
  const endStick = (e: PointerEvent): void => {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    knob.style.transform = '';
    input.setTouchDir(null);
  };
  stick.addEventListener('pointerdown', (e) => {
    if (stickPointer !== null) return;
    stickPointer = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    input.touchActive();
    moveStick(e);
    e.preventDefault();
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickPointer) moveStick(e);
  });
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  const wire = (el: HTMLElement, action: 'place' | 'special'): void => {
    const src = (e: PointerEvent): string => `touch:${action}:${e.pointerId}`;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      input.touchDown(action, src(e));
      e.preventDefault();
    });
    const up = (e: PointerEvent): void => input.touchUp(action, src(e));
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  wire(a, 'place');
  wire(b, 'special');
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  const coarse = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
  const force = new URLSearchParams(location.search).has('touch');
  let shown = false;
  return {
    visible(on: boolean): void {
      shown = on && (coarse || force);
      root.hidden = !shown;
      if (!shown) {
        input.setTouchDir(null);
        knob.style.transform = '';
      }
    },
  };
}
