/**
 * The app side of the V2 rulesets: the menu settings become match rules afresh for every start (no
 * leaks between match types), the controller treats a respawn-mode death as temporary, the HUD carries
 * mode, leaderboard, team scores, respawn countdown and spawn protection, and the results summary
 * comes from the simulation's own stats.
 */
import { describe, expect, it } from 'vitest';
import { MatchController } from '../../src/app/MatchController';
import type { Bot, InputPort, RendererPort } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { useGameStore } from '../../src/app/store';
import { buildHud } from '../../src/app/hud';
import { matchRules } from '../../src/app/names';
import { setupSummary } from '../../src/app/setupSummary';
import { resultText } from '../../src/app/resultText';
import { NO_TEAM } from '../../src/sim/types';
import type { GameState, Intent } from '../../src/sim';
import { addGenerator, run } from '../helpers';

class FakeInput implements InputPort {
  navMode = false;
  builds = 0;
  pollDevices(): void {}
  buildIntent(): Intent {
    this.builds++;
    return {};
  }
  takeVehiclePress(): boolean {
    return false;
  }
  clear(): void {}
}

class FakeRenderer implements RendererPort {
  loadGame(): void {}
  handleEvents(): void {}
  render(): void {}
  pickEntry(): null {
    return null;
  }
  setQuality(): void {}
}

const idleBot: Bot = { decide: () => ({}) };

function make() {
  const input = new FakeInput();
  const controller = new MatchController({ renderer: new FakeRenderer(), input, botFactory: () => idleBot });
  return { input, controller };
}

const rumble = (p: Partial<GameSettings>): GameSettings => ({
  ...DEFAULT_GAME_SETTINGS,
  play: 'rumble',
  rumbleArenaId: 'cityRumble',
  rumbleCompetitors: 8,
  ...p,
});
const classic: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  play: 'classic',
  competitors: 4,
  arenaId: 'danfoBusPark',
};

function playing(s: GameState): void {
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
}

/** Player `victim` is blown up by `by`'s generator (real credit through the simulation). */
function blast(s: GameState, by: number, victim: number): void {
  const v = s.players[victim]!;
  addGenerator(s, { ownerId: by, x: v.x, y: v.y, timer: 1, range: 0 });
  run(s, 2);
  s.flames = [];
}

describe('menu settings become match rules', () => {
  it('each game gets only its own rules; friendly fire and the clock never leak', () => {
    expect(
      matchRules(rumble({ rumbleMode: 'survival', friendlyFire: true, rumbleMinutes: 10 })),
    ).toMatchObject({
      game: 'survival',
      friendlyFire: false,
      durationSec: null,
    });
    expect(
      matchRules(rumble({ rumbleMode: 'deathmatch', rumbleMinutes: 10, friendlyFire: true })),
    ).toMatchObject({
      game: 'deathmatch',
      friendlyFire: false,
      durationSec: 600,
    });
    expect(matchRules(rumble({ rumbleMode: 'team', rumbleMinutes: 5, friendlyFire: true }))).toMatchObject({
      game: 'team',
      friendlyFire: true,
      durationSec: 300,
      teamCount: 2,
    });
    // Classic ignores every Rumble choice still saved in the settings
    expect(matchRules({ ...classic, rumbleMode: 'team', friendlyFire: true })).toMatchObject({
      game: 'classic',
      mode: 'crush',
      friendlyFire: false,
      durationSec: null,
    });
  });

  it('a Classic match after a Team Rumble has no teams, no respawn and the crush; rematch keeps the mode', () => {
    const { controller } = make();
    controller.start(rumble({ rumbleMode: 'team', friendlyFire: true, rumbleMinutes: 10 }), 4);
    let s = controller.state!;
    expect(s.settings.game).toBe('team');
    expect(s.settings.friendlyFire).toBe(true);
    expect(s.players.filter((p) => p.team === 0)).toHaveLength(4);
    expect(s.config.match.durationTicks).toBe(600 * 60);
    controller.rematch();
    s = controller.state!;
    expect(s.settings.game).toBe('team');
    expect(s.config.respawn.enabled).toBe(true);

    controller.start({ ...classic, rumbleMode: 'team', friendlyFire: true }, 5);
    s = controller.state!;
    expect(s.settings.game).toBe('classic');
    expect(s.settings.friendlyFire).toBe(false);
    expect(s.players.every((p) => p.team === NO_TEAM)).toBe(true);
    expect(s.config.respawn.enabled).toBe(false);
    expect(s.crush).not.toBeNull();
    expect(useGameStore.getState().hud!.rumble).toBeNull();
    controller.rematch();
    expect(controller.state!.settings.game).toBe('classic');

    controller.start(rumble({ rumbleMode: 'survival' }), 6);
    s = controller.state!;
    expect(s.settings.game).toBe('survival');
    expect(s.players.every((p) => p.team === NO_TEAM)).toBe(true);
    expect(s.config.respawn.enabled).toBe(false);
    expect(s.crush).not.toBeNull();
  });
});

