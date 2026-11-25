/**
 * Quick Start (decisions FU2-1, FU2-2; SX11 kept): one tap starts an offline City Rumble Free-for-All, never a Classic match.
 * The match built from the Quick Start settings is a real City Rumble one (same builder the menu's Start Match uses), and
 * the saved audio, controls and graphics preferences are not part of what it overrides.
 */
import { describe, expect, it } from 'vitest';
import { ARENAS, DIFFICULTIES, RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS, createGame } from '../../src/sim';
import {
  DEFAULT_GAME_SETTINGS,
  PREFERENCE_KEYS,
  RUMBLE_SIZES,
  sanitizeSettings,
} from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { buildMatchOptions, competitorCount, matchArenaId } from '../../src/app/names';
import { setupSummary } from '../../src/app/setupSummary';
import {
  QUICK_MATCH,
  QUICK_MATCH_ARENA_ID,
  QUICK_MATCH_KEYS,
  quickMatchPatch,
  splitQuickWrite,
} from '../../src/app/quickMatch';

/** A player who saved a Classic setup, a 32-fighter Team Rumble and non-default audio / controls / graphics. */
const SAVED: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  play: 'classic',
  competitors: 4,
  arenaId: 'balogunMarket',
  rumbleMode: 'team',
  rumbleCompetitors: 32,
  rumbleMinutes: 5,
  rumbleMixed: true,
  rumbleArenaId: 'rumbleOshodi',
  difficulty: 'nightmare',
  character: 'lekkiBoy',
  quality: 'veryLow',
  muted: true,
  musicVolume: 0.2,
  sfxVolume: 0.3,
  dataSaver: 'on',
  moveAssist: 'off' as GameSettings['moveAssist'],
  moveStyle: 'beginner',
  touchControls: 'on',
  controlSize: 'large',
  cameraView: 'overview',
  shake: 'off',
  vibration: 'off',
};
const applied: GameSettings = { ...SAVED, ...quickMatchPatch() };

describe('Quick Start is an offline City Rumble Free-for-All', () => {
  it('is the Free-for-All ruleset (the sim id `deathmatch`) on a Rumble stage, never a Classic match', () => {
    expect(applied.play).toBe('rumble');
    expect(applied.rumbleMode).toBe('deathmatch');
    const arena = ARENAS[matchArenaId(applied)]!;
    expect(arena.kind).toBe('rumble');
    expect(RUMBLE_ARENA_IDS).toContain(QUICK_MATCH_ARENA_ID);
    expect(STANDARD_ARENA_IDS).not.toContain(QUICK_MATCH_ARENA_ID);
    expect(setupSummary(applied)).toBe(
      'Free-for-All · 16 fighters · 3 min · Ojuelegba Underbridge · Rookie bots',
    );
  });

  it('builds the real match: 16 fighters (1 human + 15 Rookie bots), three minutes, the radial Rumble rules', () => {
    const options = buildMatchOptions(applied, 7);
    expect(options.arenaId).toBe(QUICK_MATCH_ARENA_ID);
    expect(options.settings).toMatchObject({ game: 'deathmatch', durationSec: 180, friendlyFire: false });
    const players = options.players!;
    expect(players).toHaveLength(16);
    expect(players.filter((p) => !p.isBot)).toHaveLength(1);
    expect(players[0]).toMatchObject({ isBot: false, characterId: 'lekkiBoy' }); // the saved fighter
    for (const bot of players.slice(1)) expect(bot).toMatchObject({ isBot: true, difficulty: 'rookie' });
    const state = createGame(options);
    expect(state.arenaId).toBe(QUICK_MATCH_ARENA_ID);
    expect(state.settings.game).toBe('deathmatch');
    expect(state.players).toHaveLength(16);
    expect(state.config.match.durationTicks).toBe(180 * 60);
    expect(state.config.respawn.enabled).toBe(true); // Free-for-All respawns
    expect(state.config.generator.blastMode).toBe('radial'); // the Rumble blast, not the Classic cross
  });

  it('is exactly what choosing City Rumble > Free-for-All with the same choices builds', () => {
    const byHand: GameSettings = {
      ...SAVED,
      play: 'rumble',
      rumbleMode: 'deathmatch',
      rumbleCompetitors: 16,
      rumbleMinutes: 3,
      rumbleMixed: false,
      difficulty: 'rookie',
      rumbleArenaId: QUICK_MATCH_ARENA_ID,
    };
    expect(buildMatchOptions(applied, 99)).toEqual(buildMatchOptions(byHand, 99));
  });

  it('uses the easiest bot level, and the Rookie bots are never spread around it', () => {
    expect(DIFFICULTIES[0]).toBe('rookie');
    expect(applied.difficulty).toBe('rookie');
    expect(applied.rumbleMixed).toBe(false);
  });

  it('survives settings sanitising unchanged, so the match really starts with these rules', () => {
    expect(sanitizeSettings(applied)).toMatchObject({ ...QUICK_MATCH });
    expect(competitorCount(sanitizeSettings(applied))).toBe(16);
  });

  it('does not lower the regular City Rumble maximum: the setup still offers 32 fighters', () => {
    expect(RUMBLE_SIZES).toContain(32);
    expect(competitorCount({ ...DEFAULT_GAME_SETTINGS, play: 'rumble', rumbleCompetitors: 32 })).toBe(32);
    expect(sanitizeSettings({ ...DEFAULT_GAME_SETTINGS, rumbleCompetitors: 32 }).rumbleCompetitors).toBe(32);
  });

  it('returns a fresh object each time (no shared mutable state)', () => {
    expect(quickMatchPatch()).not.toBe(quickMatchPatch());
  });
});

