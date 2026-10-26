/**
 * V2 workstream C: City Rumble elimination economy and elimination credit (systems/rewards.ts,
 * systems/attribution.ts). Scenario tests on the real Danfo Bus Park with the crates cleared.
 */
import { describe, expect, it } from 'vitest';
import { createGame, previewRewards, rewardsFor } from '../src/sim';
import type { GameKind, GameState, MatchSettings, PickupKind, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { applyLethalHits } from '../src/sim/systems/lethality';
import { recordHit } from '../src/sim/systems/skills';
import { addGenerator, eventsOf, put, run, sandbox } from './helpers';

/** A playing match in a given ruleset (stage hazards off, crates cleared unless `keepSoft`). */
function match(game: GameKind, players = 4, extra: Partial<MatchSettings> = {}, keepSoft = false, seed = 1): GameState {
  const s = createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3],
      isBot: false,
    })),
    settings: { game, stageHazards: false, ...extra },
  });
  if (!keepSoft) {
    s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    s.hidden = {};
  }
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

/** Parks every player in a far corner so only the ones a scenario places are involved. */
function park(s: GameState): void {
  const spots: [number, number][] = [
    [14, 10],
    [14, 0],
    [0, 10],
    [12, 10],
  ];
  s.players.forEach((_, i) => put(s, i, spots[i % spots.length]![0], spots[i % spots.length]![1]));
}

const granted = (events: SimEvent[], id: number): PickupKind[] =>
  eventsOf(events, 'rewardGranted')
    .filter((e) => e.playerId === id)
    .map((e) => e.kind);

describe('Rumble rulesets: crates open routes, never drop power', () => {
  it.each(['survival', 'deathmatch', 'team'] as const)('%s hides no pickups in crates and drops no loot', (game) => {
    const s = match(game, 4, {}, true);
    expect(s.tiles.some((t) => t === Tile.Soft)).toBe(true);
    expect(Object.keys(s.hidden)).toHaveLength(0);
    expect(s.config.pickups.hiddenChance).toBe(0);
    expect(s.config.drops.maxDeathDrops).toBe(0);
    expect(s.config.rewards.enabled).toBe(true);

    // blow up crates: nothing is revealed
    park(s);
    const crates = s.tiles.map((t, i) => (t === Tile.Soft ? i : -1)).filter((i) => i >= 0);
    const idx = crates[0]!;
    const x = idx % s.width;
    const y = Math.floor(idx / s.width);
    const gx = x > 0 && s.tiles[idx - 1] === Tile.Empty ? x - 1 : x + 1;
    addGenerator(s, { ownerId: 3, x: gx, y, timer: 1 });
    const ev = run(s, 3);
    expect(eventsOf(ev, 'blockDestroyed').length).toBeGreaterThan(0);
    expect(eventsOf(ev, 'pickupRevealed')).toHaveLength(0);

    // an eliminated fighter with upgrades drops nothing on the floor
    const victim = s.players[1]!;
    victim.capacity = 4;
    victim.range = 5;
    victim.armour = 0;
    put(s, 1, 6, 0);
    addGenerator(s, { ownerId: 1, x: 6, y: 0, timer: 1 });
    const ev2 = run(s, 3);
    expect(eventsOf(ev2, 'playerEliminated').some((e) => e.playerId === 1)).toBe(true);
    expect(eventsOf(ev2, 'pickupDropped')).toHaveLength(0);
    expect(s.pickups).toHaveLength(0);
  });

  it('classic keeps crate finds and loot (rewards off)', () => {
    const s = match('classic', 4, {}, true);
    expect(Object.keys(s.hidden).length).toBeGreaterThan(0);
    expect(s.config.rewards.enabled).toBe(false);
    expect(s.config.drops.maxDeathDrops).toBeGreaterThan(0);
  });

  it('raises the standard caps in every Rumble ruleset (technical limits only)', () => {
    for (const game of ['survival', 'deathmatch', 'team'] as const) {
      const c = match(game).config;
      expect(c.generator.maxCapacity).toBeGreaterThan(6);
      expect(c.protection.maxArmour).toBeGreaterThan(1);
      expect(c.square.maxTier).toBe(3);
      expect(c.square.radiusByTier[3]).toBe(3);
    }
    expect(match('classic').config.protection.maxArmour).toBe(1);
  });
});