describe('respawn modes in the controller', () => {
  it('being down is temporary: no skip, a respawn countdown, then input again with spawn protection', () => {
    const { controller, input } = make();
    controller.start(rumble({ rumbleMode: 'deathmatch' }), 7);
    const s = controller.state!;
    playing(s);
    controller.frame(0);
    blast(s, 3, 0);
    expect(s.players[0]!.alive).toBe(false);
    controller.frame(16);
    let hud = useGameStore.getState().hud!;
    expect(hud.rumble!.respawns).toBe(true);
    expect(hud.rumble!.local!.respawnIn).toBe(3);
    expect(hud.rumble!.spectating?.id).toBe(3); // watching the one who got you
    controller.skipToResults();
    expect(controller.isSkipping).toBe(false);
    expect(s.match.phase).toBe('playing');
    const builds = input.builds;
    for (let i = 0; i < 200 && !s.players[0]!.alive; i++) controller.stepOnce();
    expect(s.players[0]!.alive).toBe(true);
    controller.stepOnce();
    expect(input.builds).toBeGreaterThan(builds); // the human's intents are collected again
    controller.frame(200); // past the HUD refresh interval
    hud = useGameStore.getState().hud!;
    expect(hud.localAlive).toBe(true);
    expect(hud.rumble!.local!.protected).toBe(true);
    expect(hud.rumble!.local!.respawnIn).toBeNull();
    expect(controller.spectating).toBeNull();
  });

  it('the results summary uses the simulation stats (credited eliminations, deaths, assists)', () => {
    const { controller } = make();
    controller.start(rumble({ rumbleMode: 'deathmatch' }), 8);
    const s = controller.state!;
    playing(s);
    blast(s, 0, 2);
    blast(s, 0, 3);
    blast(s, 4, 1);
    s.match.playTicks = s.config.match.durationTicks - 1;
    controller.stepOnce();
    expect(s.match.phase).toBe('ended');
    controller.finishSkip();
    const summary = useGameStore.getState().summary!;
    expect(summary.eliminations).toEqual(s.players.map((p) => p.stats.kills));
    expect(summary.eliminations[0]).toBe(2);
    expect(summary.deaths).toBe(0);
    expect(summary.localWon).toBe(true);
    const hud = useGameStore.getState().hud!;
    expect(resultText(hud, true).title).toBe('YOU WIN!');
  });

  it('Team Rumble: the HUD shows both teams; a team win counts as a win for everyone on it', () => {
    const { controller } = make();
    controller.start(rumble({ rumbleMode: 'team', rumbleCompetitors: 16 }), 9);
    const s = controller.state!;
    playing(s);
    const white = s.players.filter((p) => p.team === 1);
    const green = s.players.filter((p) => p.team === 0 && p.id !== 0);
    blast(s, green[0]!.id, white[0]!.id);
    blast(s, green[1]!.id, white[1]!.id);
    blast(s, white[2]!.id, green[2]!.id);
    let hud = buildHud(s, 0, null);
    const teams = hud.rumble!.teams;
    expect(teams.map((t) => [t.name, t.kills, t.deaths, t.members, t.mine])).toEqual([
      ['Green', 2, 1, 8, true],
      ['White', 1, 2, 8, false],
    ]);
    expect(hud.rumble!.ring).toBeNull(); // the city never closes in respawn modes
    expect(hud.rumble!.nearby.length).toBeGreaterThan(0);
    expect(hud.rumble!.nearby.every((e) => e.team === 1)).toBe(true); // opponents only
    // the bar keeps Green left even when White leads
    for (const p of white) p.stats.kills += 3;
    expect(buildHud(s, 0, null).rumble!.teams.map((t) => [t.name, t.place])).toEqual([
      ['Green', 2],
      ['White', 1],
    ]);
    for (const p of white) p.stats.kills -= 3;
    expect(hud.rumble!.leaderboard).toHaveLength(16);
    s.match.playTicks = s.config.match.durationTicks - 1;
    controller.stepOnce();
    controller.finishSkip();
    expect(s.match.result).toEqual({ kind: 'teamWin', team: 0 });
    expect(useGameStore.getState().summary!.localWon).toBe(true);
    hud = useGameStore.getState().hud!;
    expect(resultText(hud, true)).toMatchObject({ title: 'GREEN WINS!' });
    expect(resultText(hud, true).detail).toContain('2 – 1');
  });
});

