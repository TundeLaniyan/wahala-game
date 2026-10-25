import { describe, expect, it } from 'vitest';
import { MatchController } from '../../src/app/MatchController';
import type { Bot, BotFactory, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS, migrateDifficulty } from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { botDifficulty } from '../../src/app/names';
import { createBot, PROFILES } from '../../src/ai';
import { DIFFICULTIES } from '../../src/sim';
import type { Difficulty, Intent } from '../../src/sim';
import {
  LEVEL_HINT,
  LEVEL_LABEL,
  allBotsPatch,
  botSlots,
  cycleLevel,
  sharedLevel,
  slotLevel,
  slotPatch,
} from '../../src/ui/difficultyPicker';

const classic: GameSettings = { ...DEFAULT_GAME_SETTINGS, play: 'classic', competitors: 4 };

describe('difficulty picker logic', () => {
  it('names and describes all seven levels; a new player starts on Rookie everywhere', () => {
    expect(DIFFICULTIES).toEqual(['rookie', 'beginner', 'casual', 'standard', 'skilled', 'expert', 'nightmare']);
    for (const d of DIFFICULTIES) {
      expect(LEVEL_LABEL[d].length).toBeGreaterThan(3);
      expect(LEVEL_HINT[d].length).toBeGreaterThan(10);
    }
    expect(DEFAULT_GAME_SETTINGS.difficulty).toBe('rookie');
    expect(DEFAULT_GAME_SETTINGS.botDifficulties).toEqual(['rookie', 'rookie', 'rookie']);
  });

  it('tapping a slot cycles through the levels and wraps', () => {
    expect(cycleLevel('rookie')).toBe('beginner');
    expect(cycleLevel('expert')).toBe('nightmare');
    expect(cycleLevel('nightmare')).toBe('rookie');
    expect(cycleLevel('rookie', -1)).toBe('nightmare');
  });

  it('one row per bot slot; a slot change keeps the others; "all bots" sets every slot', () => {
    expect(botSlots(classic)).toBe(3);
    expect(botSlots({ competitors: 2 })).toBe(1);
    const mixed = { ...classic, ...slotPatch(classic, 1, 'expert') };
    expect(mixed.botDifficulties).toEqual(['rookie', 'expert', 'rookie']);
    expect(sharedLevel(mixed)).toBeNull();
    // with only two bots shown, a different third slot does not make it "mixed"
    expect(sharedLevel({ ...mixed, competitors: 2 })).toBe('rookie');
    const all = { ...mixed, ...allBotsPatch('skilled') };
    expect(all.botDifficulties).toEqual(['skilled', 'skilled', 'skilled']);
    expect(all.difficulty).toBe('skilled');
    expect(sharedLevel(all)).toBe('skilled');
    // a missing entry falls back to the overall level
    expect(slotLevel({ botDifficulties: [], difficulty: 'casual' }, 2)).toBe('casual');
  });

  it('old saves migrate easy -> beginner, medium -> standard, hard -> expert', () => {
    expect(migrateDifficulty('easy', 'rookie')).toBe('beginner');
    expect(migrateDifficulty('medium', 'rookie')).toBe('standard');
    expect(migrateDifficulty('hard', 'rookie')).toBe('expert');
    expect(migrateDifficulty('nonsense', 'rookie')).toBe('rookie');
  });
});

describe('per-bot difficulty reaches the bots', () => {
  class FakeInput implements InputPort {
    navMode = false;
    pollDevices(): void {}
    buildIntent(): Intent {
      return {};
    }
    takeVehiclePress(): boolean {
      return false;
    }
    clear(): void {}
  }
  const renderer: RendererPort = {
    loadGame: () => undefined,
    handleEvents: () => undefined,
    render: () => undefined,
    pickEntry: () => null,
    setQuality: () => undefined,
  };

  it('Classic: each bot slot is created with its own level', () => {
    const made: [number, Difficulty][] = [];
    const botFactory: BotFactory = (o) => {
      made.push([o.playerId, o.difficulty]);
      return createBot(o);
    };
    const c = new MatchController({ renderer, input: new FakeInput(), botFactory });
    c.start({ ...classic, botDifficulties: ['rookie', 'standard', 'nightmare'] }, 7);
    expect(made).toEqual([
      [1, 'rookie'],
      [2, 'standard'],
      [3, 'nightmare'],
    ]);
    expect(c.state!.players.slice(1).map((p) => p.isBot)).toEqual([true, true, true]);
  });

  it('City Rumble: one preset, or a deterministic mixed roster around it (never 31 manual choices)', () => {
    const rumble: GameSettings = { ...DEFAULT_GAME_SETTINGS, play: 'rumble', difficulty: 'standard' };
    for (let i = 1; i < 32; i++) expect(botDifficulty(rumble, i)).toBe('standard');
    const levels = new Set<Difficulty>();
    for (let i = 1; i < 32; i++) {
      const d = botDifficulty({ ...rumble, rumbleMixed: true }, i);
      levels.add(d);
      expect(Math.abs(DIFFICULTIES.indexOf(d) - DIFFICULTIES.indexOf('standard'))).toBeLessThanOrEqual(2);
    }
    expect(levels.size).toBeGreaterThanOrEqual(4);
    const bots: Bot[] = [];
    const c = new MatchController({
      renderer,
      input: new FakeInput(),
      botFactory: (o) => {
        expect(PROFILES[o.difficulty]).toBeDefined();
        const b = createBot(o);
        bots.push(b);
        return b;
      },
    });
    c.start({ ...rumble, rumbleMixed: true, rumbleCompetitors: 8 }, 3);
    expect(bots).toHaveLength(7);
  });
});
