/**
 * Decisions AS5-AS6: Armour and the Okada ("caddy") are defensive extra lives, not temporary perks. A shield absorbs one
 * otherwise lethal explosion or hit and is spent; spending it is not a death and touches nothing else. An actual death
 * clears the temporary perks (extra generators, range, speed, tool, Square Blast, the Remote Detonator, the Vehicle
 * Voucher) but keeps earned one-use kill-streak rewards, and nothing is ever paid twice. Sudden Death follows the same
 * shield rule at blast 1 and blast 2 (15 s apart), then a final lethal phase.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim';
import type { GameKind, GameState, PickupKind, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { grantRewards } from '../src/sim/systems/rewards';
import { RUMBLE_FIXTURE, addGenerator, eventsOf, put, run, runUntil } from './helpers';

function rumble(game: GameKind = 'survival', players = 3): GameState {
  const s = createGame({
    seed: 5,
    arenaId: RUMBLE_FIXTURE,
    settings: { game, stageHazards: false },
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller',
      isBot: false,
    })),
  });
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.crush = null;
  s.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

/** One credited elimination by player 0, paid through the real path at the current tick. */
function kill(s: GameState): SimEvent[] {
  const p = s.players[0]!;
  p.stats.kills++;
  p.stats.streak++;
  const events: SimEvent[] = [
    {
      type: 'playerEliminated',
      playerId: 1,
      cause: { kind: 'flame', ownerId: 0, eventId: p.stats.kills },
      x: 0,
      y: 0,
      creditId: 0,
      assistIds: [],
    },
  ];
  grantRewards(s, events);
  return events;
}

/** Kills until `want` is paid (the ladder is fixed, so it comes within a dozen). */
function earn(s: GameState, want: (s: GameState) => boolean): void {
  for (let k = 0; k < 14 && !want(s); k++) kill(s);
  expect(want(s)).toBe(true);
}

/** Fighter 0 on an open tile away from the others; returns the tile. */
function stage(s: GameState): { x: number; y: number } {
  let spot = { x: 0, y: 0 };
  search: for (let y = 3; y < s.height - 3; y++)
    for (let x = 3; x < s.width - 3; x++)
      if ([0, 1, 2].every((d) => s.tiles[y * s.width + x + d] === Tile.Empty)) {
        spot = { x: x + 1, y };
        break search;
      }
  put(s, 0, spot.x, spot.y);
  s.players.slice(1).forEach((_, i) => put(s, i + 1, i % 2 ? s.width - 2 : 1, 1));
  return spot;
}

/** A generator that goes off under fighter `id` on the next tick (the explosion of a rival's generator). */
function blastUnder(s: GameState, id: number): void {
  const p = s.players[id]!;
  addGenerator(s, { ownerId: 1, x: p.x, y: p.y, timer: 1, range: 2 });
}

const temporary = (s: GameState) => s.players[0]!.lifePerks.filter((x) => x.category !== 'shield');
const snapshot = (s: GameState) => {
  const p = s.players[0]!;
  return {
    range: p.range,
    capacity: p.capacity,
    speed: p.speedLevel,
    square: p.squareTier,
    contact: p.contact,
    kinds: temporary(s).map((x) => `${x.kind}:${x.level}:${x.expiresAt}`),
  };
};