describe('HUD snapshot for the modes', () => {
  it('Deathmatch leaderboard: ranked by kills, then fewer deaths; ties share a place; feed survives respawns', () => {
    const { controller } = make();
    controller.start(rumble({ rumbleMode: 'deathmatch' }), 10);
    const s = controller.state!;
    playing(s);
    blast(s, 2, 5);
    blast(s, 2, 6);
    blast(s, 3, 7);
    blast(s, 4, 3);
    const r = buildHud(s, 0, null).rumble!;
    expect(r.mode).toBe('deathmatch');
    expect(r.leaderboard[0]!.id).toBe(2);
    expect(r.leaderboard[0]!.placement).toBe(1);
    const four = r.leaderboard.find((e) => e.id === 4)!;
    const three = r.leaderboard.find((e) => e.id === 3)!;
    expect(four.placement).toBe(2); // 1 kill, 0 deaths
    expect(three.placement).toBe(3); // 1 kill, 1 death
    expect(r.leaderboard.find((e) => e.id === 0)!.placement).toBe(
      r.leaderboard.find((e) => e.id === 1)!.placement,
    );
    expect(three.deaths).toBe(1);
    // the fallen come back, but the feed keeps showing their fall for a few seconds
    for (let i = 0; i < 200 && s.players.some((p) => !p.alive); i++) run(s, 1);
    expect(s.players.every((p) => p.alive)).toBe(true);
    const later = buildHud(s, 0, null).rumble!;
    expect(later.feed.length).toBeGreaterThan(0);
    expect(later.feed[0]!.killer).not.toBeNull();
  });

  it('Survival keeps the survivor counter, closing clock and elimination placings', () => {
    const { controller } = make();
    controller.start(rumble({ rumbleMode: 'survival' }), 11);
    const s = controller.state!;
    playing(s);
    blast(s, 1, 2);
    const r = buildHud(s, 0, null).rumble!;
    expect(r.mode).toBe('survival');
    expect(r.respawns).toBe(false);
    expect(r.ring).not.toBeNull();
    expect(r.alive).toBe(7);
    expect(r.leaderboard).toEqual([]);
    expect(r.roster.find((e) => e.id === 2)!.placement).toBe(8);
    expect(r.leaders[0]!.id).toBe(1);
  });
});

describe('menu summary line', () => {
  it('names the game, the size, the clock and the bots', () => {
    expect(
      setupSummary(
        rumble({ rumbleMode: 'team', rumbleCompetitors: 16, rumbleMinutes: 10, friendlyFire: true }),
      ),
    ).toBe('Team Rumble · 8 v 8 · 10 min · friendly fire · City Rumble · Rookie bots');
    expect(
      setupSummary(
        rumble({ rumbleMode: 'survival', rumbleCompetitors: 32, rumbleMixed: true, difficulty: 'expert' }),
      ),
    ).toBe('Survival · 32 fighters · City Rumble · Expert bots (mixed)');
    expect(
      setupSummary({ ...classic, competitors: 3, botDifficulties: ['rookie', 'expert', 'casual'] }),
    ).toBe('Classic Battle · 3 players · Danfo Bus Park · Rookie-Expert bots');
  });
});
