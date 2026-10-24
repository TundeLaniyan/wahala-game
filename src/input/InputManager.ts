import type { Dir, Intent } from '../sim';
import { GamepadInput } from './gamepad';
import { KeyboardInput } from './keyboard';
import { MoveGate } from './moveGate';
import type { ActionName, InputSourceName, NavCommand } from './types';

export interface InputManagerEvents {
  /** Fired for menu-style commands (vehicle selection, pause). */
  onNav(command: NavCommand): void;
  /** Fired whenever the active input device changes (to show matching on-screen help). */
  onDeviceChange(device: InputSourceName): void;
}

/**
 * Merges keyboard, touch and gamepad into one `Intent` per simulation tick. Every device has
 * identical power: they all just set the same Intent fields. Movement goes through a `MoveGate`, so a
 * press is one step and only a deliberate hold repeats (see moveGate.ts).
 */
export class InputManager {
  private readonly keyboard: KeyboardInput;
  private readonly gamepad: GamepadInput;
  private touchDir: Dir | null = null;
  private readonly gate = new MoveGate();
  /** Last tick handed to `buildIntent`; presses between ticks are stamped with it. */
  private tickNow = 0;
  private readonly pending = new Set<ActionName>();
  private lastDevice: InputSourceName = 'keyboard';
  /** Set while the vehicle-entry selector owns the directional input. */
  navMode = false;

  constructor(private readonly events: InputManagerEvents) {
    this.keyboard = new KeyboardInput({
      onMove: (d) => this.gate.press(d, this.tickNow),
      onAction: (a) => this.press(a),
      onNav: (c) => this.nav(c),
      onUse: () => this.device('keyboard'),
    });
    this.gamepad = new GamepadInput({
      onMove: (d) => this.gate.press(d, this.tickNow),
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

  /** A finger landed on the on-screen stick (switches the help/legend to touch before any direction). */
  touchActive(): void {
    this.device('touch');
  }

  /**
   * On-screen thumbstick: `dir` is its quantised cardinal direction, null in the dead zone or once the
   * finger lifts. A new direction is a new press (one tile); holding repeats at the step cadence.
   */
  setTouchDir(dir: Dir | null): void {
    if (dir === this.touchDir) return;
    this.touchDir = dir;
    if (!dir) return;
    this.device('touch');
    this.gate.press(dir, this.tickNow);
    this.events.onNav(dir);
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

  /**
   * Builds the intent for this tick and clears the one-shot buffer.
   * @param canMove whether the local player's step finishes this tick (`readyToStep`); a press is held back
   *   until then. Defaults to true, i.e. a press is offered to the simulation on exactly one tick.
   */
  buildIntent(tick: number, canMove = true): Intent {
    this.tickNow = tick;
    let move: Dir | null = null;
    if (this.navMode) this.gate.clear();
    else move = this.gate.next(tick, this.heldDir(), this.activeDirs(), canMove);
    const intent: Intent = { move };
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
    this.gate.clear();
  }

  private heldDir(): Dir | null {
    return this.keyboard.held ?? this.touchDir ?? this.gamepad.held;
  }

  private activeDirs(): ReadonlySet<Dir> {
    const set = new Set<Dir>(this.keyboard.heldSet);
    if (this.touchDir) set.add(this.touchDir);
    if (this.gamepad.held) set.add(this.gamepad.held);
    return set;
  }

  dispose(): void {
    this.keyboard.dispose();
  }
}
