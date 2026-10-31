/**
 * V2 rulesets (src/sim/modes.ts): Classic, Survival, Deathmatch and Team Rumble run on one simulation
 * with configurable rules. Each mode is tested on its own, and settings never leak between matches.
 */
import { describe, expect, it } from 'vitest';
import {
  CITY_RUMBLE_ID,
  TEAM_NAMES,
  assignTeams,
  canHarm,
  createGame,
  getArena,
  rankPlayers,
  teamStandings,
  timedResult,
} from '../src/sim';
import type { GameKind, GameState, MatchSettings, VehicleEntry } from '../src/sim';
import { NO_TEAM, Tile } from '../src/sim/types';
import { dangerTiles } from '../src/sim/systems/respawn';
import { addGenerator, eventsOf, put, run, runUntil } from './helpers';

/** A playing-phase match on `arenaId` (crates cleared, no stage hazards) under the given ruleset. */
function match(
  game: GameKind,
  n: number,
  settings: Partial<MatchSettings> = {},
  arenaId = CITY_RUMBLE_ID,
): GameState {
  const state = createGame({
    seed: 7,
    arenaId,
    players: Array.from({ length: n }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller',
      isBot: false,
    })),
    settings: { game, stageHazards: false, ...settings },
  });
  state.tiles = state.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  state.hidden = {};
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  return state;
}

/** Eliminates `victim` with a generator owned by `by` exploding on its tile next tick. */
function blastKill(s: GameState, by: number, victim: number): void {
  const v = s.players[victim]!;
  addGenerator(s, { ownerId: by, x: v.x, y: v.y, timer: 1, range: 1 });
  run(s, 2);
  // flames linger: clear them so later scenarios start clean
  s.flames = [];
  s.blasts = [];
}

/** Advances until `id` is back in play (respawn) and returns the tick count it took. */
function untilRespawn(s: GameState, id: number): number {
  let n = 0;
  runUntil(
    s,
    (ev) => {
      n++;
      return eventsOf(ev, 'playerRespawned').some((e) => e.playerId === id);
    },
    600,
  );
  return n;
}

