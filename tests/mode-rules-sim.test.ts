/**
 * The REAL simulation rules of the three City Rumble modes (decisions MD1-MD4), proved by playing the match with
 * `tick()`: real generators kill, real respawn timers run, the real clock expires. Nothing here reads a menu
 * label or a card. Free-for-All = `deathmatch`, Team Deathmatch = `team`, Last Player Standing = `survival`.
 */
import { describe, expect, it } from 'vitest';
import { matchRules } from '../src/app/names';
import { DEFAULT_GAME_SETTINGS } from '../src/app/settings';
import type { GameSettings } from '../src/app/settings';
import { CITY_RUMBLE_ID, createGame, teamStandings, tick } from '../src/sim';
import type { GameState, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addGenerator, eventsOf, run } from './helpers';

const settings = (
  rumbleMode: GameSettings['rumbleMode'],
  rumbleMinutes: 3 | 5 = 3,
  friendlyFire = false,
): GameSettings => ({
  ...DEFAULT_GAME_SETTINGS,
  play: 'rumble',
  rumbleArenaId: CITY_RUMBLE_ID,
  rumbleMode,
  rumbleMinutes,
  friendlyFire,
});

/** A playing-phase match built exactly as the app builds one (matchRules), crates cleared, no stage hazards. */
function match(
  mode: GameSettings['rumbleMode'],
  n: number,
  minutes: 3 | 5 = 3,
  friendlyFire = false,
): GameState {
  const s = createGame({
    seed: 11,
    arenaId: CITY_RUMBLE_ID,
    players: Array.from({ length: n }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller',
      isBot: false,
    })),
    settings: { ...matchRules(settings(mode, minutes, friendlyFire)), stageHazards: false },
  });
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

/** `by`'s generator goes off on `victim`'s tile: a real, credited elimination (when they are opponents). */
function kill(s: GameState, by: number, victim: number): SimEvent[] {
  const v = s.players[victim]!;
  addGenerator(s, { ownerId: by, x: v.x, y: v.y, timer: 1, range: 1 });
  const ev = run(s, 3);
  s.flames = [];
  s.blasts = [];
  return ev;
}

/** Plays real ticks until the match clock has `left` ticks to go (or it ended). */
function playUntilLeft(s: GameState, left: number): void {
  while (s.match.phase === 'playing' && s.match.playTicks < s.config.match.durationTicks - left) tick(s);
}

/** Plays real ticks until the match ends (or `max`). Returns every event. */
function playToEnd(s: GameState, max = 20000): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && s.match.phase === 'playing'; i++) all.push(...tick(s));
  return all;
}

/** Open core tiles (never closed by the city) spaced out, for no-respawn timeouts played with the closing city on. */
function coreSpots(s: GameState, n: number): { x: number; y: number }[] {
  const core = s.config.crush.keepCore!;
  const x0 = Math.floor((s.width - core.w) / 2);
  const y0 = Math.floor((s.height - core.h) / 2);
  const spots: { x: number; y: number }[] = [];
  for (let y = y0; y < y0 + core.h; y++)
    for (let x = x0; x < x0 + core.w; x++) {
      if (s.tiles[y * s.width + x] !== Tile.Empty) continue;
      if (spots.every((p) => Math.abs(p.x - x) + Math.abs(p.y - y) >= 4)) spots.push({ x, y });
    }
  if (spots.length < n) throw new Error('not enough core tiles');
  return spots.slice(0, n);
}
function placeInCore(s: GameState): void {
  const spots = coreSpots(s, s.players.length);
  s.players.forEach((p, i) => {
    p.x = p.stepFromX = spots[i]!.x;
    p.y = p.stepFromY = spots[i]!.y;
    p.stepRemaining = 0;
  });
}

