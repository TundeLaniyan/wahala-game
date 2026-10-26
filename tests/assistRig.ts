/**
 * Shared rig for the assisted-movement tests: the REAL InputManager (touch stick model, keyboard and gamepad
 * plumbing) driving the REAL simulation, wired exactly like MatchController wires them (`legal` + `board`).
 */
import { vi } from 'vitest';
import { InputManager, buildMoveBoard } from '../src/input';
import type { MoveAssistSetting } from '../src/input';
import { VirtualStick, stickConfigFor } from '../src/input/joystick';
import { Tile, moveWouldAct, readyToStep, tick } from '../src/sim';
import type { Dir, GameState, Intent } from '../src/sim';
import { put, sandbox } from './helpers';

type Listener = (e: unknown) => void;
const KEY: Record<Dir, string> = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const PAD_BUTTON: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };

/**
 * Replaces every tile of the board: '#' concrete, '.' floor, 'S' crate; anything outside the rows stays
 * concrete. The corner (14, 10) is kept clear as the parking place of player 1.
 */
export function carve(state: GameState, rows: readonly string[]): void {
  state.tiles = state.tiles.map(() => Tile.Hard);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      state.tiles[y * state.width + x] = ch === '.' ? Tile.Empty : ch === 'S' ? Tile.Soft : Tile.Hard;
    }),
  );
  state.tiles[10 * state.width + 14] = Tile.Empty;
}

export interface RigOptions {
  /** ASCII map (see `carve`); default: the Danfo Bus Park with its crates removed. */
  map?: readonly string[];
  arena?: string;
  start: [number, number];
  assist?: MoveAssistSetting;
  /** Phone viewport the stick is sized for. */
  viewport?: [number, number];
}

export class AssistRig {
  readonly state: GameState;
  readonly input: InputManager;
  readonly stick: VirtualStick;
  readonly trace: [number, number][] = [];
  /** `state.tick` at every tile change of player 0. */
  readonly stepTicks: number[] = [];
  /** Every intent handed to the simulation (tick, move). */
  readonly moves: { tick: number; move: Dir | null }[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();
  private padButtons: number[] = [];

  constructor(o: RigOptions) {
    vi.stubGlobal('window', {
      addEventListener: (t: string, f: Listener) => {
        if (!this.listeners.has(t)) this.listeners.set(t, new Set());
        this.listeners.get(t)!.add(f);
      },
      removeEventListener: (t: string, f: Listener) => this.listeners.get(t)?.delete(f),
    });
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        {
          connected: true,
          buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: this.padButtons.includes(i) })),
          axes: [0, 0],
        },
      ],
    });
    this.state = sandbox({ players: 2, arenaId: o.arena });
    if (o.map) carve(this.state, o.map);
    this.input = new InputManager({ onNav: () => undefined, onDeviceChange: () => undefined });
    this.input.setMoveAssist(o.assist ?? 'on');
    const [w, h] = o.viewport ?? [844, 390];
    this.stick = new VirtualStick(stickConfigFor(w, h));
    put(this.state, 0, o.start[0], o.start[1]);
    put(this.state, 1, 14, 10);
    this.trace.push(o.start);
  }

  get p() {
    return this.state.players[0]!;
  }
  get at(): [number, number] {
    return [this.p.x, this.p.y];
  }
  get tiles(): number {
    return this.trace.length - 1;
  }

  // ---- thumb (exactly as TouchControls wires the stick into the InputManager)
  thumbDown(x = 120, y = 300): void {
    this.stick.begin(1, x, y);
    this.input.touchActive();
  }
  /** Thumb at `deg` (math convention: 0 = right, 90 = up) and `frac` of the stick radius. */
  aim(deg: number, frac = 0.8): void {
    const d = this.stick.config.radius * frac;
    const a = (deg * Math.PI) / 180;
    this.input.setTouchDir(
      this.stick.move(1, this.stick.originX + Math.cos(a) * d, this.stick.originY - Math.sin(a) * d),
      this.stick.wish,
    );
  }
  push(dir: Dir, frac = 0.8): void {
    this.aim({ right: 0, up: 90, left: 180, down: -90 }[dir], frac);
  }
  centre(): void {
    this.input.setTouchDir(this.stick.move(1, this.stick.originX, this.stick.originY), this.stick.wish);
  }
  lift(): void {
    if (this.stick.end(1)) this.input.setTouchDir(null);
  }

  // ---- keyboard / gamepad
  private fire(type: string, code: string): void {
    for (const f of this.listeners.get(type) ?? [])
      f({
        code,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        repeat: false,
        target: null,
        preventDefault() {},
      });
  }
  keyDown(d: Dir): void {
    this.fire('keydown', KEY[d]);
  }
  keyUp(d: Dir): void {
    this.fire('keyup', KEY[d]);
  }
  pad(dirs: Dir[]): void {
    this.padButtons = dirs.map((d) => PAD_BUTTON[d]);
  }

  // ---- time
  /** One frame == one simulation tick, as MatchController runs them. */
  step(n = 1, observe?: (intent: Intent) => void): void {
    for (let i = 0; i < n; i++) {
      this.input.pollDevices();
      const p = this.p;
      const before = [p.x, p.y];
      const intent = this.input.buildIntent(this.state.tick, {
        canMove: readyToStep(p),
        legal: (d) => moveWouldAct(this.state, p, d),
        board: () => buildMoveBoard(this.state, p),
      });
      observe?.(intent);
      this.moves.push({ tick: this.state.tick, move: intent.move ?? null });
      tick(this.state, { 0: intent });
      if (p.x !== before[0] || p.y !== before[1]) {
        this.trace.push([p.x, p.y]);
        this.stepTicks.push(this.state.tick);
      }
    }
  }
  /** Runs until player 0 stands on (x, y) (or `max` ticks pass). */
  until(x: number, y: number, max = 400): void {
    for (let i = 0; i < max && !(this.p.x === x && this.p.y === y); i++) this.step(1);
  }
  /** Ticks at which a move was handed to the simulation (the input latency fingerprint). */
  get movesDelivered(): { tick: number; move: Dir }[] {
    return this.moves.filter((m): m is { tick: number; move: Dir } => m.move !== null);
  }

  /** Every step is one orthogonal tile onto bare floor: no diagonal, no skipped tile, no solid tile. */
  assertCleanTrace(): void {
    for (let i = 0; i < this.trace.length; i++) {
      const [x, y] = this.trace[i]!;
      if (this.state.tiles[y * this.state.width + x] !== Tile.Empty)
        throw new Error(`stood on solid ${x},${y}`);
      if (i === 0) continue;
      const [px, py] = this.trace[i - 1]!;
      if (Math.abs(x - px) + Math.abs(y - py) !== 1) throw new Error(`jump ${px},${py} -> ${x},${y}`);
    }
  }
}
