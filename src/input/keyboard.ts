import type { Dir } from '../sim';
import type { ActionName, NavCommand } from './types';

export const MOVE_KEYS: Readonly<Record<string, Dir>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

/**
 * V2: two buttons on every device. A (place) = Space / J; B (special: tap = melee / vehicle, hold =
 * Remote Detonator) = K / E / F / L / Left Shift. The pre-V2 extra keys (carry, disarm, vehicle, a
 * separate detonate) are gone: those abilities are contact (walk into a generator) or live on B.
 */
export const ACTION_KEYS: Readonly<Record<string, ActionName>> = {
  Space: 'place',
  KeyJ: 'place',
  KeyK: 'special',
  KeyE: 'special',
  KeyF: 'special',
  KeyL: 'special',
  ShiftLeft: 'special',
};

export const NAV_KEYS: Readonly<Record<string, NavCommand>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  Space: 'confirm',
  Escape: 'cancel',
  KeyP: 'pause',
};

export interface KeyboardEvents {
  /** A direction key went down (never fired for OS key auto-repeat). */
  onMove(dir: Dir): void;
  onAction(action: ActionName, code: string): void;
  /** An action key went up (B's tap / hold split needs the release). */
  onActionUp(action: ActionName, code: string): void;
  onNav(command: NavCommand): void;
  onUse(): void;
}

/** Arrows / WASD to move, Space / J = A (place), K / E / F / L / Shift = B (special, hold = remote), P/Esc pause. */
export class KeyboardInput {
  private readonly stack: Dir[] = [];
  private readonly down = new Set<string>();

  constructor(private readonly events: KeyboardEvents) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.reset);
  }

  get held(): Dir | null {
    return this.stack.length ? this.stack[this.stack.length - 1]! : null;
  }

  /** Every direction with a key currently down. */
  get heldSet(): ReadonlySet<Dir> {
    return new Set(this.stack);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    const first = !this.down.has(e.code);
    this.down.add(e.code);
    const move = MOVE_KEYS[e.code];
    const action = ACTION_KEYS[e.code];
    const nav = NAV_KEYS[e.code];
    if (move || action || nav) e.preventDefault();
    if (e.repeat || !first) return;
    this.events.onUse();
    if (move) {
      const i = this.stack.indexOf(move);
      if (i >= 0) this.stack.splice(i, 1);
      this.stack.push(move);
      this.events.onMove(move);
    }
    if (action) this.events.onAction(action, e.code);
    if (nav) this.events.onNav(nav);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const wasDown = this.down.delete(e.code);
    const action = ACTION_KEYS[e.code];
    if (action && wasDown) this.events.onActionUp(action, e.code);
    const move = MOVE_KEYS[e.code];
    if (!move) return;
    // WASD and arrows both map to the same direction: only release when neither is held.
    const still = Object.entries(MOVE_KEYS).some(([code, d]) => d === move && this.down.has(code));
    if (!still) {
      const i = this.stack.indexOf(move);
      if (i >= 0) this.stack.splice(i, 1);
    }
  };

  private readonly reset = (): void => {
    this.stack.length = 0;
    for (const code of this.down) {
      const action = ACTION_KEYS[code];
      if (action) this.events.onActionUp(action, code);
    }
    this.down.clear();
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.reset);
  }
}