describe('rulesets: each mode on its own', () => {
  it('Classic: last standing, no teams, no respawns, Wahala Crush on (as the app asks)', () => {
    const s = match('classic', 4, { mode: 'crush' }, 'danfoBusPark');
    expect(s.players.every((p) => p.team === NO_TEAM)).toBe(true);
    expect(s.config.respawn.enabled).toBe(false);
    expect(s.config.rewards.enabled).toBe(false);
    expect(s.crush).not.toBeNull();
    expect(s.config.match.durationTicks).toBe(120 * 60);
  });

  it('Survival: City Rumble closes in, elimination rewards on, nobody respawns', () => {
    const s = match('survival', 8);
    expect(s.crush).not.toBeNull();
    expect(s.config.rewards.enabled).toBe(true);
    expect(s.config.respawn.enabled).toBe(false);
    expect(s.config.pickups.hiddenChance).toBe(0);
    expect(s.players.every((p) => p.team === NO_TEAM)).toBe(true);
    blastKill(s, 1, 2);
    run(s, 600);
    expect(s.players[2]!.alive).toBe(false);
    expect(s.players[2]!.respawnAt).toBeNull();
  });

  it('Deathmatch: 5 and 10 minute clocks, respawns, no permanent shrink, life-based power', () => {
    for (const minutes of [5, 10]) {
      const s = match('deathmatch', 8, { durationSec: minutes * 60 });
      expect(s.config.match.durationTicks).toBe(minutes * 60 * 60);
      expect(s.crush).toBeNull();
      expect(s.settings.mode).toBe('classic');
      expect(s.config.respawn.enabled).toBe(true);
      expect(s.config.respawn.resetOnDeath).toBe(true);
      expect(s.players.every((p) => p.team === NO_TEAM)).toBe(true);
    }
    // no duration given: the 5-minute default
    expect(match('deathmatch', 4).config.match.durationTicks).toBe(300 * 60);
  });

  it('Deathmatch ends exactly at the clock, never because somebody is down', () => {
    const s = match('deathmatch', 4, { durationSec: 300 });
    blastKill(s, 0, 1);
    blastKill(s, 0, 2);
    blastKill(s, 0, 3);
    expect(s.match.phase).toBe('playing'); // three of four down at once: still playing
    s.match.playTicks = s.config.match.durationTicks - 2;
    const ev = run(s, 3);
    expect(s.match.phase).toBe('ended');
    expect(eventsOf(ev, 'matchEnded')[0]!.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'timeoutKills' });
  });

  it('Team Rumble: Green v White, even split for 8-32, teams start on opposite halves, human is Green', () => {
    expect(TEAM_NAMES.slice(0, 2)).toEqual(['Green', 'White']);
    const arena = getArena(CITY_RUMBLE_ID);
    for (const n of [8, 12, 16, 24, 32]) {
      const teams = assignTeams({ ...match('team', 2).settings }, arena, n);
      const green = teams.filter((t) => t === 0).length;
      expect(green).toBe(n / 2);
      expect(teams.filter((t) => t === 1).length).toBe(n / 2);
      expect(teams[0]).toBe(0); // the human (player 0, south-west spawn) is Green
      const xs = (team: number) =>
        arena.spawns
          .slice(0, n)
          .filter((_, i) => teams[i] === team)
          .map((p) => p.x);
      expect(Math.max(...xs(0))).toBeLessThanOrEqual(Math.min(...xs(1)));
    }
    const s = match('team', 32);
    expect(s.players.filter((p) => p.team === 0)).toHaveLength(16);
    expect(s.players.filter((p) => p.team === 1)).toHaveLength(16);
    expect(s.crush).toBeNull();
    expect(s.config.respawn.enabled).toBe(true);
    // an explicit team in the setup wins over the automatic split
    const forced = createGame({
      seed: 1,
      arenaId: CITY_RUMBLE_ID,
      settings: { game: 'team' },
      players: Array.from({ length: 8 }, (_, i) => ({
        name: `P${i}`,
        characterId: 'streetBaller' as const,
        isBot: true,
        team: i < 4 ? 1 : 0,
      })),
    });
    expect(forced.players[0]!.team).toBe(1);
  });

  it('settings do not leak: a Classic match after a Team Rumble has no teams, no respawn, crush on', () => {
    const team = match('team', 16, { friendlyFire: true, durationSec: 600 });
    expect(team.players[1]!.team).not.toBe(NO_TEAM);
    const classic = match('classic', 4, { mode: 'crush' }, 'danfoBusPark');
    expect(classic.settings.game).toBe('classic');
    expect(classic.settings.friendlyFire).toBe(false);
    expect(classic.settings.durationSec).toBeNull();
    expect(classic.players.every((p) => p.team === NO_TEAM)).toBe(true);
    expect(classic.config.respawn.enabled).toBe(false);
    expect(classic.config.rewards.enabled).toBe(false);
    expect(classic.config.match.durationTicks).toBe(120 * 60);
    expect(classic.crush).not.toBeNull();
    // and the City Rumble config the team match merged is untouched by the classic one
    expect(team.config.match.durationTicks).toBe(600 * 60);
    expect(match('survival', 8).config.respawn.enabled).toBe(false);
  });
});