describe('Free-for-All (deathmatch): respawn, clock, most kills, sudden death on a tie', () => {
  it('a player who is killed respawns, with spawn protection, and the kill and the death are counted', () => {
    const s = match('deathmatch', 4);
    expect(s.config.respawn.enabled).toBe(true);
    const events = kill(s, 0, 1);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[1]!.respawnAt).not.toBeNull();
    expect(s.players[0]!.stats.kills).toBe(1);
    expect(s.players[1]!.stats.deaths).toBe(1);
    expect(eventsOf(events, 'playerEliminated').map((e) => e.playerId)).toEqual([1]);
    const back = run(s, s.config.respawn.delayTicks + 10);
    expect(eventsOf(back, 'playerRespawned').some((e) => e.playerId === 1)).toBe(true);
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[1]!.respawnAt).toBeNull();
    expect(s.players[1]!.protectedUntil).toBeGreaterThan(s.tick - s.config.respawn.delayTicks);
    // spawn protection shrugs a blast off; once it is over they can be killed (and respawn) again
    kill(s, 0, 1);
    expect(s.players[1]!.alive).toBe(true);
    run(s, s.config.protection.spawnProtectionTicks + 5);
    kill(s, 0, 1);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[0]!.stats.kills).toBe(2);
    expect(s.players[1]!.stats.deaths).toBe(2);
  });

  it('the match does not end while players are alive or dead: it runs to the timer and ends exactly there', () => {
    const s = match('deathmatch', 4);
    expect(s.config.match.durationTicks).toBe(3 * 60 * 60); // the 3 minute option drives the real clock
    kill(s, 0, 1);
    kill(s, 0, 2);
    // three of four fighters were once down, one fighter leads: still no result for the whole clock
    playUntilLeft(s, 5);
    expect(s.match.phase).toBe('playing');
    expect(s.match.result).toBeNull();
    expect(s.match.playTicks).toBe(s.config.match.durationTicks - 5);
    const rest = playToEnd(s);
    expect(s.match.phase).toBe('ended');
    expect(s.match.playTicks).toBe(s.config.match.durationTicks);
    expect(eventsOf(rest, 'matchEnded')).toHaveLength(1);
  });

  it('the player with the most CREDITED kills wins; self-kills credit nobody', () => {
    const s = match('deathmatch', 4);
    kill(s, 0, 1);
    kill(s, 0, 2);
    kill(s, 2, 3);
    run(s, s.config.respawn.delayTicks + s.config.protection.spawnProtectionTicks + 10); // 3 is back, unprotected
    kill(s, 3, 3); // player 3 blows themselves up: a death, but no kill for anyone
    expect(s.players.map((p) => p.stats.kills)).toEqual([2, 0, 1, 0]);
    expect(s.players[3]!.stats.deaths).toBe(2);
    playToEnd(s);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'timeoutKills' });
  });

  it('a tie for the most kills is not a draw: only the tied leaders enter sudden death, and the blasts decide it', () => {
    const s = match('deathmatch', 4);
    kill(s, 0, 1);
    kill(s, 2, 3);
    expect(s.players.map((p) => p.stats.kills)).toEqual([1, 0, 1, 0]);
    playToEnd(s, 12000); // the clock runs out
    const sd = s.match.suddenDeath!;
    expect(s.match.phase).toBe('playing');
    expect(sd.cause).toBe('timeout');
    expect(sd.contenders.map((c) => c.playerId)).toEqual([0, 2]); // the tied leaders only
    expect(s.players[1]!.alive || s.players[3]!.alive).toBe(false); // the others stood down, they do not respawn
    expect(s.players[1]!.respawnAt).toBeNull();
    expect(s.players[3]!.respawnAt).toBeNull();
    // the finishing blasts (60 s, then 30 s, then every 15 s): player 2 holds one Okada, player 0 nothing
    s.players[2]!.mounted = true;
    const ev = playToEnd(s, 20000);
    expect(eventsOf(ev, 'suddenDeathBlast')[0]).toMatchObject({ blast: 1, survivors: [2], eliminated: [0] });
    expect(s.players[2]!.mounted).toBe(false); // the layer was consumed by the blast
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 2, decidedBy: 'suddenDeath' });
  });
});

