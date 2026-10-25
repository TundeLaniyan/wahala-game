/**
 * The V2 rulesets played by real bots: Survival reaches a result with 32 fighters, Deathmatch and Team
 * Rumble respawn reliably and keep exact scores, and bots never attack their own team.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import { runMatch } from '../src/ai/headless';
import { World } from '../src/ai/world';
import { PROFILES } from '../src/ai/profiles';
import { CITY_RUMBLE_ID, createGame, observe, tick } from '../src/sim';
import { previewBlast } from '../src/sim/systems/explosions';
import type { Difficulty, GameKind, GameState, Intents, MatchSettings, SimEvent } from '../src/sim';

const LEVELS: Difficulty[] = ['beginner', 'standard', 'standard'];

/** Runs a City Rumble match of bots under `settings` for at most `maxTicks` playing ticks. */
function play(
  game: GameKind,
  n: number,
  settings: Partial<MatchSettings>,
  seed: number,
  maxTicks = Infinity,
  onTick?: (state: GameState, events: SimEvent[]) => void,
): { state: GameState; events: SimEvent[]; deadFor: number[] } {
  const state = createGame({
    seed,
    arenaId: CITY_RUMBLE_ID,
    settings: { game, ...settings },
    players: Array.from({ length: n }, (_, i) => ({
      name: `B${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3],
      isBot: true,
      difficulty: LEVELS[i % LEVELS.length],
    })),
  });
  const bots = state.players.map((_, i) =>
    createBot({ difficulty: LEVELS[i % LEVELS.length]!, seed: seed * 31 + i, playerId: i }),
  );
  const events: SimEvent[] = [];
  /** Longest stretch (ticks) each player stayed down during play. */
  const deadFor = state.players.map(() => 0);
  const down = state.players.map(() => 0);
  while (state.match.phase !== 'ended' && state.match.playTicks < maxTicks) {
    const intents: Intents = {};
    state.players.forEach((p, i) => {
      if (p.alive) intents[i] = bots[i]!.decide(observe(state, i));
    });
    const ev = tick(state, intents);
    onTick?.(state, ev);
    events.push(...ev);
    state.players.forEach((p, i) => {
      down[i] = p.alive ? 0 : down[i]! + 1;
      deadFor[i] = Math.max(deadFor[i]!, down[i]!);
    });
  }
  return { state, events, deadFor };
}

describe('Survival Rumble', () => {
  it('32 competitors (one seat a human would take) reach a single result with the closing city', () => {
    const out = runMatch({
      seed: 91,
      arenaId: CITY_RUMBLE_ID,
      settings: { game: 'survival' },
      difficulties: Array.from({ length: 32 }, (_, i) => LEVELS[i % LEVELS.length]!),
      config: { match: { durationTicks: 75 * 60 }, crush: { startRemainingTicks: 55 * 60 } },
    });
    expect(out.winner !== null || out.draw || out.timeout).toBe(true);
    if (!out.timeout) expect(out.seats.filter((s) => s.alive).length).toBeLessThanOrEqual(1);
    expect(out.seats.filter((s) => !s.alive).length).toBeGreaterThanOrEqual(29);
  }, 120_000);
});

describe('Timed Deathmatch with bots', () => {
  it('everybody who falls is back within the respawn delay, scores add up, the clock decides', () => {
    const { state, events, deadFor } = play('deathmatch', 12, { durationSec: 75 }, 5);
    expect(state.match.phase).toBe('ended');
    expect(state.match.playTicks).toBe(75 * 60);
    const elims = events.filter((e) => e.type === 'playerEliminated');
    expect(elims.length).toBeGreaterThan(3);
    const respawns = events.filter((e) => e.type === 'playerRespawned');
    expect(respawns.length).toBeGreaterThanOrEqual(elims.length - state.players.length);
    // reliable respawn: nobody stays down longer than the delay (plus a tick of slack), except at the end
    for (const d of deadFor) expect(d).toBeLessThanOrEqual(state.config.respawn.delayTicks + 2);
    const kills = state.players.reduce((n, p) => n + p.stats.kills, 0);
    const deaths = state.players.reduce((n, p) => n + p.stats.deaths, 0);
    expect(deaths).toBe(elims.length);
    expect(kills).toBe(elims.filter((e) => e.type === 'playerEliminated' && e.creditId !== null).length);
    for (const p of state.players) {
      const credited = elims.filter((e) => e.type === 'playerEliminated' && e.creditId === p.id).length;
      expect(p.stats.kills).toBe(credited);
    }
    const r = state.match.result!;
    expect(r.kind === 'win' || (r.kind === 'draw' && r.reason === 'tie')).toBe(true);
  }, 120_000);
});

describe('Team Rumble with bots', () => {
  it('friendly fire off: no teammate is ever struck, run over or blown up by its own side', () => {
    const { state, events } = play('team', 16, { durationSec: 60 }, 8);
    const team = (id: number) => state.players[id]!.team;
    for (const e of events) {
      if (e.type === 'skillUsed' && e.targetId !== null) expect(team(e.targetId)).not.toBe(team(e.playerId));
      if (e.type === 'playerEliminated') {
        if (e.creditId !== null) expect(team(e.creditId)).not.toBe(team(e.playerId));
        const c = e.cause;
        if ((c.kind === 'flame' || c.kind === 'vehicle') && c.ownerId !== e.playerId)
          expect(team(c.ownerId)).not.toBe(team(e.playerId));
      }
    }
    expect(state.match.result?.kind === 'teamWin' || state.match.result?.kind === 'draw').toBe(true);
  }, 120_000);

  it('friendly fire on: bots rarely put a generator where its blast (chains included) reaches a teammate', () => {
    let withFriend = 0;
    let withEnemy = 0;
    let placed = 0;
    const { state } = play('team', 16, { durationSec: 45, friendlyFire: true }, 9, Infinity, (s, ev) => {
      for (const e of ev) {
        if (e.type !== 'generatorPlaced') continue;
        const g = s.generators.find((o) => o.id === e.generatorId);
        if (!g) continue;
        const owner = s.players[e.ownerId]!;
        const tiles = previewBlast(s, g);
        const hit = (q: (typeof s.players)[number]) => q.alive && tiles.has(q.y * s.width + q.x);
        placed++;
        if (s.players.some((q) => q.id !== owner.id && q.team === owner.team && hit(q))) withFriend++;
        if (s.players.some((q) => q.team !== owner.team && hit(q))) withEnemy++;
      }
    });
    expect(state.match.phase).toBe('ended');
    expect(placed).toBeGreaterThan(50);
    expect(withEnemy / placed).toBeGreaterThan(0.5);
    expect(withFriend / placed).toBeLessThan(0.15);
  }, 120_000);

  it('a bot sees teammates as friends, never as rivals to hunt or strike', () => {
    const state = createGame({
      seed: 3,
      arenaId: CITY_RUMBLE_ID,
      settings: { game: 'team', friendlyFire: true },
      players: Array.from({ length: 8 }, (_, i) => ({
        name: `B${i}`,
        characterId: 'streetBaller',
        isBot: true,
      })),
    });
    const world = new World();
    world.refresh(observe(state, 1), PROFILES.standard);
    const mine = state.players[1]!.team;
    expect(world.rivals.length).toBe(4);
    expect(world.rivals.every((r) => r.team !== mine)).toBe(true);
    expect(world.friends.length).toBe(3);
    expect(world.friendlyFire).toBe(true);
    const f = world.friends[0]!;
    expect(world.friendAt[f.y * state.width + f.x]).toBe(1);
    expect(world.rivalAt[f.y * state.width + f.x]).toBe(0);
  });
});
