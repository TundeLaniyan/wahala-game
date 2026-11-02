/**
 * Game-mode order, rules and wording (decisions MD1-MD5): Free-for-All (respawn, highest kills wins) is first and
 * the default, then Team Deathmatch (Green v a white / light grey team with a dark outline), then Last Player
 * Standing (no respawn). The labels say the rule outright.
 */
import { describe, expect, it, vi } from 'vitest';
import { RUMBLE_MODE_INFO, setupSummary } from '../src/app/setupSummary';
import { matchRules } from '../src/app/names';
import { DEFAULT_GAME_SETTINGS, sanitizeSettings } from '../src/app/settings';
import type { GameSettings } from '../src/app/settings';
import {
  TEAM_COLORS,
  TEAM_OUTLINE,
  isLightTeam,
  playerDotStyle,
  playerTextStyle,
} from '../src/assets/palette';
import { FIGHTER_IDENTITIES } from '../src/assets/fighterIdentity';
import { TIMED_MINUTES, createGame, isRespawnMode, isTeamMode } from '../src/sim';
import { Tile } from '../src/sim/types';
import { eventsOf, run, RUMBLE_FIXTURE } from './helpers';
import { addGenerator } from './helpers';

vi.mock('../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
}));
const { MODE_CARDS } = await import('../src/ui/menu/ModeScreen');

const rumble = (p: Partial<GameSettings>): GameSettings => ({
  ...DEFAULT_GAME_SETTINGS,
  play: 'rumble',
  ...p,
});

describe('mode order and wording', () => {
  it('Free-for-All is first, then Team Deathmatch, then Last Player Standing; Classic Battle stays separate, last', () => {
    expect(MODE_CARDS.map((m) => m.name)).toEqual([
      'Free-for-All',
      'Team Deathmatch',
      'Last Player Standing',
      'Classic Battle',
    ]);
    expect(RUMBLE_MODE_INFO.map((m) => m.id)).toEqual(['deathmatch', 'team', 'survival']);
  });

  it('each mode says its rule outright, word for word', () => {
    const rule = (id: string) => RUMBLE_MODE_INFO.find((m) => m.id === id)!.rule;
    expect(rule('deathmatch')).toBe('Respawn enabled · highest kills wins');
    expect(rule('team')).toBe('Respawn enabled · team with most kills wins');
    expect(rule('survival')).toBe('No respawn · last survivor wins');
  });

  it('the no-respawn mode is not the default anywhere: the default setting, the first card and the sanitiser all say Free-for-All', () => {
    expect(DEFAULT_GAME_SETTINGS.rumbleMode).toBe('deathmatch');
    expect(sanitizeSettings({ ...DEFAULT_GAME_SETTINGS, rumbleMode: 'nonsense' as never }).rumbleMode).toBe(
      'deathmatch',
    );
    expect(MODE_CARDS[0]!.id).toBe('deathmatch');
    expect(MODE_CARDS[0]!.tag).toBe('Default');
    for (const m of MODE_CARDS.filter((c) => c.id === 'survival'))
      expect(m.tag).not.toMatch(/default|flagship/i);
    expect(setupSummary(DEFAULT_GAME_SETTINGS)).toMatch(/^Free-for-All/);
  });

  it('the length options are 3 or 5 minutes and drive the clock; the old 10 minutes is gone', () => {
    expect([...TIMED_MINUTES]).toEqual([3, 5]);
    expect(matchRules(rumble({ rumbleMode: 'deathmatch', rumbleMinutes: 3 })).durationSec).toBe(180);
    expect(matchRules(rumble({ rumbleMode: 'team', rumbleMinutes: 5 })).durationSec).toBe(300);
    expect(sanitizeSettings({ ...DEFAULT_GAME_SETTINGS, rumbleMinutes: 10 as never }).rumbleMinutes).toBe(5);
  });
});