describe('Team Deathmatch (team): respawn, team kill totals, timer, highest total wins', () => {
  const sides = (s: GameState) => ({
    green: s.players.filter((p) => p.team === 0),
    white: s.players.filter((p) => p.team === 1),
  });

  it('players respawn, and the two teams are Green (0) and White (1) with four each', () => {
    const s = match('team', 8);
    const { green, white } = sides(s);
    expect([green.length, white.length]).toEqual([4, 4]);
    expect(s.config.respawn.enabled).toBe(true);
    kill(s, green[0]!.id, white[0]!.id);
    expect(white[0]!.alive).toBe(false);
    expect(white[0]!.respawnAt).not.toBeNull();
    const back = run(s, s.config.respawn.delayTicks + 10);
    expect(eventsOf(back, 'playerRespawned').some((e) => e.playerId === white[0]!.id)).toBe(true);
    expect(white[0]!.alive).toBe(true);
    expect(white[0]!.team).toBe(1); // they come back on their own team
  });

  it("team scores add up the credited kills of every member; friendly fire is nobody's point", () => {
    const s = match('team', 8);
    const { green, white } = sides(s);
    kill(s, green[0]!.id, white[0]!.id);
    kill(s, green[1]!.id, white[1]!.id);
    kill(s, white[2]!.id, green[2]!.id);
    const [first, second] = teamStandings(s);
    expect(first).toMatchObject({ team: 0, kills: 2 });
    expect(second).toMatchObject({ team: 1, kills: 1 });
    // a teammate's blast does not hurt a teammate (friendly fire off)...
    const before = teamStandings(s).map((t) => t.kills);
    kill(s, green[0]!.id, green[3]!.id);
    expect(green[3]!.alive).toBe(true);
    expect(teamStandings(s).map((t) => t.kills)).toEqual(before);
    // ...and with friendly fire on it kills, but scores for nobody
    const ff = match('team', 8, 3, true);
    const g = ff.players.filter((p) => p.team === 0);
    kill(ff, g[0]!.id, g[1]!.id);
    expect(g[1]!.alive).toBe(false);
    expect(teamStandings(ff).map((t) => t.kills)).toEqual([0, 0]);
  });

  it('the match ends on the timer, and the team with the highest total wins', () => {
    const s = match('team', 8);
    const { green, white } = sides(s);
    kill(s, white[0]!.id, green[0]!.id);
    kill(s, white[1]!.id, green[1]!.id);
    kill(s, green[2]!.id, white[2]!.id);
    playUntilLeft(s, 5);
    expect(s.match.phase).toBe('playing'); // not over while the clock runs, whatever the score
    expect(s.match.result).toBeNull();
    const rest = playToEnd(s);
    expect(s.match.playTicks).toBe(s.config.match.durationTicks);
    expect(eventsOf(rest, 'matchEnded')).toHaveLength(1);
    expect(s.match.result).toEqual({ kind: 'teamWin', team: 1, decidedBy: 'timeoutKills' }); // White 2 v Green 1
  });

  it('level team totals at the timer go to sudden death between the two teams, not a draw', () => {
    const s = match('team', 8);
    const { green, white } = sides(s);
    kill(s, green[0]!.id, white[0]!.id);
    kill(s, white[1]!.id, green[1]!.id);
    playToEnd(s, 12000);
    expect(s.match.suddenDeath).not.toBeNull();
    expect(s.match.suddenDeath!.contenders).toHaveLength(8); // both tied teams, every member
    // White carries a protection layer each; Green has none: the first blast takes Green down
    for (const p of white) p.mounted = true;
    playToEnd(s, 20000);
    expect(s.match.result).toEqual({ kind: 'teamWin', team: 1, decidedBy: 'suddenDeath' });
  });
});

