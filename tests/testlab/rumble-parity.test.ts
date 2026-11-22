/**
 * City Rumble parity (docs/TEST_LAB.md, decision TL6). The founder won a normal 16-fighter City Rumble but found the Test
 * Lab's 16-fighter City Rumble much harder. Both start the same engine through the same `commands.start`; what differed
 * was the SETTINGS: the lab mapped Easy / Normal / Hard to Beginner / Casual / Standard bots, a normal match defaults to
 * Rookie. These tests pin the fix: the lab holds the same fields a normal match reads, can copy the player's real saved
 * ones, and the lab's launch and the normal menu's launch with the same settings and seed build identical `GameOptions`
 * and play out identically (state hash after N ticks, with the real bots).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createBot } from '../../src/ai';
import { MatchController } from '../../src/app/MatchController';
import { buildMatchOptions } from '../../src/app/names';
import type { InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS, RUMBLE_SIZES, parseSettings } from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { campaignEnemyLevel, DIFFICULTIES, RUMBLE_ARENA_IDS } from '../../src/sim';
import type { Intent, SimEvent } from '../../src/sim';
import { copyCurrentRumbleSettings, setRumbleField } from '../../src/testlab/labActions';
import { labPatch, useLab } from '../../src/testlab/labStore';
import {
  applyRumbleConfig,
  botLevels,
  defaultRumbleConfig,
  describeRumbleConfig,
  realSettingsFrom,
  rumbleConfigOf,
  rumbleSummaryLine,
} from '../../src/testlab/rumbleSetup';
import { resetRealSnapshotForTests, captureRealSettings } from '../../src/testlab/realSnapshot';
import { setupSummary } from '../../src/app/setupSummary';
import { hashOf } from '../raid-helpers';

class FakeInput implements InputPort {
  navMode = false;
  pollDevices(): void {}
  buildIntent(): Intent {
    return {};
  }
  clear(): void {}
}
class FakeRenderer implements RendererPort {
  loadGame(): void {}
  handleEvents(_events: readonly SimEvent[]): void {}
  render(): void {}
  pickEntry(): null {
    return null;
  }
  setQuality(): void {}
}

/** A started match as the game starts it: the controller, the real bot factory, the given settings and seed. */
function launch(settings: GameSettings, seed: number): MatchController {
  const c = new MatchController({
    renderer: new FakeRenderer(),
    input: new FakeInput(),
    botFactory: createBot,
  });
  c.start(settings, seed);
  return c;
}

/**
 * What the player's saved settings can look like when the lab opens: Rookie default, the old Easy / Normal levels, a
 * mixed roster, every size, every mode, every stage.
 */
const SAVED: readonly Record<string, unknown>[] = [
  {}, // nothing customised
  { play: 'rumble', rumbleCompetitors: 16, difficulty: 'rookie', rumbleMode: 'deathmatch' },
  {
    play: 'classic',
    rumbleCompetitors: 24,
    difficulty: 'casual',
    rumbleMode: 'team',
    rumbleArenaId: 'rumbleLagosIsland',
    friendlyFire: true,
  },
  {
    play: 'rumble',
    rumbleCompetitors: 8,
    difficulty: 'nightmare',
    rumbleMode: 'survival',
    rumbleMixed: true,
  },
  {
    play: 'rumble',
    rumbleCompetitors: 32,
    difficulty: 'skilled',
    rumbleMode: 'deathmatch',
    rumbleMinutes: 3,
    character: 'lekkiBoy',
    rumbleMixed: true,
  },
  {
    rumbleArenaId: 'rumbleLekki',
    difficulty: 'beginner',
    character: 'ajegunleKid',
    cameraView: 'overview',
    moveStyle: 'beginner',
  },
  { difficulty: 'easy', rumbleArenaId: 'rumbleOjuelegba' }, // an old save: Easy maps to Beginner, never silently to Rookie
];

afterEach(() => {
  resetRealSnapshotForTests();
});