describe('elimination rewards', () => {
  it('pays the credited eliminator immediately, in the elimination tick, with nothing left on the floor', () => {
    const s = match('survival');
    park(s);
    put(s, 0, 0, 0);
    put(s, 1, 4, 0);
    addGenerator(s, { ownerId: 0, x: 4, y: 2, timer: 1 });
    let tickEvents: SimEvent[] = [];
    for (let i = 0; i < 3 && s.players[1]!.alive; i++) tickEvents = run(s, 1);
    const out = eventsOf(tickEvents, 'playerEliminated');
    expect(out).toHaveLength(1);
    expect(out[0]!.creditId).toBe(0);
    // same tick: reward events, applied to the eliminator's state, no pickups dropped
    expect(granted(tickEvents, 0)).toEqual(['socket', 'petrol']);
    // City Rumble starts every fighter on two generators (decision RE-C1): the socket makes it three
    expect(s.players[0]!.capacity).toBe(s.config.generator.baseCapacity + 1);
    expect(s.config.generator.baseCapacity).toBe(2);
    expect(s.players[0]!.range).toBe(3);
    expect(s.players[0]!.stats).toMatchObject({ kills: 1, streak: 1 });
    expect(s.pickups).toHaveLength(0);
  });

  it('climbs the ladder: the second elimination gives the character tool and speed, the third armour', () => {
    const s = match('survival', 4);
    const p = s.players[0]!; // Street Baller: kick
    expect(previewRewards(s, p)).toEqual(['socket', 'petrol']);
    p.stats.streak = 1;
    expect(previewRewards(s, p)).toEqual(['boots', 'skates']);
    p.stats.streak = 2;
    expect(previewRewards(s, p)).toEqual(['armour', 'socket']);
    // Lekki Boy's tool is the punch, Campus Queen's the disarm
    s.players[1]!.stats.streak = 1;
    s.players[2]!.stats.streak = 1;
    expect(previewRewards(s, s.players[1]!)[0]).toBe('gloves');
    expect(previewRewards(s, s.players[2]!)[0]).toBe('killswitch');
  });

  it('never wastes a rung: an owned / capped reward becomes the first useful fallback', () => {
    const s = match('survival');
    const p = s.players[0]!;
    p.stats.streak = 5; // next = rung 6: okada, armour, petrol
    p.mounted = true;
    expect(previewRewards(s, p)).toEqual(['socket', 'armour', 'petrol']);
    p.capacity = s.config.generator.maxCapacity;
    p.armour = s.config.protection.maxArmour;
    expect(previewRewards(s, p)).toEqual(['petrol', 'petrol', 'petrol']);
    // a fighter with a different contact tool keeps it (the contact rung falls back)
    p.stats.streak = 1;
    p.contact = 'punch';
    p.capacity = 1;
    expect(previewRewards(s, p)[0]).toBe('socket');
    expect(previewRewards(match('classic'), p)).toEqual([]);
  });

  it('keeps growing past the ladder: the late rungs cycle and the caps are well above Classic', () => {
    const s = match('survival');
    const ladder = s.config.rewards.ladder;
    expect(rewardsFor(s, ladder.length + 1)).toEqual(ladder[s.config.rewards.repeatFrom]);
    expect(rewardsFor(s, 0)).toEqual([]);
    // simulate a 14-elimination run of rewards on one fighter
    const p = s.players[0]!;
    for (let k = 1; k <= 14; k++) {
      p.stats.streak = k - 1;
      for (const kind of previewRewards(s, p)) {
        if (kind === 'socket') p.capacity++;
        if (kind === 'petrol') p.range++;
        if (kind === 'square') p.squareTier++;
        if (kind === 'armour') p.armour++;
        if (kind === 'okada') p.mounted = true;
      }
    }
    expect(p.capacity).toBeGreaterThan(s.config.generator.baseCapacity + 5);
    // RE-C4: a Square Blast tier is only paid while it still widens the radial footprint; at radius 5 the
    // square tops out at radius 6 with tier 2, so the third tier (which the cap allows) is never wasted on it
    expect(p.squareTier).toBe(2);
    expect(p.armour).toBe(3);
    expect(p.capacity).toBeLessThanOrEqual(s.config.generator.maxCapacity);
  });

  it('pays two consecutive rungs for a double elimination in one tick (no duplicates)', () => {
    const s = match('survival');
    park(s);
    put(s, 0, 0, 0);
    put(s, 1, 4, 2);
    put(s, 2, 6, 4);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, timer: 1 });
    const ev = run(s, 3);
    expect(eventsOf(ev, 'playerEliminated').map((e) => e.creditId)).toEqual([0, 0]);
    expect(granted(ev, 0)).toEqual(['socket', 'petrol', 'boots', 'skates']);
    expect(s.players[0]!.stats).toMatchObject({ kills: 2, streak: 2 });
    expect(s.players[0]!.contact).toBe('kick');
  });

  it('a victim is credited once: two of the killer\'s blasts in one tick, and later flames on the body, pay once', () => {
    const s = match('survival');
    park(s);
    put(s, 0, 0, 0);
    put(s, 1, 4, 2);
    addGenerator(s, { ownerId: 0, x: 4, y: 4, timer: 1 });
    addGenerator(s, { ownerId: 0, x: 4, y: 0, timer: 1, range: 2 });
    const ev = run(s, 2);
    addGenerator(s, { ownerId: 0, x: 2, y: 2, timer: 1, range: 3 });
    ev.push(...run(s, 3));
    expect(eventsOf(ev, 'playerEliminated')).toHaveLength(1);
    expect(eventsOf(ev, 'rewardGranted')).toHaveLength(2);
    expect(s.players[0]!.stats.kills).toBe(1);
  });

  it('a killer who falls in the same tick scores the elimination but receives nothing', () => {
    const s = match('survival', 3);
    park(s);
    put(s, 0, 4, 0);
    put(s, 1, 4, 4);
    addGenerator(s, { ownerId: 0, x: 4, y: 2, timer: 1 }); // reaches P1 at (4,4) (and P0 at (4,0))
    addGenerator(s, { ownerId: 1, x: 2, y: 0, timer: 1 }); // reaches P0 at (4,0)
    const ev = run(s, 2);
    const out = eventsOf(ev, 'playerEliminated');
    expect(out.map((e) => [e.playerId, e.creditId])).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(eventsOf(ev, 'rewardGranted')).toHaveLength(0);
    expect(s.players[0]!.stats.kills).toBe(1);
    expect(s.players[1]!.stats.kills).toBe(1);
    expect(s.players[0]!.stats.streak).toBe(0);
  });

  it('respawn modes: power and the ladder are per life', () => {
    const s = match('deathmatch');
    park(s);
    const p0 = s.players[0]!;
    p0.stats.streak = 3;
    p0.stats.kills = 3;
    put(s, 0, 4, 0);
    addGenerator(s, { ownerId: 1, x: 4, y: 2, timer: 1 });
    run(s, 2);
    expect(p0.alive).toBe(false);
    expect(p0.stats.streak).toBe(0);
    expect(p0.stats.kills).toBe(3);
    expect(previewRewards(s, p0)).toEqual(['socket', 'petrol']);
  });
});

