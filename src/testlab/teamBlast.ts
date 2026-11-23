/**
 * The Team Blast lab scenes (decision TB4, docs/TEST_LAB.md): a small REAL Team Rumble (you, a teammate, two rivals) on a
 * City Rumble stage, so the founder can judge the viewer-relative blast warnings without waiting through full matches. It is
 * a representative match, not a rendering demo: the match options are the normal game's (`buildMatchOptions`, the team
 * ruleset, friendly fire as chosen), the blasts are laid by the other seats through the real `place` intent (so they carry
 * their real owner, fuse, range and chain behaviour), and the warnings, flames and damage are the game's own. The only
 * script is WHEN and WHERE the other seats lay their generators (a director feeding intents, exactly what the Training
 * Academy does); you play your own fighter with the real controls, and your own generators are yours to place (tap A).
 * Everyone else stands still; a fighter who falls respawns as in any Team Rumble.
 */
import { Tile, createGame, tileAt } from '../sim';
import type { GameState, Intents } from '../sim';
import { buildMatchOptions } from '../app/names';
import type { GameSettings } from '../app/settings';
import type { ScenarioDirector } from '../app/MatchController';

export type TeamBlastVariant = 'ffOff' | 'ffOn' | 'overlap';

/** Roles, resolved to seats from the match's real teams (the sim seats teams alternately: you and seat 2 against 1 and 3). */
type Role = 'me' | 'mate' | 'rivalA' | 'rivalB';
const MATE: Role = 'mate';
const RIVAL_A: Role = 'rivalA';
const RIVAL_B: Role = 'rivalB';

interface Lay {
  by: Role;
  /** Tile offset from the open area's centre. */
  dx: number;
  dy: number;
}

/** One wave: generators laid on the same tick (they explode together after the fuse). */
type Wave = readonly Lay[];

const WAVES: Record<string, Wave> = {
  /** A teammate's blast on its own: SAFE with friendly fire off. */
  mate: [{ by: MATE, dx: 0, dy: 0 }],
  /** A rival's blast on its own: always DANGEROUS. */
  rival: [{ by: RIVAL_A, dx: 0, dy: 0 }],
  /** A teammate's and a rival's blast side by side: the shared tiles must show DANGER. */
  overlap: [
    { by: MATE, dx: -1, dy: 0 },
    { by: RIVAL_A, dx: 1, dy: 0 },
  ],
  /** Adjacent generators: the teammate's blast sets the rival's off (a chain): each link keeps its own owner's colour. */
  chain: [
    { by: MATE, dx: 0, dy: 0 },
    { by: RIVAL_A, dx: 1, dy: 0 },
  ],
  /** Three at once, a teammate between two rivals. */
  triple: [
    { by: RIVAL_A, dx: -2, dy: 0 },
    { by: MATE, dx: 0, dy: 0 },
    { by: RIVAL_B, dx: 2, dy: 0 },
  ],
};

const SEQUENCES: Record<TeamBlastVariant, readonly (keyof typeof WAVES)[]> = {
  ffOff: ['mate', 'rival', 'overlap', 'chain'],
  ffOn: ['mate', 'rival', 'overlap'],
  overlap: ['overlap', 'triple', 'chain'],
};

/** Ticks between the start of one wave and the next (fuse 3 s + flames 0.6 s + a breath to read the result). */
const WAVE_PERIOD = 60 * 9;
const FIRST_WAVE = 60 * 2;

/** Where the three other seats stand (offsets from the centre): clear of every wave's reach. */
const STAND: Record<Role, { dx: number; dy: number }> = {
  me: { dx: -5, dy: 3 },
  mate: { dx: 5, dy: 3 },
  rivalA: { dx: 5, dy: -3 },
  rivalB: { dx: -5, dy: -3 },
};

const NAMES: Record<Role, string> = { me: 'YOU', mate: 'TEAMMATE', rivalA: 'RIVAL 1', rivalB: 'RIVAL 2' };

/** The seat of each role: you (0), the other seat on your team, then the two seats of the other team. */
export function rolesOf(teams: readonly number[]): Record<Role, number> {
  const mate = teams.findIndex((t, i) => i > 0 && t === teams[0]);
  const rivals = teams.map((t, i) => (i > 0 && t !== teams[0] ? i : -1)).filter((i) => i >= 0);
  return { me: 0, mate, rivalA: rivals[0]!, rivalB: rivals[1]! };
}

/**
 * The floor window nearest the arena's centre with no permanent wall in it (crates inside it are cleared by the scene, so the
 * test is not about who can reach what). 11 x 7 is the smallest window the waves and the standing tiles need.
 */