describe('respawning (Deathmatch / Team Rumble)', () => {
  it('a fallen fighter re-enters after the delay, protected, with powers reset and stats kept', () => {
    const s = match('deathmatch', 4);
    const p = s.players[1]!;
    p.range = 6;
    p.capacity = 4;
    p.armour = 0;
    p.contact = 'kick';
    blastKill(s, 0, 1);
    expect(p.alive).toBe(false);
    expect(p.stats.deaths).toBe(1);
    expect(s.players[0]!.stats.kills).toBe(1);
    const waited = untilRespawn(s, 1);
    expect(waited).toBeLessThanOrEqual(s.config.respawn.delayTicks);
    expect(p.alive).toBe(true);
    expect(p.protectedUntil).toBe(s.tick + s.config.protection.spawnProtectionTicks);
    expect(p.range).toBe(s.config.generator.baseRange);
    expect(p.capacity).toBe(s.config.generator.baseCapacity);
    expect(p.contact).toBeNull();
    expect(p.stats.deaths).toBe(1);
  });

  it('spawn protection: a blast on the fresh spawn cannot kill; after it ends, it can', () => {
    const s = match('deathmatch', 4);
    blastKill(s, 0, 1);
    untilRespawn(s, 1);
    const p = s.players[1]!;
    addGenerator(s, { ownerId: 0, x: p.x, y: p.y, timer: 1, range: 1 });
    run(s, 3);
    expect(p.alive).toBe(true); // an immediate repeat kill is impossible
    s.flames = [];
    run(s, s.config.protection.spawnProtectionTicks);
    blastKill(s, 0, 1);
    expect(p.alive).toBe(false);
    expect(p.stats.deaths).toBe(2);
  });

  it('spawn protection ends early once the protected fighter places a generator', () => {
    const s = match('deathmatch', 2);
    blastKill(s, 0, 1);
    untilRespawn(s, 1);
    const p = s.players[1]!;
    expect(s.tick < p.protectedUntil).toBe(true);
    run(s, 1, { 1: { place: true } });
    run(s, 1);
    expect(s.tick >= p.protectedUntil).toBe(true);
  });

  it('respawns never land in live danger: flames, a predicted blast or a running stage hazard', () => {
    // where would player 1 respawn with nothing around?
    const a = match('deathmatch', 4);
    blastKill(a, 0, 1);
    untilRespawn(a, 1);
    const first = { x: a.players[1]!.x, y: a.players[1]!.y };

    // same match, but a generator about to blow covers that spawn
    const b = match('deathmatch', 4);
    blastKill(b, 0, 1);
    addGenerator(b, { ownerId: 2, x: first.x, y: first.y, timer: 400, range: 3 });
    const danger = dangerTiles(b);
    expect(danger.has(first.y * b.width + first.x)).toBe(true);
    untilRespawn(b, 1);
    const p = b.players[1]!;
    expect(p.x !== first.x || p.y !== first.y).toBe(true);
    expect(dangerTiles(b).has(p.y * b.width + p.x)).toBe(false);
  });

  it('no spawn camping: never near a living opponent, never back on the same spot twice in a row', () => {
    const s = match('deathmatch', 8);
    const spots: string[] = [];
    for (let k = 0; k < 4; k++) {
      // an opponent camps right where the victim fell
      const victim = s.players[3]!;
      put(s, 5, victim.x, Math.min(s.height - 1, victim.y + 1));
      blastKill(s, 0, 3);
      untilRespawn(s, 3);
      const p = s.players[3]!;
      spots.push(`${p.x},${p.y}`);
      for (const o of s.players) {
        if (!o.alive || o.id === 3) continue;
        expect(Math.abs(o.x - p.x) + Math.abs(o.y - p.y)).toBeGreaterThanOrEqual(
          s.config.respawn.safeDistance,
        );
      }
      run(s, s.config.protection.spawnProtectionTicks + 1);
    }
    for (let i = 1; i < spots.length; i++) expect(spots[i]).not.toBe(spots[i - 1]);
  });

  it('two fighters falling together reappear on different spawns (per-spawn cooldown)', () => {
    const s = match('deathmatch', 6);
    put(s, 2, 20, 15);
    put(s, 3, 20, 15);
    blastKill(s, 0, 2);
    expect(s.players[2]!.alive || s.players[3]!.alive).toBe(false);
    untilRespawn(s, 2);
    if (!s.players[3]!.alive) untilRespawn(s, 3);
    expect(`${s.players[2]!.x},${s.players[2]!.y}`).not.toBe(`${s.players[3]!.x},${s.players[3]!.y}`);
    expect(s.spawnUsedAt.filter((t) => t >= 0).length).toBeGreaterThanOrEqual(2);
  });

  it('a respawn is never lost: with every spawn blocked, it uses a safe open tile', () => {
    const s = match('deathmatch', 2);
    blastKill(s, 0, 1);
    for (const sp of getArena(s.arenaId).spawns) s.tiles[sp.y * s.width + sp.x] = Tile.Soft;
    untilRespawn(s, 1);
    const p = s.players[1]!;
    expect(p.alive).toBe(true);
    expect(s.tiles[p.y * s.width + p.x]).toBe(Tile.Empty);
  });

  it('no respawn once the clock has run out', () => {
    const s = match('deathmatch', 2);
    s.match.playTicks = s.config.match.durationTicks - 5;
    blastKill(s, 0, 1);
    run(s, 10);
    expect(s.match.phase).toBe('ended');
    expect(s.players[1]!.alive).toBe(false);
  });

  it('Team Rumble respawns prefer the own team side', () => {
    const s = match('team', 16);
    const greens = s.players.filter((p) => p.team === 0 && p.id !== 0);
    const victim = greens[0]!;
    blastKill(s, s.players.find((p) => p.team === 1)!.id, victim.id);
    untilRespawn(s, victim.id);
    expect(victim.x).toBeLessThan(s.width / 2);
  });
});

