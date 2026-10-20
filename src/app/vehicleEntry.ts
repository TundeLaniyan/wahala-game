/**
 * Client-side selection flow for launching the signature vehicle. The simulation owns the
 * rules (entry window, legality, launching); this class only tracks which legal option the
 * player has focused and turns keyboard / gamepad / touch / mouse input into sim intents.
 */
import {
  CHARACTERS,
  allBorderEntries,
  buildRoute,
  entryKey,
  listEntries,
  listKekeTurns,
  straightLeg,
} from '../sim';
import type { Dir, GameState, TilePos, VehicleEntry, VehicleIntent, VehicleKind, VehicleTurn } from '../sim';
import type { EntryOverlayModel, EntryPick } from '../render';
import type { NavCommand } from '../input';

type Stage = 'idle' | 'entry' | 'turn';

const turnKey = (t: VehicleTurn): string => `${t.atIndex}:${t.dir}`;

export class VehicleEntryController {
  private stage: Stage = 'idle';
  private entries: VehicleEntry[] = [];
  private focus = 0;
  private chosen: VehicleEntry | null = null;
  private turns: VehicleTurn[] = [];
  private turnFocus = 0;
  private kind: VehicleKind = 'danfo';

  constructor(private readonly localId: number) {}

  get active(): boolean {
    return this.stage !== 'idle';
  }

  get currentStage(): Exclude<Stage, 'idle'> | null {
    return this.stage === 'idle' ? null : this.stage;
  }

  /** Keeps the UI in step with the simulation (entry mode may start, time out or end by itself). */
  sync(state: GameState): void {
    const p = state.players[this.localId];
    const inMode = !!p && p.alive && p.entryUntil !== null;
    if (inMode && this.stage === 'idle') this.open(state);
    if (!inMode && this.stage !== 'idle') this.reset();
  }

  private open(state: GameState): void {
    const p = state.players[this.localId]!;
    this.kind = CHARACTERS[p.characterId].vehicle;
    this.entries = this.ordered(listEntries(state, this.kind), state);
    this.focus = this.suggest(state);
    this.stage = 'entry';
    this.chosen = null;
    this.turns = [];
  }

  private reset(): void {
    this.stage = 'idle';
    this.entries = [];
    this.chosen = null;
    this.turns = [];
  }

  /** Perimeter order (clockwise from the top-left), so the list is stable and predictable. */
  private ordered(list: VehicleEntry[], state: GameState): VehicleEntry[] {
    const order = allBorderEntries(state).map(entryKey);
    return [...list].sort((a, b) => order.indexOf(entryKey(a)) - order.indexOf(entryKey(b)));
  }

  /** Optional assistance: start the cursor on the lane that passes closest to the nearest rival. */
  private suggest(state: GameState): number {
    const me = state.players[this.localId]!;
    const rivals = state.players.filter((o) => o.alive && o.id !== this.localId);
    if (rivals.length === 0 || this.entries.length === 0) return 0;
    let best = 0;
    let bestScore = Infinity;
    this.entries.forEach((e, i) => {
      const route = straightLeg(state, e);
      if (route.some((t) => t.x === me.x && t.y === me.y)) return;
      for (const r of rivals) {
        for (const t of route) {
          const d = Math.abs(t.x - r.x) + Math.abs(t.y - r.y);
          if (d < bestScore) {
            bestScore = d;
            best = i;
          }
        }
      }
    });
    return best;
  }

  /** The vehicle button: begins entry mode, or confirms the current focus if already open. */
  press(state: GameState): VehicleIntent | null {
    const p = state.players[this.localId];
    if (!p || !p.alive) return null;
    if (this.stage === 'idle') return p.hasVoucher && p.entryUntil === null ? { type: 'begin' } : null;
    return this.confirm(state);
  }

  nav(command: NavCommand, state: GameState): VehicleIntent | null {
    if (this.stage === 'idle') return null;
    switch (command) {
      case 'confirm':
        return this.confirm(state);
      case 'cancel':
      case 'back':
        return this.cancel();
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        this.move(command);
        return null;
      default:
        return null;
    }
  }

