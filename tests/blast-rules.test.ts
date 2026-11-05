/**
 * Bomb geometry belongs to the RULESET (decision CC2, docs/CAMPAIGN_EXPANSION_PLAN.md section 2): radial for
 * Survival / Deathmatch / Team and campaign field missions, cross (the classic plus) for Classic Battle and
 * raids. There is no setting. Multiplayer behaviour is byte-for-byte what it was with the old toggle at 'radial'.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { BLAST_RULE_BY_GAME, createGame, inDisc, observe, tick, blastConfig, ARENAS } from '../src/sim';
import type { Difficulty, GameKind, GameOptions, GameState, Intents } from '../src/sim';
import { Tile } from '../src/sim/types';
import { DEFAULT_GAME_SETTINGS } from '../src/app/settings';
import { matchRules } from '../src/app/names';
import { addGenerator, flameKeys, put, run } from './helpers';

const ALL_KINDS: readonly GameKind[] = ['classic', 'survival', 'deathmatch', 'team', 'mission', 'raid'];

function make(game: GameKind, arenaId: string): GameState {
  return createGame({
    seed: 9,
    arenaId,
    players: Array.from({ length: 4 }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller',
      isBot: i > 0,
    })),
    settings: { game, stageHazards: false },
  });
}

/** An open floor with players parked in the far corner so only the blast under test burns. */
function openFloor(state: GameState): GameState {
  state.tiles = state.tiles.map(() => Tile.Empty);
  state.hidden = {};
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  for (let i = 0; i < state.players.length; i++) put(state, i, 1 + i, 1);
  return state;
}

describe('the ruleset table', () => {
  it('names a rule for every GameKind (exhaustive) and only radial / cross', () => {
    expect(Object.keys(BLAST_RULE_BY_GAME).sort()).toEqual([...ALL_KINDS].sort());
    for (const kind of ALL_KINDS) expect(['radial', 'cross']).toContain(BLAST_RULE_BY_GAME[kind]);
  });

  it('is radial for survival / deathmatch / team / mission and cross for classic / raid', () => {
    expect(BLAST_RULE_BY_GAME).toEqual({
      classic: 'cross',
      survival: 'radial',
      deathmatch: 'radial',
      team: 'radial',
      mission: 'radial',
      raid: 'cross',
    });
  });
});

describe('createGame gives the table geometry for every GameKind', () => {
  for (const kind of ALL_KINDS) {
    it(`${kind}: ${BLAST_RULE_BY_GAME[kind]}`, () => {
      const arena = kind === 'classic' || kind === 'raid' ? 'danfoBusPark' : 'rumbleOjuelegba';
      const s = make(kind, arena);
      expect(s.config.generator.blastMode).toBe(BLAST_RULE_BY_GAME[kind] === 'radial' ? 'radial' : 'plus');
      if (BLAST_RULE_BY_GAME[kind] === 'radial') {
        expect(s.config.generator.maxRange).toBe(5);
        expect(s.players.every((p) => p.capacity === 2)).toBe(true);
      }
    });
  }

  it('an arena that widens the cross itself (Power Yard full line) keeps it under the classic rule', () => {
    expect(make('classic', 'surulerePowerYard').config.generator.blastMode).toBe('fullLine');
    expect(blastConfig('classic', ARENAS.danfoBusPark!).generator?.blastMode).toBe('plus');
  });

  it('a stale rumbleBlast setting from an old build is ignored by the ruleset', () => {
    const s = createGame({
      seed: 9,
      arenaId: 'rumbleOjuelegba',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: true },
      ],
      settings: { game: 'survival', stageHazards: false, rumbleBlast: 'cross' } as never,
    });
    expect(s.config.generator.blastMode).toBe('radial');
  });

  it('the app builds match settings without any blast field', () => {
    expect('rumbleBlast' in matchRules({ ...DEFAULT_GAME_SETTINGS, play: 'rumble' })).toBe(false);
    expect('rumbleBlast' in matchRules({ ...DEFAULT_GAME_SETTINGS, play: 'classic' })).toBe(false);
  });
});