describe('scoring and ranking', () => {
  it('kills, deaths and assists are exact; the ranking uses them in order', () => {
    const s = match('deathmatch', 4);
    blastKill(s, 0, 1);
    untilRespawn(s, 1);
    run(s, s.config.protection.spawnProtectionTicks + 1);
    blastKill(s, 0, 2);
    untilRespawn(s, 2);
    run(s, s.config.protection.spawnProtectionTicks + 1);
    blastKill(s, 3, 1);
    expect(s.players.map((p) => p.stats.kills)).toEqual([2, 0, 0, 1]);
    expect(s.players.map((p) => p.stats.deaths)).toEqual([0, 2, 1, 0]);
    expect(rankPlayers(s).map((p) => p.id)).toEqual([0, 3, 2, 1]);
    expect(timedResult(s)).toEqual({ kind: 'win', winnerId: 0 });
  });

  it('tie-breaks: fewer deaths, then more assists, then the earlier last elimination, else a draw', () => {
    const s = match('deathmatch', 3);
    const [a, b] = [s.players[0]!, s.players[1]!];
    s.players[2]!.stats = { kills: 0, deaths: 9, assists: 0, lastKillTick: -1, streak: 0 };
    a.stats = { kills: 3, deaths: 2, assists: 0, lastKillTick: 100, streak: 0 };
    b.stats = { kills: 3, deaths: 1, assists: 0, lastKillTick: 200, streak: 0 };
    expect(timedResult(s)).toEqual({ kind: 'win', winnerId: 1 });
    b.stats.deaths = 2;
    a.stats.assists = 1;
    expect(timedResult(s)).toEqual({ kind: 'win', winnerId: 0 });
    a.stats.assists = 0;
    expect(timedResult(s)).toEqual({ kind: 'win', winnerId: 0 }); // reached 3 first
    b.stats.lastKillTick = 100;
    expect(timedResult(s)).toEqual({ kind: 'draw', reason: 'tie' });
  });

  it('Team Rumble: team eliminations add up; most wins, then fewer deaths, else a draw', () => {
    const s = match('team', 8);
    const green = s.players.filter((p) => p.team === 0);
    const white = s.players.filter((p) => p.team === 1);
    blastKill(s, green[0]!.id, white[0]!.id);
    blastKill(s, green[1]!.id, white[1]!.id);
    run(s, 1);
    blastKill(s, white[2]!.id, green[2]!.id);
    const [first, second] = teamStandings(s);
    expect(first).toMatchObject({ team: 0, kills: 2, deaths: 1, members: 4 });
    expect(second).toMatchObject({ team: 1, kills: 1, deaths: 2, members: 4 });
    expect(timedResult(s)).toEqual({ kind: 'teamWin', team: 0 });
    // level on kills: fewer deaths wins; identical: draw
    white[3]!.stats.kills++;
    expect(timedResult(s)).toEqual({ kind: 'teamWin', team: 0 }); // 2-2, Green fell once, White twice
    green[3]!.stats.deaths++;
    expect(timedResult(s)).toEqual({ kind: 'draw', reason: 'tie' });
    green[3]!.stats.deaths++;
    expect(timedResult(s)).toEqual({ kind: 'teamWin', team: 1 });
  });
});

