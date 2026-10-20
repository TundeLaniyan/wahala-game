import type { Dir, Intent } from '../sim';
import { GamepadInput } from './gamepad';
import { KeyboardInput } from './keyboard';
import type { ActionName, InputSourceName, NavCommand } from './types';

/** A quick tap still produces a step if it lands while the previous step is finishing. */
const MOVE_BUFFER_TICKS = 8;

export interface InputManagerEvents {
  /** Fired for menu-style commands (vehicle selection, pause). */
  onNav(command: NavCommand): void;
  /** Fired whenever the active input device changes (to show matching on-screen help). */
  onDeviceChange(device: InputSourceName): void;
}

/**
 * Merges keyboard, touch and gamepad into one `Intent` per simulation tick. Every device has
 * identical power: they all just set the same Intent fields.
 */
export class InputManager {
  private readonly keyboard: KeyboardInput;
  private readonly gamepad: GamepadInput;
  private touchDir: Dir | null = null;
  private latch: { dir: Dir; until: number } | null = null;
  private readonly pending = new Set<ActionName>();
  private lastDevice: InputSourceName = 'keyboard';
  private lastTouchDir: Dir | null = null;
  /** Set while the vehicle-entry selector owns the directional input. */
  navMode = false;

  constructor(private readonly events: InputManagerEvents) {
    this.keyboard = new KeyboardInput({
      onAction: (a) => this.press(a),
      onNav: (c) => this.nav(c),
      onUse: () => this.device('keyboard'),
    });
    this.gamepad = new GamepadInput({
      onAction: (a) => this.press(a),
      onNav: (c) => this.nav(c),
      onUse: () => this.device('gamepad'),
    });
  }

  private device(d: InputSourceName): void {
    if (d !== this.lastDevice) {
      this.lastDevice = d;
      this.events.onDeviceChange(d);
    }
  }

  private nav(c: NavCommand): void {
    this.events.onNav(c);
  }

  /** Called by on-screen controls. */
  press(action: ActionName): void {
    this.pending.add(action);
  }

  touchPress(action: ActionName): void {
    this.device('touch');
    this.press(action);
  }

  setTouchDir(dir: Dir | null): void {
    if (dir) this.device('touch');
    this.touchDir = dir;
    if (dir && dir !== this.lastTouchDir) {
      this.latch = { dir, until: Number.MAX_SAFE_INTEGER };
      this.events.onNav(dir);
    }
    this.lastTouchDir = dir;
  }

  /** Touch confirm/cancel buttons of the vehicle-entry overlay. */
  touchNav(c: NavCommand): void {
    this.device('touch');
    this.events.onNav(c);
  }

  /** Call once per rendered frame (the Gamepad API must be polled). */
  pollDevices(): void {
    this.gamepad.poll();
  }

  /** Builds the intent for this tick and clears the one-shot buffer. */
  buildIntent(tick: number): Intent {
    const held = this.keyboard.held ?? this.touchDir ?? this.gamepad.held;
    if (held) this.latch = { dir: held, until: tick + MOVE_BUFFER_TICKS };
    else if (this.latch && this.latch.until === Number.MAX_SAFE_INTEGER)
      this.latch.until = tick + MOVE_BUFFER_TICKS;
    const move = held ?? (this.latch && tick < this.latch.until ? this.latch.dir : null);
    const intent: Intent = { move: this.navMode ? null : move };
    for (const a of [...this.pending]) {
      if (a === 'vehicle') continue; // consumed by takeVehiclePress() (vehicle entry controller)
      this.pending.delete(a);
      if (!this.navMode) intent[a] = true;
    }
    return intent;
  }

  /** Whether the vehicle button was pressed since the last intent; consumed by the entry controller. */
  takeVehiclePress(): boolean {
    const had = this.pending.delete('vehicle');
    return had;
  }

  clear(): void {
    this.pending.clear();
    this.latch = null;
    this.touchDir = null;
    this.lastTouchDir = null;
  }

  dispose(): void {
    this.keyboard.dispose();
  }
}
