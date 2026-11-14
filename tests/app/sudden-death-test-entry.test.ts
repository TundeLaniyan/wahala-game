/**
 * The Sudden Death TEST match as the app starts it (decisions SD-T): the menu entry builds exactly three fighters (the
 * human plus two bots) on the test's City Rumble stage with the round already queued, leaves the saved menu settings untouched,
 * and a rematch plays the same test. An ordinary start is not changed.
 */
import { describe, expect, it } from 'vitest';
import { MatchController } from '../../src/app/MatchController';
import type { Bot, InputPort, RendererPort } from '../../src/app/ports';
import { buildPlayers, suddenDeathTestSetup } from '../../src/app/names';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { buildHud } from '../../src/app/hud';
import { tick } from '../../src/sim';
import { SUDDEN_DEATH_TEST_ARENA, getArena } from '../../src/sim';

const input: InputPort = {
  navMode: false,
  pollDevices() {},
  buildIntent: () => ({}),
  clear() {},
};
const renderer: RendererPort = {
  loadGame() {},
  handleEvents() {},
  render() {},
  pickEntry: () => null,
  setQuality() {},
};
const idle: Bot = { decide: () => ({}) };
const make = () => new MatchController({ renderer, input, botFactory: () => idle });

describe('Sudden Death test entry', () => {
  it('builds exactly three players (one human, two bots) whatever the saved setup was', () => {
    for (const saved of [
      { ...DEFAULT_GAME_SETTINGS },
      { ...DEFAULT_GAME_SETTINGS, play: 'classic' as const, competitors: 2 as const },
      { ...DEFAULT_GAME_SETTINGS, play: 'rumble' as const, rumbleCompetitors: 32 as const },
    ]) {
      const setup = suddenDeathTestSetup(saved);
      const players = buildPlayers(setup.settings, 3);
      expect(players).toHaveLength(3);
      expect(players.filter((p) => !p.isBot)).toHaveLength(1);
      expect(getArena(setup.arenaId).kind).toBe('rumble');
      expect(setup.settings.play).toBe('rumble');
      expect(setup.arenaId).toBe(SUDDEN_DEATH_TEST_ARENA);
      expect(setup.rules.game).toBe('survival');
    }
  });

  it('starts the controller on the test, keeps the saved settings and replays it on a rematch', () => {
    const controller = make();
    const saved = { ...DEFAULT_GAME_SETTINGS, play: 'rumble' as const, rumbleCompetitors: 16 as const };
    controller.start(saved, 7, 'suddenDeathTest');
    const state = controller.state!;
    expect(state.players).toHaveLength(3);
    expect(state.players.filter((p) => p.isBot)).toHaveLength(2);
    expect(state.arenaId).toBe(SUDDEN_DEATH_TEST_ARENA);
    expect(state.config.suddenDeath.lab).toBeDefined();
    expect(saved.play).toBe('rumble'); // the menu's own setup is read, never rewritten
    expect(useGameStore.getState().screen).toBe('playing');

    controller.rematch();
    expect(controller.state).not.toBe(state);
    expect(controller.state!.config.suddenDeath.lab).toBeDefined();
    expect(controller.state!.players).toHaveLength(3);
  });

  it('an ordinary start has none of it', () => {
    const controller = make();
    controller.start({ ...DEFAULT_GAME_SETTINGS, play: 'classic', competitors: 3 }, 7);
    expect(controller.state!.config.suddenDeath.lab).toBeUndefined();
    expect(controller.state!.players).toHaveLength(3);
    controller.start({ ...DEFAULT_GAME_SETTINGS, play: 'classic', competitors: 3 }, 7, 'suddenDeathTest');
    controller.rematch();
    controller.start({ ...DEFAULT_GAME_SETTINGS, play: 'classic', competitors: 3 }, 7);
    controller.rematch();
    expect(controller.state!.config.suddenDeath.lab).toBeUndefined();
  });
});

describe('Sudden Death test HUD rail', () => {
  it('names the 30 s closing of the stage, never the 10 minute clock the round does not use', () => {
    const controller = make();
    controller.start({ ...DEFAULT_GAME_SETTINGS }, 7, 'suddenDeathTest');
    const s = controller.state!;
    expect(buildHud(s, 0, null).rumble!.ring).toBeNull(); // before the ring is scheduled
    while (s.match.suddenDeath?.stage !== 'countdown') tick(s);
    for (let i = 0; i < 60; i++) tick(s);
    const ring = buildHud(s, 0, null).rumble!.ring!;
    expect(ring.phase).toBe('closing');
    expect(ring.seconds).toBeLessThanOrEqual(30);
    expect(ring.seconds).toBeGreaterThan(25);
    for (let i = 0; i < 1900; i++) tick(s);
    expect(buildHud(s, 0, null).rumble!.ring!.phase).toBe('core');
  });
});