describe('Quick Start respects the saved preferences and never overwrites the saved match setup (SX11)', () => {
  it('overrides only its own seven match keys: every audio, controls, graphics and fighter setting is the saved one', () => {
    for (const k of Object.keys(SAVED) as (keyof GameSettings)[]) {
      if ((QUICK_MATCH_KEYS as readonly string[]).includes(k)) continue;
      expect(applied[k], `${k} must stay the player's own`).toEqual(SAVED[k]);
    }
    // every device / presentation preference (quality, audio, controls, camera ...) is outside the quick keys
    for (const k of PREFERENCE_KEYS) expect(QUICK_MATCH_KEYS as readonly string[]).not.toContain(k);
    expect(QUICK_MATCH_KEYS as readonly string[]).not.toContain('character');
    expect(applied).toMatchObject({
      quality: 'veryLow',
      muted: true,
      musicVolume: 0.2,
      dataSaver: 'on',
      moveStyle: 'beginner',
      touchControls: 'on',
      character: 'lekkiBoy',
    });
  });

  it('the keys are exactly the seven the Quick Start sets', () => {
    expect([...QUICK_MATCH_KEYS].sort()).toEqual(
      [
        'difficulty',
        'play',
        'rumbleArenaId',
        'rumbleCompetitors',
        'rumbleMinutes',
        'rumbleMixed',
        'rumbleMode',
      ].sort(),
    );
  });

  it('a settings write during a Quick Start saves everything except the match values', () => {
    const { live, saved } = splitQuickWrite({
      ...quickMatchPatch(),
      shake: 'off' as const,
      rumbleArenaId: 'rumbleMushin',
      dataSaver: 'off' as const,
    });
    expect(live).toMatchObject({ rumbleArenaId: 'rumbleMushin', shake: 'off', play: 'rumble' });
    expect(saved).toEqual({ shake: 'off', dataSaver: 'off' });
    for (const k of QUICK_MATCH_KEYS) expect(k in saved).toBe(false);
  });

  it("putting the player's own settings back gives exactly the saved ones (nothing left behind)", () => {
    // session.ts: quickBase is the saved settings; the live ones are quickBase + patch; the menu restores quickBase
    let quickBase: GameSettings = SAVED;
    const live = { ...quickBase, ...quickMatchPatch() };
    // a change made meanwhile (sound) reaches the saved settings, a match value does not
    quickBase = { ...quickBase, ...splitQuickWrite({ muted: false, difficulty: 'expert' }).saved };
    expect(quickBase).toEqual({ ...SAVED, muted: false });
    expect(live.difficulty).toBe('rookie');
    expect(quickBase.play).toBe('classic');
    expect(quickBase.rumbleCompetitors).toBe(32);
    expect(quickBase.rumbleArenaId).toBe('rumbleOshodi');
  });
});