describe('elimination credit', () => {
  it('generator: the owner of the flame', () => {
    const s = match('classic');
    park(s);
    put(s, 1, 4, 0);
    addGenerator(s, { ownerId: 0, x: 4, y: 2, timer: 1 });
    const ev = run(s, 2);
    const e = eventsOf(ev, 'playerEliminated')[0]!;
    expect(e.creditId).toBe(0);
    expect(s.players[1]!.eliminatedBy).toBe(0);
    expect(s.players[0]!.stats.kills).toBe(1);
    expect(eventsOf(ev, 'rewardGranted')).toHaveLength(0); // Classic: credit, no rewards
  });

  it('chain reaction: dying to your own generator that a rival set off credits the rival', () => {
    const s = match('survival');
    park(s);
    put(s, 1, 2, 2); // only in P1's own blast (down arm of (2,0))
    addGenerator(s, { ownerId: 0, x: 0, y: 0, timer: 1 }); // right arm reaches (2,0)
    addGenerator(s, { ownerId: 1, x: 2, y: 0, timer: 900 });
    const ev = run(s, 2);
    const e = eventsOf(ev, 'playerEliminated')[0]!;
    expect(e.playerId).toBe(1);
    expect(e.cause).toMatchObject({ kind: 'flame', ownerId: 1 });
    expect(e.creditId).toBe(0);
    expect(granted(ev, 0)).toEqual(['socket', 'petrol']);
  });

  it('vehicle: the owner of the vehicle, and of a generator it rams into its owner', () => {
    const s = match('survival');
    park(s);
    put(s, 0, 0, 10);
    put(s, 1, 4, 8); // in the Danfo's lane (x = 4)
    put(s, 2, 6, 2); // in P2's own generator's blast, which the Danfo will ram at (4,2)
    addGenerator(s, { ownerId: 2, x: 4, y: 2, timer: 900 });
    s.players[0]!.hasVoucher = true;
    run(s, 1, { 0: { vehicle: { type: 'begin' } } });
    const ev = run(s, 1, { 0: { vehicle: { type: 'launch', entry: { x: 4, y: 0, dir: 'down' } } } });
    for (let i = 0; i < 400 && s.vehicles.length > 0; i++) ev.push(...run(s, 1));
    const outs = eventsOf(ev, 'playerEliminated');
    const byVictim = new Map(outs.map((e) => [e.playerId, e]));
    expect(byVictim.get(1)).toMatchObject({ creditId: 0, cause: { kind: 'vehicle', ownerId: 0 } });
    expect(byVictim.get(2)).toMatchObject({ creditId: 0, cause: { kind: 'flame', ownerId: 2 } });
  });

  it('kicked generator: the kicker is credited when it kills its own owner', () => {
    const s = match('survival');
    park(s);
    const kicker = s.players[0]!;
    kicker.contact = 'kick';
    put(s, 0, 4, 4);
    put(s, 1, 8, 4);
    addGenerator(s, { ownerId: 1, x: 5, y: 4, timer: 60 });
    run(s, 1, { 0: { move: 'right' } });
    expect(s.generators[0]!.touchedBy).toBe(0);
    put(s, 0, 0, 0);
    const ev = run(s, 80);
    const e = eventsOf(ev, 'playerEliminated').find((o) => o.playerId === 1)!;
    expect(e.cause).toMatchObject({ kind: 'flame', ownerId: 1 });
    expect(e.creditId).toBe(0);
  });

  it('melee into the victim\'s own blast: the attacker gets the self-kill-after-push', () => {
    const s = match('survival');
    park(s);
    put(s, 0, 2, 0);
    put(s, 1, 3, 0);
    s.players[0]!.facing = 'right';
    addGenerator(s, { ownerId: 1, x: 6, y: 0, timer: 30 }); // left arm reaches (4,0), not (3,0)
    const ev = run(s, 1, { 0: { special: true } });
    expect(eventsOf(ev, 'playerPushed')).toHaveLength(1);
    put(s, 0, 0, 2);
    ev.push(...run(s, 40));
    const e = eventsOf(ev, 'playerEliminated')[0]!;
    expect(e.playerId).toBe(1);
    expect(e.cause).toMatchObject({ kind: 'flame', ownerId: 1 });
    expect(e.creditId).toBe(0);
    expect(granted(ev, 0)).toEqual(['socket', 'petrol']);
  });

  it('melee knock-back into an environmental hazard credits the attacker, inside the window only', () => {
    const s = match('survival');
    const victim = s.players[1]!;
    recordHit(s, victim, 2);
    const ev: SimEvent[] = [];
    applyLethalHits(s, [{ playerId: 1, eventId: 99, cause: { kind: 'hazard', style: 'traffic', eventId: 99 }, graceUntil: s.tick }], ev);
    expect(eventsOf(ev, 'playerEliminated')[0]!.creditId).toBe(2);

    const t = match('survival');
    recordHit(t, t.players[1]!, 2);
    t.tick += t.config.credit.assistWindowTicks + 1; // the scuffle is old news
    const ev2: SimEvent[] = [];
    applyLethalHits(t, [{ playerId: 1, eventId: 7, cause: { kind: 'crush', eventId: 7 }, graceUntil: t.tick }], ev2);
    expect(eventsOf(ev2, 'playerEliminated')[0]!.creditId).toBeNull();
  });

  it('an unrelated accident is nobody\'s free kill', () => {
    const s = match('survival');
    park(s);
    put(s, 1, 4, 0);
    addGenerator(s, { ownerId: 1, x: 4, y: 0, timer: 1 });
    const ev = run(s, 2);
    const e = eventsOf(ev, 'playerEliminated')[0]!;
    expect(e.creditId).toBeNull();
    expect(e.assistIds).toEqual([]);
    expect(s.players.every((p) => p.stats.kills === 0)).toBe(true);
    expect(eventsOf(ev, 'rewardGranted')).toHaveLength(0);
  });

  it('spectator throws are never credited, not even to a recent attacker', () => {
    const s = match('survival');
    recordHit(s, s.players[1]!, 2);
    const ev: SimEvent[] = [];
    applyLethalHits(s, [{ playerId: 1, eventId: 5, cause: { kind: 'spectator', ownerId: 3, eventId: 5 }, graceUntil: s.tick }], ev);
    expect(eventsOf(ev, 'playerEliminated')[0]!.creditId).toBeNull();
  });

  it('teammates: friendly fire scores nobody, a teammate\'s shove is no credit', () => {
    const s = match('team', 4, { friendlyFire: true });
    park(s);
    expect(s.players[0]!.team).toBe(s.players[2]!.team);
    put(s, 2, 4, 0);
    addGenerator(s, { ownerId: 0, x: 4, y: 2, timer: 1 });
    const ev = run(s, 2);
    const e = eventsOf(ev, 'playerEliminated')[0]!;
    expect(e.playerId).toBe(2);
    expect(e.creditId).toBeNull();
    expect(s.players[0]!.stats.kills).toBe(0);
    expect(eventsOf(ev, 'rewardGranted')).toHaveLength(0);

    const t = match('team', 4);
    recordHit(t, t.players[2]!, 0); // teammate
    const ev2: SimEvent[] = [];
    applyLethalHits(t, [{ playerId: 2, eventId: 3, cause: { kind: 'crush', eventId: 3 }, graceUntil: t.tick }], ev2);
    expect(eventsOf(ev2, 'playerEliminated')[0]!.creditId).toBeNull();
  });

  it('two rivals\' blasts in the same tick: the first credited blast scores, the other assists', () => {
    const s = match('survival');
    park(s);
    put(s, 1, 4, 2);
    addGenerator(s, { ownerId: 2, x: 4, y: 4, timer: 1 });
    addGenerator(s, { ownerId: 0, x: 4, y: 0, timer: 1 });
    const ev = run(s, 2);
    const e = eventsOf(ev, 'playerEliminated')[0]!;
    // explosions resolve by generator id: P2's (added first) is the first flame on the victim
    expect(e.creditId).toBe(2);
    expect(e.assistIds).toEqual([0]);
    expect(s.players[0]!.stats.assists).toBe(1);
    expect(granted(ev, 2)).toEqual(['socket', 'petrol']);
    expect(granted(ev, 0)).toEqual([]);
  });

  it('bots earn progression like anyone else (same Intent path, same credit)', () => {
    const s = sandbox({ players: 2 });
    s.players[0]!.isBot = true;
    s.config.rewards.enabled = true;
    put(s, 1, 4, 0);
    addGenerator(s, { ownerId: 0, x: 4, y: 2, timer: 1 });
    const ev = run(s, 2);
    expect(granted(ev, 0)).toEqual(['socket', 'petrol']);
  });
});