describe('a shield is an extra life: the first lethal hit spends it and the fighter lives', () => {
  it('Armour absorbs a lethal explosion and is consumed', () => {
    const s = rumble();
    const p = s.players[0]!;
    earn(s, () => p.armour > 0);
    stage(s);
    blastUnder(s, 0);
    const ev = run(s, 3);
    expect(p.alive).toBe(true);
    expect(p.armour).toBe(0);
    expect(eventsOf(ev, 'protectionBroken').find((e) => e.playerId === 0)?.layer).toBe('armour');
    expect(eventsOf(ev, 'playerEliminated').some((e) => e.playerId === 0)).toBe(false);
    expect(p.stats.deaths).toBe(0);
    expect(p.lifePerks.some((x) => x.category === 'shield')).toBe(false);
  });

  it('the Okada ("caddy") absorbs a lethal explosion and is consumed', () => {
    const s = rumble();
    const p = s.players[0]!;
    p.stats.streak = 5; // the next kill pays rung 6: the Okada
    kill(s);
    expect(p.mounted).toBe(true);
    expect(p.armour).toBe(0);
    stage(s);
    blastUnder(s, 0);
    const ev = run(s, 3);
    expect(p.alive).toBe(true);
    expect(p.mounted).toBe(false);
    expect(eventsOf(ev, 'okadaBroken').some((e) => e.playerId === 0)).toBe(true);
    expect(eventsOf(ev, 'playerEliminated').some((e) => e.playerId === 0)).toBe(false);
    expect(p.stats.deaths).toBe(0);
  });

  it('a shield lasts until it is hit: it does not run out with the 12-second perks', () => {
    const s = rumble();
    const p = s.players[0]!;
    earn(s, () => p.armour > 0);
    run(s, 13 * 60);
    expect(p.armour).toBe(1);
    expect(temporary(s)).toHaveLength(0); // the temporary perks are long over
    expect(p.lifePerks.find((x) => x.category === 'shield')?.expiresAt).toBe(Infinity);
  });

  it('a shield never takes a slot and is never pushed out by new perks', () => {
    const s = rumble();
    const p = s.players[0]!;
    earn(s, () => p.armour > 0);
    for (let k = 0; k < 10; k++) {
      kill(s);
      expect(p.armour).toBe(1);
      expect(temporary(s).reduce((n, x) => n + x.slots, 0)).toBeLessThanOrEqual(5);
    }
  });

  it('only one shield at a time: Armour and the Okada do not coexist', () => {
    const s = rumble();
    const p = s.players[0]!;
    for (let k = 0; k < 14; k++) {
      kill(s);
      expect(p.armour > 0 && p.mounted).toBe(false);
    }
  });
});

describe('surviving through a shield is not a death: the other temporary perks stay', () => {
  it.each(['armour', 'okada'] as const)(
    '%s: the same perks, numbers and expiries after the hit',
    (shield) => {
      const s = rumble();
      const p = s.players[0]!;
      if (shield === 'okada') p.stats.streak = 5;
      earn(s, () => (shield === 'okada' ? p.mounted : p.armour > 0) && temporary(s).length >= 2);
      stage(s);
      const before = snapshot(s);
      expect(before.kinds.length).toBeGreaterThanOrEqual(2);
      blastUnder(s, 0);
      run(s, 3);
      expect(p.alive).toBe(true);
      expect(p.armour + (p.mounted ? 1 : 0)).toBe(0);
      expect(snapshot(s)).toEqual(before);
      expect(p.stats.deaths).toBe(0);
    },
  );
});