  /** Tap / click on a marker: first selects it, selecting the focused one again confirms. */
  pick(pick: EntryPick, state: GameState): VehicleIntent | null {
    if (this.stage === 'entry' && pick.kind === 'entry') {
      const i = this.entries.findIndex((e) => entryKey(e) === pick.key);
      if (i < 0) return null;
      if (i === this.focus) return this.confirm(state);
      this.focus = i;
      return null;
    }
    if (this.stage === 'turn' && pick.kind === 'turn') {
      const i = this.turns.findIndex((t) => turnKey(t) === pick.key);
      if (i < 0) return null;
      if (i === this.turnFocus) return this.confirm(state);
      this.turnFocus = i;
    }
    return null;
  }

  confirm(state: GameState): VehicleIntent | null {
    if (this.stage === 'entry') {
      const entry = this.entries[this.focus];
      if (!entry) return null;
      if (!state.config.vehicles.specs[this.kind].turns) return { type: 'launch', entry };
      this.chosen = entry;
      this.turns = listKekeTurns(state, entry);
      this.turnFocus = Math.min(this.turns.length - 1, Math.floor(this.turns.length / 2));
      this.stage = 'turn';
      return null;
    }
    if (this.stage === 'turn' && this.chosen) {
      const turn = this.turns[this.turnFocus];
      return turn ? { type: 'launch', entry: this.chosen, turn } : null;
    }
    return null;
  }

  cancel(): VehicleIntent | null {
    if (this.stage === 'turn') {
      this.stage = 'entry';
      this.chosen = null;
      return null;
    }
    return this.stage === 'entry' ? { type: 'cancel' } : null;
  }

  /** Arrow keys / D-pad: jump to the nearest option in that direction on screen. */
  private move(dir: Dir): void {
    if (this.stage === 'turn') {
      if (this.turns.length === 0) return;
      const step = dir === 'left' || dir === 'up' ? -1 : 1;
      // Turns are ordered along the lane, so left/right (or up/down) walks through them.
      this.turnFocus = (this.turnFocus + step + this.turns.length) % this.turns.length;
      return;
    }
    const cur = this.entries[this.focus];
    if (!cur) return;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = -1;
    let bestScore = Infinity;
    this.entries.forEach((e, i) => {
      if (i === this.focus) return;
      const dx = e.x - cur.x;
      const dy = e.y - cur.y;
      const along = dx * v[0]! + dy * v[1]!;
      const sameTile = dx === 0 && dy === 0;
      // A corner holds two entries: press toward the wall you want to enter through to switch.
      const outward = { up: 'down', down: 'up', left: 'right', right: 'left' }[e.dir] === dir;
      if (sameTile && !outward) return;
      if (!sameTile && along <= 0) return;
      const across = Math.abs(dx * v[1]!) + Math.abs(dy * v[0]!);
      const score = sameTile ? 0 : along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) this.focus = best;
  }

  fraction(state: GameState): number {
    const p = state.players[this.localId];
    if (!p || p.entryUntil === null) return 0;
    return Math.max(0, Math.min(1, (p.entryUntil - state.tick) / state.config.vehicles.entryWindowTicks));
  }

  overlay(state: GameState): EntryOverlayModel | null {
    if (this.stage === 'idle') return null;
    const focusEntry = this.stage === 'entry' ? this.entries[this.focus] : this.chosen;
    let route: TilePos[] | null = null;
    if (focusEntry) {
      if (this.stage === 'turn') {
        const t = this.turns[this.turnFocus];
        route = t ? buildRoute(state, this.kind, focusEntry, t) : null;
      } else if (state.config.vehicles.specs[this.kind].turns) {
        route = straightLeg(state, focusEntry);
      } else {
        route = buildRoute(state, this.kind, focusEntry);
      }
    }
    const leg = this.chosen ? straightLeg(state, this.chosen) : [];
    return {
      stage: this.stage,
      entries: this.stage === 'entry' ? this.entries : [],
      focusKey: focusEntry ? entryKey(focusEntry) : null,
      route,
      turns: this.turns.map((t) => ({
        key: turnKey(t),
        pos: leg[t.atIndex]!,
        dir: t.dir,
        atIndex: t.atIndex,
      })),
      focusTurnKey: this.turns[this.turnFocus] ? turnKey(this.turns[this.turnFocus]!) : null,
      timeFraction: this.fraction(state),
    };
  }

  get vehicleKind(): VehicleKind {
    return this.kind;
  }
}
