/**
 * Console-style menu navigation for keyboard and gamepad: the D-pad / arrows move focus to the nearest
 * control in that direction, A / Enter / Space presses it, and on a slider left / right step its value.
 * Mouse and touch simply click. Used by every menu through `useMenuNav`.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { NavCommand } from '../../input';
import { setMenuNavHandler } from '../../app/menuNav';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [data-nav]';

type Dir = 'up' | 'down' | 'left' | 'right';

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** The control nearest to `from` in direction `dir` (straight-ahead candidates first). */
export function nearestInDirection<T extends { rect: { x: number; y: number; w: number; h: number } }>(
  from: T['rect'],
  dir: Dir,
  candidates: readonly T[],
): T | null {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  let best: T | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const x = c.rect.x + c.rect.w / 2;
    const y = c.rect.y + c.rect.h / 2;
    const dx = x - cx;
    const dy = y - cy;
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    const score = along + across * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function stepRange(input: HTMLInputElement, dir: 1 | -1): void {
  const step = Number(input.step) || 1;
  const min = Number(input.min) || 0;
  const max = input.max === '' ? 100 : Number(input.max);
  const next = Math.min(max, Math.max(min, Number(input.value) + dir * step));
  // React tracks the value property: set it through the native setter, then announce the change
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, String(next));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function focus(el: HTMLElement): void {
  el.focus({ preventScroll: false });
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** Applies one menu command inside `root`; returns whether it was used. */
export function navigate(root: HTMLElement, command: NavCommand): boolean {
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
  if (all.length === 0) return false;
  const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
    ? document.activeElement
    : null;
  if (command === 'confirm') {
    if (active && !(active instanceof HTMLInputElement && active.type === 'range')) active.click();
    else if (!active) focus(root.querySelector<HTMLElement>('[data-autofocus]') ?? all[0]!);
    return true;
  }
  if (command !== 'up' && command !== 'down' && command !== 'left' && command !== 'right') return false;
  if (!active) {
    focus(root.querySelector<HTMLElement>('[data-autofocus]') ?? all[0]!);
    return true;
  }
  if (active instanceof HTMLInputElement && active.type === 'range' && (command === 'left' || command === 'right')) {
    stepRange(active, command === 'right' ? 1 : -1);
    return true;
  }
  const rect = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const next = nearestInDirection(
    rect(active),
    command,
    all.filter((el) => el !== active).map((el) => ({ el, rect: rect(el) })),
  );
  if (next) focus(next.el);
  return true;
}

/**
 * Installs keyboard / gamepad navigation for the menu in `root` while it is mounted. `onCancel` handles
 * Esc / gamepad B (return true when it did something, false to let the match have it).
 */
export function useMenuNav(
  root: RefObject<HTMLElement | null>,
  onCancel: () => boolean,
  opts: { enabled?: boolean; onPause?: () => boolean } = {},
): void {
  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    return setMenuNavHandler((command) => {
      const el = root.current;
      if (!el) return false;
      if (command === 'cancel' || command === 'back') return onCancel();
      if (command === 'pause') return opts.onPause?.() ?? false;
      return navigate(el, command);
    });
  });
}