describe('Last Player Standing (survival): no respawn, last survivor wins, kill ranking at the end', () => {
  it('a killed player stays out for good: no respawn is ever scheduled or played', () => {
    const s = match('survival', 4);
    expect(s.config.respawn.enabled).toBe(false);
    placeInCore(s);
    kill(s, 0, 1);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players[1]!.respawnAt).toBeNull();
    const later = run(s, 1800); // thirty seconds
    expect(eventsOf(later, 'playerRespawned')).toEqual([]);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.players.filter((p) => p.alive).map((p) => p.id)).toEqual([0, 2, 3]);
    expect(s.match.phase).toBe('playing'); // three are still standing
  });

  it('the last surviving player wins at once, and the eliminated stay out', () => {
    const s = match('survival', 4);
    placeInCore(s);
    kill(s, 0, 1);
    kill(s, 0, 2);
    expect(s.match.phase).toBe('playing');
    const last = kill(s, 0, 3);
    expect(s.match.phase).toBe('ended');
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0 });
    expect(eventsOf(last, 'matchEnded')).toHaveLength(1);
    expect(s.players.slice(1).every((p) => !p.alive && p.respawnAt === null)).toBe(true);
  });

  it('time up with several alive: the highest credited kills win (the fallen count too)', () => {
    const s = match('survival', 4);
    placeInCore(s);
    kill(s, 0, 1); // player 0: one kill; player 1 is out
    playToEnd(s);
    expect(s.match.playTicks).toBe(s.config.match.durationTicks);
    expect(s.players.filter((p) => p.alive)).toHaveLength(3);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'timeoutKills' });
  });

  it('time up tied at the top: only the tied players (a fallen one revived) go to sudden death; the blasts then decide', () => {
    const s = match('survival', 4);
    placeInCore(s);
    kill(s, 1, 3); // player 1 scores...
    kill(s, 0, 1); // ...then falls; player 0 scores too: 1 - 1 at the top
    expect(s.players.map((p) => p.stats.kills)).toEqual([1, 1, 0, 0]);
    expect(s.players[1]!.alive).toBe(false);
    playToEnd(s, 12000);
    const sd = s.match.suddenDeath!;
    expect(sd.cause).toBe('timeout');
    expect(sd.contenders.map((c) => c.playerId)).toEqual([0, 1]);
    expect(s.players[1]!.alive).toBe(true); // brought back for the round
    expect(s.players[2]!.alive).toBe(false); // standing, fewer kills: not a contender
    s.players[1]!.mounted = true; // the revived fighter holds an Okada: one layer per blast
    const ev = playToEnd(s, 20000);
    expect(eventsOf(ev, 'suddenDeathBlast')[0]).toMatchObject({ blast: 1, survivors: [1], eliminated: [0] });
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 1, decidedBy: 'suddenDeath' });
  });

  it('the last fighters falling together (tied on kills) start sudden death for them; nobody respawns in between', () => {
    const s = match('survival', 4);
    placeInCore(s);
    kill(s, 0, 2);
    kill(s, 1, 3); // 0 and 1 stand alone with one kill each
    expect(s.players.filter((p) => p.alive).map((p) => p.id)).toEqual([0, 1]);
    // the closing city lands on both of them in the same tick (credits nobody)
    const [a, b] = [s.players[0]!, s.players[1]!];
    b.x = b.stepFromX = a.x;
    b.y = b.stepFromY = a.y;
    const index = a.y * s.width + a.x;
    s.crush = {
      order: [index],
      next: 1,
      warnAt: [0],
      nextAtTick: Infinity,
      pending: [{ index, landTick: s.tick + 1 }],
    };
    const ev = run(s, 3);
    expect(eventsOf(ev, 'matchEnded')).toHaveLength(0); // not a draw
    expect(s.match.suddenDeath).toMatchObject({ cause: 'simultaneous' });
    expect(s.match.suddenDeath!.contenders.map((c) => c.playerId)).toEqual([0, 1]);
    expect(s.players[2]!.alive || s.players[3]!.alive).toBe(false);
    // one of them holds armour: the blast leaves exactly that player standing
    s.players[0]!.armour = 1;
    playToEnd(s, 20000);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'suddenDeath' });
  });

  it('the last fighters falling together with a clear leader among ALL players (a fallen one): the leader wins at once', () => {
    const s = match('survival', 5);
    placeInCore(s);
    kill(s, 2, 3);
    kill(s, 2, 4); // player 2 has two kills...
    kill(s, 0, 2); // ...then falls to player 0 (one kill). 0 and 1 stand alone
    expect(s.players.map((p) => p.stats.kills)).toEqual([1, 0, 2, 0, 0]);
    const [a, b] = [s.players[0]!, s.players[1]!];
    b.x = b.stepFromX = a.x;
    b.y = b.stepFromY = a.y;
    const index = a.y * s.width + a.x;
    s.crush = {
      order: [index],
      next: 1,
      warnAt: [0],
      nextAtTick: Infinity,
      pending: [{ index, landTick: s.tick + 1 }],
    };
    const ev = run(s, 3);
    expect(eventsOf(ev, 'suddenDeathStarted')).toHaveLength(0);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 2, decidedBy: 'simultaneousKills' });
  });
});