describe('what each mode does', () => {
  const start = (settings: GameSettings, n = 4) =>
    createGame({
      seed: 3,
      arenaId: RUMBLE_FIXTURE,
      players: Array.from({ length: n }, (_, i) => ({
        name: `P${i}`,
        characterId: 'streetBaller',
        isBot: false,
      })),
      settings: { ...matchRules(settings), stageHazards: false },
    });

  it('Free-for-All and Team Deathmatch respawn; Last Player Standing does not', () => {
    const ffa = start(rumble({ rumbleMode: 'deathmatch' }));
    const team = start(rumble({ rumbleMode: 'team' }), 8);
    const lps = start(rumble({ rumbleMode: 'survival' }));
    expect([ffa, team, lps].map((s) => isRespawnMode(s.settings.game))).toEqual([true, true, false]);
    expect([ffa, team, lps].map((s) => s.config.respawn.enabled)).toEqual([true, true, false]);
    expect(isTeamMode(team.settings.game)).toBe(true);
    expect(isTeamMode(ffa.settings.game)).toBe(false);
  });

  it('Free-for-All: a fallen player comes back, and at time up the highest kills win (a tie goes to sudden death)', () => {
    const s = start(rumble({ rumbleMode: 'deathmatch', rumbleMinutes: 3 }));
    s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    const v = s.players[1]!;
    addGenerator(s, { ownerId: 0, x: v.x, y: v.y, timer: 1, range: 1 });
    run(s, 2);
    expect(v.alive).toBe(false);
    expect(v.respawnAt).not.toBeNull(); // respawns
    const ev = run(s, s.config.respawn.delayTicks + 5);
    expect(eventsOf(ev, 'playerRespawned').some((e) => e.playerId === 1)).toBe(true);
    // time up: player 0 has the only kill
    s.match.playTicks = s.config.match.durationTicks - 1;
    run(s, 1);
    expect(s.match.result).toMatchObject({ kind: 'win', winnerId: 0, decidedBy: 'timeoutKills' });
    // a tie among the leaders: only they enter sudden death
    const t = start(rumble({ rumbleMode: 'deathmatch', rumbleMinutes: 3 }));
    t.match.phase = 'playing';
    t.match.countdownRemaining = 0;
    t.players[0]!.stats.kills = 2;
    t.players[2]!.stats.kills = 2;
    t.players[1]!.stats.kills = 1;
    t.match.playTicks = t.config.match.durationTicks - 1;
    run(t, 1);
    expect(t.match.suddenDeath!.contenders.map((c) => c.playerId)).toEqual([0, 2]);
  });

  it('Team Deathmatch: the team with the most total kills wins when the timer expires', () => {
    const s = start(rumble({ rumbleMode: 'team', rumbleMinutes: 5 }), 8);
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    const white = s.players.filter((p) => p.team === 1);
    white[0]!.stats.kills = 2;
    white[1]!.stats.kills = 1;
    s.players.find((p) => p.team === 0)!.stats.kills = 2;
    s.match.playTicks = s.config.match.durationTicks - 1;
    run(s, 1);
    expect(s.match.result).toEqual({ kind: 'teamWin', team: 1, decidedBy: 'timeoutKills' });
  });

  it('Last Player Standing: one life, last survivor wins; the clock and a wipe-out go to the kill ranking', () => {
    const s = start(rumble({ rumbleMode: 'survival' }));
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    s.crush = null;
    for (const p of s.players.slice(1)) {
      p.alive = false;
      p.eliminatedTick = 1;
    }
    run(s, 1);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0 });
    // time up with everyone level -> sudden death, not a draw
    const t = start(rumble({ rumbleMode: 'survival' }));
    t.match.phase = 'playing';
    t.match.countdownRemaining = 0;
    t.crush = null;
    t.match.playTicks = t.config.match.durationTicks - 1;
    run(t, 1);
    expect(t.match.suddenDeath).not.toBeNull();
    expect(t.players[0]!.respawnAt).toBeNull();
  });
});

describe('team colours (Team 1 green, Team 2 white / light grey with a dark outline, never purple)', () => {
  const hue = (c: number) => {
    const r = ((c >> 16) & 255) / 255;
    const g = ((c >> 8) & 255) / 255;
    const b = (c & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return { sat: max === 0 ? 0 : (max - min) / max, light: (max + min) / 2, r, g, b };
  };

  it('team 1 is green and team 2 is a near-neutral light grey / white', () => {
    const [g, w] = [hue(TEAM_COLORS[0]!), hue(TEAM_COLORS[1]!)];
    expect(g.g).toBeGreaterThan(g.r + 0.3);
    expect(g.g).toBeGreaterThan(g.b + 0.3);
    expect(w.sat).toBeLessThan(0.08); // neutral: not purple, not tinted
    expect(w.light).toBeGreaterThan(0.85);
    expect(w.b).toBeLessThanOrEqual(w.r + 0.05); // no violet cast
  });

  it('only the light team needs (and gets) the dark outline on text; every team dot carries the ring', () => {
    expect(isLightTeam(0)).toBe(false);
    expect(isLightTeam(1)).toBe(true);
    expect(isLightTeam(-1)).toBe(false);
    expect(playerTextStyle(0, 0).textShadow).toBeUndefined();
    expect(playerTextStyle(0, 1).textShadow).toContain('#101418');
    expect(playerTextStyle(0, 1).color).toBe('#e8ecef');
    expect(playerDotStyle(3, 1).boxShadow).toContain('#101418');
    expect(playerDotStyle(3, 0).boxShadow).toContain('#101418');
    expect(playerDotStyle(3, -1).boxShadow).toBeUndefined();
    expect(TEAM_OUTLINE).toBe(0x101418);
  });

  it('the fighter identity hue never recolours a team kit (the old purple White team)', async () => {
    // hue-rotated kits exist for free-for-all slots; a team member keeps hueShift 0 (PlayerViews.create)
    const source = (await import('node:fs')).readFileSync(
      new URL('../src/render/views/PlayerViews.ts', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(/p\.team >= 0 \? \{ \.\.\.base, hueShift: 0/);
    expect(FIGHTER_IDENTITIES.some((i) => i.hueShift !== 0)).toBe(true);
  });
});
