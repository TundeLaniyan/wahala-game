/**
 * THE CITY RUMBLE COMBAT TEST LAB (docs/COMBAT_TEST_LAB.md, decisions CL-L1..CL-L8). A temporary playtest tool: the
 * founder switches between four punch behaviours (`COMBAT_LAB_PRESETS`) from the pause menu of a LOCAL City Rumble
 * match, without restarting it. Everything here is inert unless `config.combatLab` is set, which only
 * `setCombatLabLevel` does, and only in a City Rumble ruleset match with no campaign mission or raid (the app calls it
 * between ticks, like `resolveRaid`; online matches never do).
 *
 * One combat system, four settings:
 *  - TIMINGS: every catalogue attack's startup, recoveries and per-target lockout are scaled and capped from the
 *    match's own numbers (kept in `state.combatLab.base`), so each fighter keeps their attack (push / shove / daze)
 *    and its daze, displacement and immunity; a victim's daze immunity is untouched (no stun-lock at any level);
 *  - REACH: the four neighbours as before, plus (by level) the faced side's two corners, the tile two ahead through an
 *    open tile, and the two tiles two ahead and one aside. Never through concrete or crates: a corner needs one open
 *    side tile, a two-tile reach an open tile between;
 *  - AIM: with `autoTarget` the fighter turns to a rival it can reach on another side;
 *  - PRESSES: a B press that cannot start yet (recovering, a short daze) is kept `bufferTicks` and done when it can;
 *    with nobody in reach and nothing else for B to do, the press is a visible swing at the air (a clear miss).
 *
 * B HOLD stays the Remote Detonator (input/specialHold.ts decides tap vs hold before the sim sees anything): the lab
 * adds no hold-to-repeat; rapid punching is rapid tapping, kept by the buffer.
 *
 * Diagnostics per seat (`state.combatLab.stats`): presses, attacks started, air swings, hits, whiffs, presses kept by
 * the buffer and presses that did nothing. Read by the pause menu and the `?debug` handle; never drawn over the board.
 */
import { CLASSIC_COMBAT_PRESET, COMBAT_LAB_PRESETS } from '../config';
import type { AttackSpec, CombatLabLevel, CombatLabPreset, GameConfig } from '../config';
import { DIRS, DIR_VEC, OPPOSITE, tileAt } from '../grid';
import type { GridView } from '../grid';
import { RUMBLE_MODES } from '../modes';
import { Tile } from '../types';
import type { AttackKind, CombatLabStats, Dir, GameState, Player } from '../types';

export const combatLabOf = (view: { readonly config: GameConfig }): CombatLabPreset | null =>
  view.config.combatLab ?? null;

/** May this match use the lab? Local City Rumble rulesets only: never a campaign mission, a raid or Classic. */
export function combatLabAllowed(state: Pick<GameState, 'settings' | 'mission' | 'raid'>): boolean {
  return RUMBLE_MODES.includes(state.settings.game) && !state.mission && !state.raid;
}

const emptyStats = (): CombatLabStats => ({
  presses: 0,
  started: 0,
  airSwings: 0,
  hits: 0,
  whiffs: 0,
  kept: 0,
  dropped: 0,
});

/** The lab statistics of a seat (created on first use; only while the lab runtime exists). */
export function labStats(state: GameState, id: number): CombatLabStats | null {
  const lab = state.combatLab;
  if (!lab) return null;
  return (lab.stats[id] ??= emptyStats());
}

/** One attack's numbers at a preset: never slower than the match's own, always at least one tick of startup. */
export function labAttackSpec(base: AttackSpec, preset: CombatLabPreset): AttackSpec {
  const recovery = (ticks: number): number =>
    Math.min(
      ticks,
      Math.max(
        preset.minRecoveryTicks,
        Math.min(preset.maxRecoveryTicks, Math.round(ticks * preset.recoveryScale)),
      ),
    );
  return {
    ...base,
    startupTicks: Math.max(
      1,
      Math.min(
        base.startupTicks,
        preset.maxStartupTicks,
        Math.round(base.startupTicks * preset.startupScale),
      ),
    ),
    hitRecoveryTicks: recovery(base.hitRecoveryTicks),
    whiffRecoveryTicks: recovery(base.whiffRecoveryTicks),
    targetLockoutTicks: Math.min(
      base.targetLockoutTicks,
      preset.maxLockoutTicks,
      Math.round(base.targetLockoutTicks * preset.lockoutScale),
    ),
  };
}