describe('an actual death clears the temporary perks and keeps the earned kill-streak rewards', () => {
  /** A fighter with perks, a Remote Detonator, a voucher and both unused one-use streak rewards, standing on a tile. */
  function loaded(game: GameKind = 'deathmatch'): { s: GameState; p: GameState['players'][number] } {
    const s = rumble(game);
    const p = s.players[0]!;
    earn(
      s,
      () =>
        p.remote && p.range > s.config.generator.baseRange && p.capacity > s.config.generator.baseCapacity,
    );
    // no shield: these scenarios are about the death itself (the shield cases are above)
    p.armour = 0;
    p.mounted = false;
    p.lifePerks = p.lifePerks.filter((x) => x.category !== 'shield');
    p.hasVoucher = true;
    p.streakRewards.vehicleGenerator = 'taxi';
    p.streakRewards.knockdown = true;
    stage(s);
    return { s, p };
  }

  it('after the shield is gone, the next lethal hit kills and clears every temporary perk', () => {
    const { s, p } = loaded();
    const base = s.config.generator;
    p.armour = 1;
    p.lifePerks.push({
      category: 'shield',
      kind: 'armour',
      level: 1,
      slots: 0,
      since: 0,
      expiresAt: Infinity,
    });
    blastUnder(s, 0);
    run(s, 3); // the shield takes this one
    expect(p.alive).toBe(true);
    p.protectedUntil = 0;
    blastUnder(s, 0);
    run(s, 3);
    expect(p.alive).toBe(false);
    expect(p.stats.deaths).toBe(1);
    expect(p.lifePerks).toHaveLength(0);
    expect(p.range).toBe(base.baseRange);
    expect(p.capacity).toBe(base.baseCapacity);
    expect(p.speedLevel).toBe(0);
    expect(p.squareTier).toBe(0);
    expect(p.contact).toBeNull();
    expect(p.remote).toBe(false);
    expect(p.hasVoucher).toBe(false);
  });

  it('the earned one-use streak rewards are kept through the death', () => {
    const { s, p } = loaded();
    blastUnder(s, 0);
    const ev = run(s, 3);
    expect(p.alive).toBe(false);
    expect(p.streakRewards.vehicleGenerator).toBe('taxi');
    expect(p.streakRewards.knockdown).toBe(true);
    expect(eventsOf(ev, 'streakRewardsLost')[0]?.rewards ?? []).not.toContain('vehicleGenerator');
    expect(eventsOf(ev, 'streakRewardsLost')[0]?.rewards ?? []).not.toContain('globalKnockdown');
  });

  it('kills, deaths and assists are untouched by a death', () => {
    const { s, p } = loaded();
    p.stats.assists = 4;
    const kills = p.stats.kills;
    blastUnder(s, 0);
    run(s, 3);
    expect(p.stats).toMatchObject({ kills, deaths: 1, assists: 4 });
  });

  it('nothing is paid twice on the respawn: the rewards are still one each, the perks stay cleared', () => {
    const { s, p } = loaded();
    blastUnder(s, 0);
    run(s, 3);
    expect(p.alive).toBe(false);
    const events = run(s, s.config.respawn.delayTicks + 10);
    expect(p.alive).toBe(true);
    expect(eventsOf(events, 'rewardGranted').filter((e) => e.playerId === 0)).toHaveLength(0);
    expect(eventsOf(events, 'streakRewardEarned').filter((e) => e.playerId === 0)).toHaveLength(0);
    expect(p.lifePerks).toHaveLength(0);
    expect(p.capacity).toBe(s.config.generator.baseCapacity);
    expect(p.hasVoucher).toBe(false);
    expect(p.streakRewards.vehicleGenerator).toBe('taxi'); // one copy, not two and not lost
    expect(p.streakRewards.knockdown).toBe(true);
  });

  it('surviving through a shield pays nothing again and clears nothing', () => {
    const { s, p } = loaded();
    p.armour = 1;
    const perks = temporary(s).length;
    blastUnder(s, 0);
    const ev = run(s, 3);
    expect(p.alive).toBe(true);
    expect(eventsOf(ev, 'rewardGranted')).toHaveLength(0);
    expect(temporary(s)).toHaveLength(perks);
    expect(p.streakRewards.vehicleGenerator).toBe('taxi');
    expect(p.streakRewards.knockdown).toBe(true);
  });
});

