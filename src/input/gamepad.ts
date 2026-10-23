import type { Dir } from '../sim';
import type { ActionName, NavCommand } from './types';

/** Stick deflection needed to register a direction, and the lower level at which a registered one is kept. */
const DEADZONE = 0.5;
const RELEASE_ZONE = 0.35;
/** Rolling the stick past a diagonal only switches axis once the other axis clearly dominates. */
const AXIS_HYSTERESIS = 1.25;

// Standard mapping: 0=A 1=B 2=X 3=Y 4=LB 5=RB 9=Start 12-15 = D-pad up/down/left/right
export const ACTION_BUTTONS: Readonly<Record<number, ActionName>> = {
  0: 'place',
  2: 'action',
  3: 'vehicle',
  1: 'skill',
  4: 'disarm',
  5: 'detonate',
};

export interface GamepadEvents {
  /** The D-pad / stick moved onto a new direction (an edge, not a level). */
  onMove(dir: Dir): void;
  onAction(action: ActionName): void;
  onNav(command: NavCommand): void;
  onUse(): void;
}

/** Polls the Gamepad API once per frame. D-pad / left stick move; face buttons act. */
export class GamepadInput {
  private prev: boolean[] = [];
  private prevDir: Dir | null = null;
  private current: Dir | null = null;
  private stickDir: Dir | null = null;

  constructor(private readonly events: GamepadEvents) {}

  get held(): Dir | null {
    return this.current;
  }

  get connected(): boolean {
    return this.pads().length > 0;
  }

  private pads(): Gamepad[] {
    try {
      return Array.from(navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g && g.connected);
    } catch {
      return [];
    }
  }

  /** Dominant-axis direction with a dead zone and hysteresis so a wobbling stick cannot fake extra taps. */
  private stickDirection(ax: number, ay: number): Dir | null {
    const horizontal = (d: Dir | null): boolean => d === 'left' || d === 'right';
    const prev = this.stickDir;
    let dir: Dir | null = null;
    if (prev) {
      const own = Math.abs(horizontal(prev) ? ax : ay);
      const other = Math.abs(horizontal(prev) ? ay : ax);
      if (own > RELEASE_ZONE && other < own * AXIS_HYSTERESIS) {
        const v = horizontal(prev) ? ax : ay;
        dir = horizontal(prev) ? (v > 0 ? 'right' : 'left') : v > 0 ? 'down' : 'up';
      }
    }
    if (!dir && Math.max(Math.abs(ax), Math.abs(ay)) > DEADZONE) {
      dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
    }
    this.stickDir = dir;
    return dir;
  }

  poll(): void {
    const pad = this.pads()[0];
    if (!pad) {
      this.current = null;
      this.prevDir = null;
      this.stickDir = null;
      return;
    }
    const b = (i: number): boolean => !!pad.buttons[i]?.pressed;
    let dir: Dir | null;
    if (b(12)) dir = 'up';
    else if (b(13)) dir = 'down';
    else if (b(14)) dir = 'left';
    else if (b(15)) dir = 'right';
    else dir = null;
    // The stick only counts while the D-pad is idle; its hysteresis state restarts after D-pad use.
    if (dir) this.stickDir = null;
    else dir = this.stickDirection(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    this.current = dir;
    if (dir !== this.prevDir) {
      if (dir) {
        this.events.onUse();
        this.events.onMove(dir);
        this.events.onNav(dir);
      }
      this.prevDir = dir;
    }
    for (const [i, action] of Object.entries(ACTION_BUTTONS)) {
      const idx = Number(i);
      if (b(idx) && !this.prev[idx]) {
        this.events.onUse();
        this.events.onAction(action);
        if (idx === 0) this.events.onNav('confirm');
        if (idx === 1) this.events.onNav('back');
      }
    }
    if (b(9) && !this.prev[9]) this.events.onNav('pause');
    this.prev = pad.buttons.map((x) => x.pressed);
  }
}