/**
 * Switches the lab to `level` (1-4) or off (0) in a running match, between ticks. Returns false (and changes nothing)
 * when the match may not use the lab. Attacks already winding up resolve with the numbers they started with.
 */
export function setCombatLabLevel(state: GameState, level: CombatLabLevel | 0): boolean {
  if (!combatLabAllowed(state)) return false;
  state.combatLab ??= {
    level: 0,
    base: structuredClone(state.config.skills.attacks),
    stats: {},
    buffered: {},
  };
  const lab = state.combatLab;
  lab.level = level;
  lab.buffered = {};
  const base = lab.base;
  if (level === 0) {
    state.config.skills.attacks = structuredClone(base);
    delete state.config.combatLab;
    return true;
  }
  const preset = COMBAT_LAB_PRESETS[level];
  const attacks = {} as Record<AttackKind, AttackSpec>;
  for (const kind of Object.keys(base) as AttackKind[]) attacks[kind] = labAttackSpec(base[kind], preset);
  state.config.skills.attacks = attacks;
  state.config.combatLab = structuredClone(preset);
  return true;
}

/**
 * Local CLASSIC BATTLE (decision CC-F1): the lab's Level 2 feel, pinned on for the match and never switchable. Same
 * mechanism as `setCombatLabLevel` (scaled catalogue attacks, `config.combatLab`, the kept-press runtime) with the
 * cardinal-only preset `CLASSIC_COMBAT_PRESET`. The app calls it right after `createGame` for a local Classic Battle;
 * `createGame` itself, raids, missions, City Rumble and online matches never get it. Returns false (nothing changed)
 * for any other ruleset.
 */
export function applyClassicCombat(state: GameState): boolean {
  if (state.settings.game !== 'classic' || state.mission || state.raid || state.combatLab) return false;
  const base = structuredClone(state.config.skills.attacks);
  const attacks = {} as Record<AttackKind, AttackSpec>;
  for (const kind of Object.keys(base) as AttackKind[])
    attacks[kind] = labAttackSpec(base[kind], CLASSIC_COMBAT_PRESET);
  state.config.skills.attacks = attacks;
  state.config.combatLab = structuredClone(CLASSIC_COMBAT_PRESET);
  state.combatLab = { level: CLASSIC_COMBAT_PRESET.level, base, stats: {}, buffered: {}, classic: true };
  return true;
}

/** The look and sound preset for a seat's close attacks: the lab's, or (a human in a mission or raid) the classic one. */
export function feelPresetFor(
  state: Pick<GameState, 'config' | 'mission' | 'raid'>,
  attacker: Readonly<Player> | undefined,
): CombatLabPreset | null {
  if (state.config.combatLab) return state.config.combatLab;
  if ((state.mission || state.raid) && attacker && attacker.enemyKind === undefined)
    return CLASSIC_COMBAT_PRESET;
  return null;
}

// ------------------------------------------------------------------ reach

const open = (view: GridView, x: number, y: number): boolean => tileAt(view, x, y) === Tile.Empty;

interface Spot {
  dx: number;
  dy: number;
  /** The tiles the reach passes through: every tile of at least one of these routes must be open floor. */
  routes: readonly (readonly [number, number])[][];
}