describe('Sudden Death follows the shield rule', () => {
  /** A tied finish: both fighters have 2 kills, the clock runs out, the round starts and the countdown begins. */
  function sudden(): GameState {
    const s = rumble('survival', 2);
    s.players.forEach((p) => (p.stats.kills = 2));
    s.match.playTicks = s.config.match.durationTicks - 1;
    run(s, 1);
    expect(s.match.suddenDeath).not.toBeNull();
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    return s;
  }
  const toBlast = (s: GameState) => runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 4000);
  const perkFor = (kind: PickupKind, category: 'range' | 'capacity' | 'speed' | 'tool') =>
    ({ category, kind, level: 1, slots: 1, since: 0, expiresAt: Infinity }) as const;

  it('blast 1 eliminates a fighter without a shield and spends the shield of the other, who keeps its other perks', () => {
    const s = sudden();
    const [a, b] = [s.players[0]!, s.players[1]!];
    a.armour = 1;
    a.lifePerks.push({
      category: 'shield',
      kind: 'armour',
      level: 1,
      slots: 0,
      since: 0,
      expiresAt: Infinity,
    });
    a.lifePerks.push(perkFor('petrol', 'range'));
    a.range += 1;
    const ev = toBlast(s);
    expect(eventsOf(ev, 'suddenDeathBlast')[0]).toMatchObject({ blast: 1, survivors: [0], eliminated: [1] });
    expect(a.alive).toBe(true);
    expect(a.armour).toBe(0);
    expect(a.lifePerks.filter((x) => x.category !== 'shield').map((x) => x.kind)).toEqual(['petrol']); // untouched
    expect(a.range).toBe(s.config.generator.baseRange + 1);
    expect(b.alive).toBe(false);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'suddenDeath' });
  });

  it('a shield survives the 60-second wait (it is not a 12-second perk) and is spent by the first blast', () => {
    const s = sudden();
    for (const p of s.players) {
      p.stats.streak = 2;
      p.armour = 0;
    }
    const a = s.players[0]!;
    a.stats.streak = 2;
    // earned through the real ladder just as the round began
    s.config.rewards.enabled = true;
    kill(s);
    expect(a.armour).toBe(1);
    const ev = toBlast(s);
    expect(a.armour).toBe(0);
    expect(eventsOf(ev, 'protectionBroken').some((e) => e.playerId === 0 && e.layer === 'armour')).toBe(true);
  });

  it('the Okada is spent first by the blast, Armour is kept for the second', () => {
    const s = sudden();
    const [a, b] = [s.players[0]!, s.players[1]!];
    a.mounted = true;
    a.armour = 1;
    b.mounted = true;
    b.armour = 1;
    const first = toBlast(s);
    expect(eventsOf(first, 'suddenDeathBlast')[0]).toMatchObject({
      blast: 1,
      survivors: [0, 1],
      eliminated: [],
    });
    expect(a.mounted).toBe(false);
    expect(a.armour).toBe(1);
    expect(s.match.suddenDeath!.finalPhase).toBe(false);
  });

  it('the second blast comes 15 s later and follows the same rule: the unshielded fall, the shielded live on', () => {
    const s = sudden();
    const [a, b] = [s.players[0]!, s.players[1]!];
    a.mounted = true;
    a.armour = 1;
    b.mounted = true; // one layer only
    a.lifePerks.push(perkFor('skates', 'speed'));
    a.speedLevel = 1;
    const first = toBlast(s);
    const next = eventsOf(first, 'suddenDeathCountdown').find((e) => e.blast === 2)!;
    expect(next.blastTick - s.tick).toBe(15 * 60);
    expect(a.alive && b.alive).toBe(true);
    const second = toBlast(s);
    expect(eventsOf(second, 'suddenDeathBlast')[0]).toMatchObject({
      blast: 2,
      survivors: [0],
      eliminated: [1],
    });
    expect(a.armour).toBe(0);
    expect(a.speedLevel).toBe(1); // surviving through the shield cleared nothing
    expect(a.lifePerks.map((x) => x.kind)).toEqual(['skates']);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'suddenDeath' });
  });

  it('a team survives through any one shielded member; the other team falls', () => {
    const s = rumble('team', 4);
    s.players.forEach((p, i) => {
      p.team = i % 2;
      p.stats.kills = 1;
    });
    s.match.playTicks = s.config.match.durationTicks - 1;
    run(s, 1);
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    expect(s.match.suddenDeath).not.toBeNull();
    s.players[0]!.armour = 1; // team 0 has one shield, team 1 none
    toBlast(s);
    expect(s.players[0]!.alive).toBe(true);
    expect(s.players[2]!.alive).toBe(false);
    expect(s.players.filter((p) => p.team === 1).every((p) => !p.alive)).toBe(true);
    expect(s.match.result).toMatchObject({ kind: 'teamWin', team: 0 });
  });

  it('if both still stand after blast 2 the final lethal phase begins: no respawns, no pickups, a shield-proof blast', () => {
    const s = sudden();
    s.players.forEach((p) => {
      p.mounted = true;
      p.armour = 2;
    });
    toBlast(s);
    toBlast(s);
    expect(s.players.every((p) => p.alive)).toBe(true);
    expect(s.match.suddenDeath!.finalPhase).toBe(true);
    // the final blast: whatever layer is left does not help
    expect(s.players[0]!.armour).toBe(1);
    toBlast(s);
    expect(s.players.every((p) => !p.alive)).toBe(true);
    expect(s.match.phase).toBe('ended');
  });
});
