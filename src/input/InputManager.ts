import type { Dir, Intent } from '../sim';
import { GamepadInput } from './gamepad';
import { KeyboardInput } from './keyboard';
import { MoveGate } from './moveGate';
import { SpecialHold } from './specialHold';
import type { ActionName, InputSourceName, NavCommand } from './types';

export interface InputManagerEvents {
  /** Fired for menu-style commands (pause, tutorial vehicle selector). */
  onNav(command: NavCommand): void;
  /** Fired whenever the active input device changes (to show matching on-screen help). */
  onDeviceChange(device: InputSourceName): void;
}

/** What the match tells the input layer about the local player each tick. */
export interface IntentContext {
  /** Whether the local player's step finishes this tick (`readyToStep`); a press waits until then. */
  canMove?: boolean;
  /** The player owns a live remote generator: B must wait to tell a tap from a hold. */
  remoteReady?: boolean;
  /** Would a move this way do anything right now (step, kick ...)? Enables the corner-turn buffer. */
  legal?: (dir: Dir) => boolean;
}

/**
 * Merges keyboard, touch and gamepad into one `Intent` per simulation tick. Every device has
 * identical power: they all just press the same two buttons (A = place, B = special / hold for the
 * remote) and steer the same MoveGate, so a press is one step and only a deliberate hold repeats.
 */
export class InputManager {
  private readonly keyboard: KeyboardInput;
  private readonly gamepad: GamepadInput;
  private touchDir: Dir | null = null;
  private readonly gate = new MoveGate();
  private readonly b = new SpecialHold();
  /** Last tick handed to `buildIntent`; presses between ticks are stamped with it. */
  private tickNow = 0;
  private remoteReady = false;
  private placePending = false;
  private lastDevice: InputSourceName = 'keyboard';
  /** Set while a (tutorial) vehicle-entry selector owns the directional input. */
  navMode = false;

  constructor(private readonly events: InputManagerEvents) {
    this.keyboard = new KeyboardInput({
      onMove: (d) => this.gate.press(d, this.tickNow),
      onAction: (a, code) => this.down(a, `key:${code}`),
      onActionUp: (a, code) => this.up(a, `key:${code}`),
      onNav: (c) => this.nav(c),
      onUse: () => this.device('keyboard'),
    });
    this.gamepad = new GamepadInput({
      onMove: (d) => this.gate.press(d, this.tickNow),
      onAction: (a, src) => this.down(a, src),
      onActionUp: (a, src) => this.up(a, src),
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

  private down(action: ActionName, source: string): void {
    if (action === 'place') this.placePending = true;
    else this.b.pressDown(source, this.tickNow, this.remoteReady);
  }

  private up(action: ActionName, source: string): void {
    if (action === 'special') this.b.release(source);
  }

  /** On-screen button pressed (`source` tells several fingers apart; one finger = one source). */
  touchDown(action: ActionName, source = 'touch'): void {
    this.device('touch');
    this.down(action, source);
  }

  /** On-screen button released / cancelled. */
  touchUp(action: ActionName, source = 'touch'): void {
    this.up(action, source);
  }

  /** A complete tap of an on-screen button (tests, scripted presses). */
  touchPress(action: ActionName): void {
    this.touchDown(action, 'tap');
    this.touchUp(action, 'tap');
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

  /** Touch confirm/cancel buttons of the (tutorial) vehicle-entry overlay. */
  touchNav(c: NavCommand): void {
    this.device('touch');
    this.events.onNav(c);
  }

  /** Call once per rendered frame (the Gamepad API must be polled). */
  pollDevices(): void {
    this.gamepad.poll();
  }

  /** B is down and still deciding between tap and hold (the UI shows a filling ring), 0..1, else null. */
  holdProgress(): number | null {
    return this.b.progress(this.tickNow);
  }

  /**
   * Builds the intent for this tick and clears the one-shot buffer.
   * @param tick the simulation tick about to run
   * @param ctx  see IntentContext; a bare boolean is the legacy `canMove` argument
   */
  buildIntent(tick: number, ctx: IntentContext | boolean = {}): Intent {
    const c: IntentContext = typeof ctx === 'boolean' ? { canMove: ctx } : ctx;
    this.tickNow = tick;
    this.remoteReady = c.remoteReady ?? false;
    let move: Dir | null = null;
    if (this.navMode) this.gate.clear();
    else move = this.gate.next(tick, this.heldDir(), this.activeDirs(), c.canMove ?? true, c.legal);
    const intent: Intent = { move };
    const b = this.b.take(tick);
    if (!this.navMode) {
      if (this.placePending) intent.place = true;
      if (b === 'special') intent.special = true;
      else if (b === 'detonate') intent.detonate = true;
    }
    this.placePending = false;
    return intent;
  }

  clear(): void {
    this.placePending = false;
    this.b.clear();
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