describe('the root cause: the lab mapped Easy / Normal / Hard, a normal match defaults to Rookie', () => {
  it('the three campaign levels never gave Rookie, the normal default', () => {
    expect(DEFAULT_GAME_SETTINGS.difficulty).toBe('rookie');
    expect((['easy', 'normal', 'hard'] as const).map(campaignEnemyLevel)).toEqual([
      'beginner',
      'casual',
      'standard',
    ]);
    expect(DIFFICULTIES.indexOf('rookie')).toBe(0); // the weakest level: the lab's default was two steps above it
  });

  it('the lab’s City Rumble can now start with every bot level, Rookie included, and its default is the game’s default', () => {
    expect(defaultRumbleConfig().difficulty).toBe('rookie');
    for (const d of DIFFICULTIES) {
      const s = applyRumbleConfig(DEFAULT_GAME_SETTINGS, { ...defaultRumbleConfig(), difficulty: d });
      const bots = buildMatchOptions(s, 5).players.filter((p) => p.isBot);
      expect(bots.length).toBe(15);
      expect(bots.every((p) => p.difficulty === d)).toBe(true);
    }
  });
});

describe('what the lab reproduces', () => {
  it('every arena, size, mode, level, duration, mixed roster and fighter a normal match offers builds the same options', () => {
    const base: GameSettings = { ...DEFAULT_GAME_SETTINGS, muted: true, quality: 'low' }; // other prefs never matter
    const seed = 321;
    for (const arena of RUMBLE_ARENA_IDS)
      for (const size of RUMBLE_SIZES)
        for (const mode of ['survival', 'deathmatch', 'team'] as const) {
          const normal: GameSettings = {
            ...DEFAULT_GAME_SETTINGS,
            play: 'rumble',
            rumbleArenaId: arena,
            rumbleCompetitors: size,
            rumbleMode: mode,
            difficulty: 'standard',
            rumbleMixed: size % 16 === 0,
            rumbleMinutes: size === 8 ? 3 : 5,
            friendlyFire: mode === 'team' && size === 24,
            character: size === 32 ? 'lekkiBoy' : 'streetBaller',
          };
          const lab = applyRumbleConfig(base, rumbleConfigOf(normal));
          expect(buildMatchOptions(lab, seed)).toEqual(buildMatchOptions(normal, seed));
        }
  });

  it('a mixed roster spreads the levels around the preset exactly as the normal menu does', () => {
    const cfg = {
      ...defaultRumbleConfig(),
      difficulty: 'standard' as const,
      rumbleMixed: true,
      rumbleCompetitors: 24 as const,
    };
    const bots = botLevels(cfg);
    expect(bots.lowest).not.toBe(bots.highest);
    const lines = describeRumbleConfig(cfg);
    expect(lines.find((l) => l.label === 'Bot level')!.value).toContain('mixed roster');
  });

  it('the configuration shown before Start says everything the match will use', () => {
    const cfg = rumbleConfigOf(
      parseSettings(
        JSON.stringify({
          play: 'rumble',
          rumbleArenaId: 'rumbleLagosIsland',
          rumbleCompetitors: 24,
          rumbleMode: 'team',
          friendlyFire: true,
          difficulty: 'casual',
          character: 'lekkiBoy',
          rumbleMinutes: 3,
        }),
      ),
    );
    const text = Object.fromEntries(describeRumbleConfig(cfg).map((l) => [l.label, l.value]));
    expect(text.Mode).toBe('Team Deathmatch');
    expect(text.Stage).toBe('Lagos Island');
    expect(text.Fighters).toBe('24 (12 v 12, you and 23 bots)');
    expect(text['Bot level']).toBe('Casual');
    expect(text.Duration).toBe('3 min');
    expect(text['Friendly fire']).toBe('On');
    expect(text['Your fighter']).toBe('Lekki Boy');
    expect(text.Seed).toContain('random');
    // and one line, the very text the normal menu shows under Play
    expect(rumbleSummaryLine(cfg)).toBe(setupSummary(applyRumbleConfig(DEFAULT_GAME_SETTINGS, cfg)));
    expect(rumbleSummaryLine(cfg)).toContain('Casual bots');
  });
});