export function findOpenCentre(state: GameState, w = 11, h = 7): { x: number; y: number } | null {
  const cx = state.width / 2;
  const cy = state.height / 2;
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y + h <= state.height; y++)
    for (let x = 0; x + w <= state.width; x++) {
      let ok = true;
      for (let j = 0; j < h && ok; j++)
        for (let i = 0; i < w && ok; i++) {
          const t = tileAt(state, x + i, y + j);
          ok = t === Tile.Empty || t === Tile.Soft;
        }
      if (!ok) continue;
      const mx = x + (w - 1) / 2;
      const my = y + (h - 1) / 2;
      const d = (mx - cx) ** 2 + (my - cy) ** 2;
      if (!best || d < best.d) best = { x: x + (w - 1) / 2, y: y + (h - 1) / 2, d };
    }
  return best ? { x: Math.round(best.x), y: Math.round(best.y) } : null;
}

const put = (state: GameState, id: number, x: number, y: number): void => {
  const p = state.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
};

export interface TeamBlastScene {
  state: GameState;
  director: ScenarioDirector;
}

/**
 * Builds the scene for `variant` from the player's own settings (fighter) on `arenaId`; null if the stage has no open
 * floor large enough (never for the stages used). Deterministic for a seed.
 */
export function buildTeamBlastScene(
  variant: TeamBlastVariant,
  settings: GameSettings,
  seed = 2024,
  arenaId = 'rumbleLagosIsland',
): TeamBlastScene | null {
  const base: GameSettings = {
    ...settings,
    play: 'rumble',
    rumbleMode: 'team',
    rumbleArenaId: arenaId,
    // exactly four seats (you, a teammate, two rivals): not one of the menu's sizes, like the Sudden Death test
    rumbleCompetitors: 4 as unknown as GameSettings['rumbleCompetitors'],
    rumbleMixed: false,
    friendlyFire: variant === 'ffOn',
  };
  const options = buildMatchOptions(base, seed);
  const state = createGame({
    ...options,
    players: options.players.map((p) => ({ ...p, isBot: false })),
    // a test of the blast warnings, not of the stage: its hazards and the crowd stay out of the picture (`stageHazards` is
    // the tutorials-and-tests switch; no menu option exists for it)
    settings: { ...options.settings, stageHazards: false, crowdThrows: false },
  });
  const seat = rolesOf(state.players.map((p) => p.team));
  (Object.keys(seat) as Role[]).forEach((role) => (state.players[seat[role]]!.name = NAMES[role]));
  // a representative, endless-enough match: the stage does not close in on the test and the clock is not the point
  state.crush = null;
  state.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  const centre = findOpenCentre(state);
  if (!centre) return null;
  // the window is plain floor: crates (and what they hide) inside it are cleared
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -5; dx <= 5; dx++) {
      const idx = (centre.y + dy) * state.width + centre.x + dx;
      if (state.tiles[idx] !== Tile.Soft) continue;
      state.tiles[idx] = Tile.Empty;
      delete state.hidden[idx];
      const supply = state.supplies.indexOf(idx);
      if (supply >= 0) state.supplies.splice(supply, 1);
    }
  for (const role of Object.keys(seat) as Role[]) {
    const at = STAND[role];
    put(state, seat[role], centre.x + at.dx, centre.y + at.dy);
  }
  state.players.forEach((p) => (p.protectedUntil = 0));

  const sequence = SEQUENCES[variant];
  const moved = new Map<number, { x: number; y: number }>();
  const director: ScenarioDirector = {
    humanInput: true,
    beforeTick(s) {
      const intents: Intents = {};
      const since = s.tick - FIRST_WAVE;
      if (since < 0 || since % WAVE_PERIOD !== 0) return { intents, ui: [] };
      const wave = WAVES[sequence[(since / WAVE_PERIOD) % sequence.length]!]!;
      for (const lay of wave) {
        const id = seat[lay.by];
        const p = s.players[id];
        if (!p || !p.alive) continue;
        // the seat steps onto its tile for this tick and lays a generator with the real `place` intent
        moved.set(id, { x: p.x, y: p.y });
        put(s, id, centre.x + lay.dx, centre.y + lay.dy);
        intents[id] = { place: true };
      }
      return { intents, ui: [] };
    },
    afterTick(s) {
      for (const [id, at] of moved) put(s, id, at.x, at.y);
      moved.clear();
    },
  };
  return { state, director };
}