describe('real blast footprints match the rule', () => {
  const cx = 7;
  const cy = 5;
  const burn = (kind: GameKind, arena: string, walls: [number, number][] = []): string[] => {
    const s = openFloor(make(kind, arena));
    for (const [x, y] of walls) s.tiles[y * s.width + x] = Tile.Hard;
    // a stage where the board is large enough for the disc around (7,5); the player parking tiles stay clear of it
    addGenerator(s, { ownerId: 0, x: cx, y: cy, timer: 1, range: 2 });
    run(s, 1);
    return flameKeys(s);
  };

  it('radial games burn the disc (diagonals included); cross games burn only the plus', () => {
    for (const kind of ALL_KINDS) {
      const arena = BLAST_RULE_BY_GAME[kind] === 'radial' ? 'rumbleOjuelegba' : 'danfoBusPark';
      const keys = burn(kind, arena);
      if (BLAST_RULE_BY_GAME[kind] === 'radial') {
        expect(keys, kind).toHaveLength(21);
        for (const k of keys) {
          const [x, y] = k.split(',').map(Number) as [number, number];
          expect(inDisc(x - cx, y - cy, 2), `${kind} ${k}`).toBe(true);
        }
        expect(keys).toContain(`${cx + 1},${cy + 1}`);
      } else {
        expect(keys, kind).toHaveLength(9); // centre + 2 arms of 2 in each of four directions
        expect(keys).not.toContain(`${cx + 1},${cy + 1}`);
        for (const k of keys) {
          const [x, y] = k.split(',').map(Number) as [number, number];
          expect(x === cx || y === cy, `${kind} ${k}`).toBe(true);
        }
      }
    }
  });

  it('the plus stops at a wall and radial blasts are shadowed by one', () => {
    const plus = burn('raid', 'danfoBusPark', [[cx + 1, cy]]);
    expect(plus).not.toContain(`${cx + 1},${cy}`);
    expect(plus).not.toContain(`${cx + 2},${cy}`);
    expect(plus).toContain(`${cx - 2},${cy}`);
    const disc = burn('mission', 'rumbleOjuelegba', [[cx + 1, cy]]);
    expect(disc).not.toContain(`${cx + 1},${cy}`);
    expect(disc).not.toContain(`${cx + 2},${cy}`); // in the wall's shadow
    expect(disc).toContain(`${cx + 1},${cy + 1}`);
  });
});

describe('multiplayer is unchanged by the ruleset table', () => {
  /** FNV-1a over the JSON of the whole state; the retired `rumbleBlast` setting key is skipped so the hashes recorded on the base commit still apply. */
  function hashState(value: unknown): string {
    const text = JSON.stringify(value, (k, v: unknown) =>
      k === 'rumbleBlast' || k === 'config' ? undefined : v,
    );
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `${h.toString(16)}:${text.length}`;
  }
  function play(options: GameOptions, difficulties: Difficulty[], ticks: number): string {
    const state = createGame(options);
    const bots = difficulties.map((difficulty, id) =>
      createBot({ difficulty, seed: 7 * 31 + id, playerId: id }),
    );
    for (let i = 0; i < ticks; i++) {
      const intents: Intents = {};
      bots.forEach((bot, id) => {
        if (state.players[id]!.alive) intents[id] = bot.decide(observe(state, id));
      });
      tick(state, intents);
    }
    expect(state.players.every((p) => p.vitals === undefined)).toBe(true);
    return hashState(state);
  }
  const levels: Difficulty[] = ['standard', 'rookie', 'skilled', 'casual', 'expert', 'beginner'];
  const rumble = (game: 'survival' | 'deathmatch' | 'team', arenaId: string): GameOptions => ({
    seed: 4242,
    arenaId,
    players: Array.from({ length: 6 }, (_, i) => ({
      name: `R${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
      isBot: true,
    })),
    settings: { game, durationSec: 300 },
  });

  // recorded on the integration base commit 187401d (before the toggle was removed), 6 bots, 1800 ticks
  it('Survival (Mushin, 6 bots)', () => {
    expect(play(rumble('survival', 'rumbleMushin'), levels, 1800)).toBe('37d82fcc:27616');
  });
  it('Deathmatch (Oshodi, 6 bots)', () => {
    expect(play(rumble('deathmatch', 'rumbleOshodi'), levels, 1800)).toBe('6fd15a90:23883');
  });
  it('Team (Lagos Island, 6 bots)', () => {
    expect(play(rumble('team', 'rumbleLagosIsland'), levels, 1800)).toBe('c7b07d92:19375');
  });
  it('Classic (4 bots, 2400 ticks)', () => {
    const o: GameOptions = {
      seed: 4242,
      players: Array.from({ length: 4 }, (_, i) => ({
        name: `R${i}`,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
        isBot: true,
      })),
      settings: { game: 'classic', durationSec: 300 },
    };
    expect(play(o, levels.slice(0, 4), 2400)).toBe('c2c7c992:8087');
  });
});