/** The tiles a preset reaches in front of a fighter facing `dir`, nearest first (adjacent tiles have no route). */
function shape(preset: CombatLabPreset, dir: Dir): Spot[] {
  const f = DIR_VEC[dir];
  const side = { dx: -f.dy, dy: f.dx }; // perpendicular
  const out: Spot[] = [{ dx: f.dx, dy: f.dy, routes: [[]] }];
  if (preset.forwardDiagonals) {
    for (const s of [1, -1]) {
      const dx = f.dx + side.dx * s;
      const dy = f.dy + side.dy * s;
      // a corner is reached past one open side tile (never squeezed between two walls)
      out.push({ dx, dy, routes: [[[f.dx, f.dy]], [[side.dx * s, side.dy * s]]] });
    }
  }
  if (preset.reachTwo) out.push({ dx: f.dx * 2, dy: f.dy * 2, routes: [[[f.dx, f.dy]]] });
  if (preset.reachTwoWide) {
    for (const s of [1, -1]) {
      const dx = f.dx * 2 + side.dx * s;
      const dy = f.dy * 2 + side.dy * s;
      out.push({
        dx,
        dy,
        routes: [
          [
            [f.dx, f.dy],
            [f.dx + side.dx * s, f.dy + side.dy * s],
          ],
          [
            [f.dx, f.dy],
            [f.dx * 2, f.dy * 2],
          ],
          [
            [side.dx * s, side.dy * s],
            [f.dx + side.dx * s, f.dy + side.dy * s],
          ],
        ],
      });
    }
  }
  return out;
}

const reachable = (view: GridView, p: Readonly<Player>, s: Spot): boolean =>
  s.routes.some((route) => route.every(([dx, dy]) => open(view, p.x + dx, p.y + dy)));

/** The direction a fighter turns to for a rival at (dx, dy): the dominant axis, the faced one on a tie. */
function turnTo(facing: Dir, dx: number, dy: number): Dir {
  const v = DIR_VEC[facing];
  if (Math.abs(dx) === Math.abs(dy) && (Math.sign(dx) === v.dx || Math.sign(dy) === v.dy)) return facing;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * The rival a lab attack reaches from `p`: the faced side's shape first, then (the four neighbours always; the whole
 * shape with `autoTarget`) the other sides in the fixed order up, right, down, left. `spots` lets a rival who began
 * stepping away still count on the tile it left (step grace). Deterministic (players in id order).
 */
export function labReach<P extends Readonly<Player>>(
  view: GridView & { readonly players: readonly P[]; readonly config: GameConfig },
  p: Readonly<Player>,
  ok: (o: P) => boolean,
  spots: (o: P) => readonly { x: number; y: number }[] = (o) => [{ x: o.x, y: o.y }],
): { target: P; dir: Dir } | null {
  const preset = combatLabOf(view);
  if (!preset) return null;
  const order: Dir[] = [p.facing, ...DIRS.filter((d) => d !== p.facing)];
  for (const dir of order) {
    const front = dir === p.facing;
    const tiles = front || preset.autoTarget ? shape(preset, dir) : shape(preset, dir).slice(0, 1);
    for (const s of tiles) {
      if (!reachable(view, p, s)) continue;
      const x = p.x + s.dx;
      const y = p.y + s.dy;
      const target = view.players.find(
        (o) => o.alive && o.id !== p.id && ok(o) && spots(o).some((t) => t.x === x && t.y === y),
      );
      if (target) return { target, dir: front ? p.facing : turnTo(p.facing, s.dx, s.dy) };
    }
  }
  return null;
}

/** Is a fighter with a pending lab attack in `dir` still in reach of the rival standing on (x, y)? */
export function labReachesSpot(
  view: GridView & { readonly config: GameConfig },
  p: Readonly<Player>,
  dir: Dir,
  x: number,
  y: number,
): boolean {
  const preset = combatLabOf(view);
  if (!preset) return false;
  // the attack's own direction, and any neighbour (a rival who stepped round the fighter during the startup)
  const tiles = [
    ...shape(preset, dir),
    ...DIRS.filter((d) => d !== dir && d !== OPPOSITE[dir]).map((d) => shape(preset, d)[0]!),
  ];
  if (Math.abs(x - p.x) + Math.abs(y - p.y) === 1) return true;
  return tiles.some((s) => p.x + s.dx === x && p.y + s.dy === y && reachable(view, p, s));
}
