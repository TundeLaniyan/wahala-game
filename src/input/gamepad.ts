import type { Dir } from '../sim';
import type { ActionName, NavCommand } from './types';

const DEADZONE = 0.5;

// Standard mapping: 0=A 1=B 2=X 3=Y 4=LB 5=RB 9=Start 12-15 = D-pad up/down/left/right
const ACTION_BUTTONS: Record<number, ActionName> = {
  0: 'place',
  2: 'action',
  3: 'vehicle',
  1: 'skill',
  4: 'disarm',
  5: 'detonate',
};

export interface GamepadEvents {
  onAction(action: ActionName): void;
  onNav(command: NavCommand): void;
  onUse(): void;
}

/** Polls the Gamepad API once per frame. D-pad / left stick move; face buttons act. */
export class GamepadInput {
  private prev: boolean[] = [];
  private prevDir: Dir | null = null;
  private current: Dir | null = null;

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

  poll(): void {
    const pad = this.pads()[0];
    if (!pad) {
      this.current = null;
      this.prevDir = null;
      return;
    }
    const b = (i: number): boolean => !!pad.buttons[i]?.pressed;
    let dir: Dir | null = null;
    if (b(12)) dir = 'up';
    else if (b(13)) dir = 'down';
    else if (b(14)) dir = 'left';
    else if (b(15)) dir = 'right';
    else {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.max(Math.abs(ax), Math.abs(ay)) > DEADZONE) {
        dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
      }
    }
    this.current = dir;
    if (dir !== this.prevDir) {
      if (dir) {
        this.events.onUse();
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
        if (idx === 1) this.events.onNav('cancel');
      }
    }
    if (b(9) && !this.prev[9]) this.events.onNav('pause');
    this.prev = pad.buttons.map((x) => x.pressed);
  }
}