describe('friendly fire (Team Rumble)', () => {
  const pair = (s: GameState) => {
    const me = s.players[0]!;
    const mate = s.players.find((p) => p.id !== 0 && p.team === me.team)!;
    const foe = s.players.find((p) => p.team !== me.team)!;
    return { me, mate, foe };
  };

  it('defaults: own generator ON, teammate OFF, enemy ON, environment hits everyone', () => {
    const s = match('team', 4);
    const { me, mate, foe } = pair(s);
    expect(s.settings.friendlyFire).toBe(false);
    expect(canHarm(s, me.id, me)).toBe(true);
    expect(canHarm(s, me.id, mate)).toBe(false);
    expect(canHarm(s, me.id, foe)).toBe(true);
    expect(canHarm(s, foe.id, me)).toBe(true);
    expect(canHarm(s, null, me) && canHarm(s, null, mate)).toBe(true);
    s.settings.friendlyFire = true;
    expect(canHarm(s, me.id, mate)).toBe(true);
  });

  it('a teammate standing in my blast survives with friendly fire off; I do not; the enemy does not', () => {
    const s = match('team', 4);
    const { me, mate, foe } = pair(s);
    put(s, me.id, 20, 14);
    put(s, mate.id, 21, 14);
    put(s, foe.id, 22, 14);
    addGenerator(s, { ownerId: me.id, x: 20, y: 14, timer: 1, range: 3 });
    run(s, 2);
    expect(mate.alive).toBe(true);
    expect(foe.alive).toBe(false);
    expect(me.alive).toBe(false); // self-damage is always on
    expect(me.stats.kills).toBe(1);
    expect(mate.stats.deaths).toBe(0);
  });

  it('with friendly fire on, my blast takes out a teammate (no credit for anyone)', () => {
    const s = match('team', 4, { friendlyFire: true });
    const { me, mate } = pair(s);
    put(s, me.id, 20, 14);
    put(s, mate.id, 21, 14);
    addGenerator(s, { ownerId: me.id, x: 18, y: 14, timer: 1, range: 4 });
    run(s, 2);
    expect(mate.alive).toBe(false);
    expect(me.alive).toBe(false);
    expect(me.stats.kills).toBe(0);
    expect(mate.eliminatedBy).toBeNull();
  });

  it('vehicles: a teammate on the route is passed harmlessly (FF off) and run over (FF on)', () => {
    const LANE: VehicleEntry = { x: 4, y: 0, dir: 'down' };
    for (const ff of [false, true]) {
      const s = match('team', 4, { friendlyFire: ff }, 'danfoBusPark');
      const { me, mate, foe } = pair(s);
      const other = s.players.find((p) => p.team !== me.team && p.id !== foe.id)!;
      put(s, me.id, 0, 10);
      put(s, mate.id, 4, 4);
      put(s, foe.id, 4, 8);
      put(s, other.id, 14, 10);
      me.hasVoucher = true;
      run(s, 1, { [me.id]: { vehicle: { type: 'begin' } } });
      run(s, 1, { [me.id]: { vehicle: { type: 'launch', entry: LANE } } });
      runUntil(s, () => s.vehicles.length === 0, 900);
      expect(foe.alive).toBe(false);
      expect(mate.alive).toBe(!ff);
    }
  });
});