describe('Use Current Rumble Settings', () => {
  it('copies the player’s real saved settings (read before isolation, never written back)', () => {
    captureRealSettings({
      getItem: () =>
        JSON.stringify({
          play: 'rumble',
          rumbleCompetitors: 32,
          difficulty: 'rookie',
          rumbleMode: 'survival',
        }),
    });
    // the lab starts from defaults, then copies
    labPatch({ rumble: { ...defaultRumbleConfig(), rumbleCompetitors: 8 }, rumbleSource: 'custom' });
    expect(copyCurrentRumbleSettings()).toBe(true);
    const s = useLab.getState();
    expect(s.rumbleSource).toBe('current');
    expect(s.rumble.rumbleCompetitors).toBe(32);
    expect(s.rumble.rumbleMode).toBe('survival');
    expect(s.rumble.difficulty).toBe('rookie');
  });

  it('with nothing saved there is nothing to copy; changing any field marks the set-up custom, changing it back restores "current"', () => {
    expect(copyCurrentRumbleSettings()).toBe(false);
    const real = parseSettings(JSON.stringify({ rumbleCompetitors: 24, difficulty: 'casual' }));
    labPatch({ realSettings: real, rumble: rumbleConfigOf(real), rumbleSource: 'current' });
    setRumbleField('difficulty', 'expert');
    expect(useLab.getState().rumbleSource).toBe('custom');
    setRumbleField('difficulty', 'casual');
    expect(useLab.getState().rumbleSource).toBe('current');
    expect(realSettingsFrom(null)).toBeNull();
  });
});

describe('the lab’s launch and the normal menu’s launch are the same match', () => {
  /** The settings after the lab applied a copy of the player's saved ones, over a lab store that has its own defaults. */
  const labSettings = (saved: unknown): { normal: GameSettings; lab: GameSettings } => {
    const real = parseSettings(JSON.stringify(saved));
    const normal: GameSettings = { ...real, play: 'rumble' }; // the player picks City Rumble on the normal menu
    const labStore: GameSettings = { ...DEFAULT_GAME_SETTINGS, muted: true, subtitles: 'on' }; // in-memory, never the saved one
    return { normal, lab: applyRumbleConfig(labStore, rumbleConfigOf(real)) };
  };

  for (const [i, saved] of SAVED.entries())
    it(`saved settings #${i}: identical options, identical first state, identical play for 240 ticks`, () => {
      const { normal, lab } = labSettings(saved);
      const seed = 7000 + i;
      expect(buildMatchOptions(lab, seed)).toEqual(buildMatchOptions(normal, seed));
      const a = launch(normal, seed);
      const b = launch(lab, seed);
      expect(hashOf(b.state)).toBe(hashOf(a.state)); // the initial state
      for (let t = 0; t < 240; t++) {
        a.stepOnce();
        b.stepOnce();
      }
      expect(b.state!.tick).toBe(a.state!.tick);
      expect(hashOf(b.state)).toBe(hashOf(a.state)); // after N ticks of the real bots
      expect(a.state!.tick).toBeGreaterThanOrEqual(240);
    });

  it('the lab’s old Easy mapping really was a different match (the bug): Beginner bots instead of Rookie', () => {
    const rookie = { ...DEFAULT_GAME_SETTINGS, play: 'rumble' as const };
    const oldLab = { ...rookie, difficulty: campaignEnemyLevel('easy') };
    expect(buildMatchOptions(oldLab, 9)).not.toEqual(buildMatchOptions(rookie, 9));
    const a = launch(rookie, 9);
    const b = launch(oldLab, 9);
    for (let t = 0; t < 600; t++) {
      a.stepOnce();
      b.stepOnce();
    }
    expect(hashOf(b.state)).not.toBe(hashOf(a.state));
  });

  it('does not change the normal game’s defaults: 16 fighters, Free-for-All, Rookie, Oshodi', () => {
    expect(DEFAULT_GAME_SETTINGS).toMatchObject({
      play: 'rumble',
      rumbleCompetitors: 16,
      rumbleMode: 'deathmatch',
      difficulty: 'rookie',
      rumbleArenaId: 'rumbleOshodi',
    });
  });
});
