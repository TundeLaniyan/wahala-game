/**
 * Campaign health and damage (decisions CC1-CC5, docs/CAMPAIGN_COMBAT.md): segments, recovery frames, Okada then Armour
 * then health, knockback and daze that remove nothing, enemy durability by kind, the HUD views, and the proof that
 * multiplayer is untouched. Scenario style on the real Danfo Bus Park sandbox.
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_CONFIG,
  DEFAULT_CONFIG,
  ENEMY_KINDS,
  ENEMY_KIND_IDS,
  applyCampaignHit,
  createGame,
  createVitals,
  enemyHealthView,
  observe,
  playerVitalsView,
  resetVitals,
  tick,
  vitalsFor,
} from '../src/sim';
import type { CampaignHit, EnemyKind, GameState, Intents, SimEvent } from '../src/sim';
import { respawn } from '../src/sim/systems/respawn';
import { applyLethalHits } from '../src/sim/systems/lethality';
import type { LethalHit } from '../src/sim/systems/lethality';
import { playerStepTicks } from '../src/sim/systems/queries';
import { createBot } from '../src/ai';
import { newMission } from './mission-helpers';
import { RUMBLE_FIXTURE, addGenerator, eventsOf, put, run, sandbox } from './helpers';

const CFG = CAMPAIGN_CONFIG;

/** Player 0 is the human (4 segments); the others are the given enemy kinds. */
function arena(kinds: EnemyKind[] = ['guard'], maxHp = 4): GameState {
  const s = sandbox({ players: 1 + kinds.length, arenaId: kinds.length > 3 ? RUMBLE_FIXTURE : undefined });
  s.players[0]!.vitals = vitalsFor({ maxHp }, s.config);
  kinds.forEach((kind, i) => {
    const p = s.players[i + 1]!;
    p.enemyKind = kind;
    p.isBot = true;
    p.vitals = vitalsFor({ enemyKind: kind }, s.config);
  });
  put(s, 0, 1, 1);
  kinds.forEach((_, i) => put(s, i + 1, 12, 1 + 2 * i)); // far away unless a test moves them
  return s;
}

const hit = (victimId: number, over: Partial<CampaignHit> = {}): CampaignHit => ({
  victimId,
  byId: null,
  source: 'punch',
  damage: 1,
  dazeTicks: 0,
  knockback: null,
  ...over,
});
const apply = (s: GameState, h: CampaignHit, ev: SimEvent[] = []) => ({
  result: applyCampaignHit(s, h, ev),
  ev,
});
const hits = (ev: SimEvent[]) => eventsOf(ev, 'campaignHit');

describe('vitals exist only where the setup or the enemy kind gives them', () => {
  it('a normal match has no vitals, no campaign config and one-hit deaths', () => {
    const s = sandbox({ players: 2 });
    expect(s.players.every((p) => p.vitals === undefined && p.enemyKind === undefined)).toBe(true);
    expect(s.config.campaign).toBeUndefined();
    put(s, 0, 4, 4);
    addGenerator(s, { ownerId: 1, x: 4, y: 5, timer: 1, range: 2 });
    const ev = run(s, 2);
    expect(s.players[0]!.alive).toBe(false);
    expect(hits(ev)).toHaveLength(0);
    expect(eventsOf(ev, 'campaignDefeated')).toHaveLength(0);
  });

  it('createGame gives the human the setup maxHp and an enemy its kind health, and records the campaign config', () => {
    const s = createGame({
      seed: 1,
      players: [
        { name: 'You', characterId: 'streetBaller', isBot: false, maxHp: 3 },
        { name: 'G', characterId: 'lekkiBoy', isBot: true, enemyKind: 'guard' },
        { name: 'B', characterId: 'campusQueen', isBot: true },
      ],
    });
    expect(s.players[0]!.vitals).toMatchObject({ hp: 3, maxHp: 3 });
    expect(s.players[0]!.enemyKind).toBeUndefined();
    expect(s.players[1]!.vitals).toMatchObject({ hp: 2, maxHp: 2 });
    expect(s.players[1]!.enemyKind).toBe('guard');
    expect(s.players[2]!.vitals).toBeUndefined(); // a seat with neither stays on the one-hit rules
    expect(s.config.campaign).toEqual(CFG);
    expect(CFG.playerMaxHp).toBe(4);
  });

  it('mission and raid rulesets carry the campaign tuning', () => {
    for (const game of ['mission', 'raid'] as const) {
      const s = createGame({
        seed: 1,
        arenaId: 'rumbleOjuelegba',
        players: [{ name: 'A', characterId: 'streetBaller', isBot: false }],
        settings: { game },
      });
      expect(s.config.campaign).toEqual(CFG);
    }
  });

  it('a test override of the tuning merges over the defaults', () => {
    const s = createGame({
      seed: 1,
      players: [{ name: 'A', characterId: 'streetBaller', isBot: false, maxHp: 4 }],
      config: { campaign: { ...CFG, invulnTicks: 5 } },
    });
    expect(s.config.campaign!.invulnTicks).toBe(5);
    expect(s.config.campaign!.damage).toEqual(CFG.damage);
  });
});

describe('enemy durability by kind', () => {
  const HP: Record<EnemyKind, number> = {
    agbero: 1,
    guard: 2,
    thrower: 2,
    heavy: 3,
    lieutenant: 8,
    boss: 14,
  };

  it('every kind has its health, a name, attacks and a difficulty', () => {
    expect(ENEMY_KIND_IDS.slice().sort()).toEqual(Object.keys(HP).sort());
    for (const kind of ENEMY_KIND_IDS) {
      const d = ENEMY_KINDS[kind];
      expect(d.hp, kind).toBe(HP[kind]);
      expect(d.attacks.length, kind).toBeGreaterThan(0);
      expect(d.name.length).toBeGreaterThan(0);
      expect(vitalsFor({ enemyKind: kind }, {})).toMatchObject({ hp: HP[kind], maxHp: HP[kind] });
    }
    expect(ENEMY_KINDS.agbero.attacks).toEqual(['punch']); // punch only
    expect(ENEMY_KINDS.thrower.attacks).toContain('bottle');
    expect(ENEMY_KINDS.lieutenant.bossBar && ENEMY_KINDS.boss.bossBar).toBe(true);
    for (const k of ['agbero', 'guard', 'thrower', 'heavy'] as const)
      expect(ENEMY_KINDS[k].bossBar).toBe(false);
  });

  it('only a heavy may be raised (to 4, config); nothing else changes with the setup', () => {
    expect(vitalsFor({ enemyKind: 'heavy', maxHp: 4 }, {})!.hp).toBe(4);
    expect(vitalsFor({ enemyKind: 'heavy', maxHp: 9 }, {})!.hp).toBe(CFG.heavyMaxHp);
    expect(vitalsFor({ enemyKind: 'guard', maxHp: 9 }, {})!.hp).toBe(2);
    expect(vitalsFor({ enemyKind: 'boss', maxHp: 1 }, {})!.hp).toBe(14);
  });

  for (const kind of ['agbero', 'guard', 'thrower', 'heavy'] as const) {
    it(`${kind} survives ${HP[kind] - 1} one-segment hits and falls to the next`, () => {
      const s = arena([kind]);
      const ev: SimEvent[] = [];
      for (let i = 1; i < HP[kind]; i++) {
        expect(applyCampaignHit(s, hit(1, { byId: 0 }), ev)).toBe('damaged');
        expect(s.players[1]!.alive).toBe(true);
        s.tick += CFG.invulnTicks; // recovery over
      }
      expect(applyCampaignHit(s, hit(1, { byId: 0 }), ev)).toBe('defeated');
      expect(s.players[1]!.alive).toBe(false);
      expect(eventsOf(ev, 'campaignDefeated')).toHaveLength(1);
      expect(eventsOf(ev, 'campaignDefeated')[0]).toMatchObject({ victimId: 1, enemyKind: kind, byId: 0 });
    });
  }

  it('a heavy raised to 4 needs 4; a lieutenant and a boss take long fights', () => {
    for (const [kind, hp] of [
      ['lieutenant', 8],
      ['boss', 14],
    ] as const) {
      const s = arena([kind]);
      for (let i = 1; i < hp; i++) {
        expect(apply(s, hit(1)).result).toBe('damaged');
        s.tick += CFG.invulnTicks;
      }
      expect(s.players[1]!.vitals!.hp).toBe(1);
      expect(apply(s, hit(1)).result).toBe('defeated');
    }
  });

  it('slower kinds take more ticks per tile (thrower, heavy), never fewer than the floor', () => {
    const s = arena(['agbero', 'guard', 'thrower', 'heavy', 'lieutenant', 'boss']);
    const step = (id: number) => playerStepTicks(s, s.players[id]!);
    expect(step(3)).toBe(step(2) + ENEMY_KINDS.thrower.stepPenaltyTicks); // thrower slower than a guard
    expect(step(4)).toBe(step(2) + ENEMY_KINDS.heavy.stepPenaltyTicks); // heavy slower than a guard
    expect(step(3)).toBeGreaterThan(step(2));
    expect(step(0)).toBe(step(2)); // the human and a guard walk at the same pace
    expect(step(1)).toBe(step(2)); // an agbero too
  });
});

describe('health reduction, recovery frames and the result of every hit', () => {
  it('a hit takes its segments, records who and why, and starts the recovery frames', () => {
    const s = arena();
    s.tick = 100;
    const { result, ev } = apply(s, hit(0, { byId: 1, source: 'bottle', damage: 2 }));
    expect(result).toBe('damaged');
    const v = s.players[0]!.vitals!;
    expect(v).toMatchObject({ hp: 2, lastHitBy: 1, lastHitSource: 'bottle', lastHitTick: 100 });
    expect(v.invulnUntil).toBe(100 + CFG.invulnTicks);
    expect(hits(ev)).toEqual([
      expect.objectContaining({
        victimId: 0,
        byId: 1,
        source: 'bottle',
        result: 'damaged',
        damage: 2,
        hpAfter: 2,
        maxHp: 4,
      }),
    ]);
  });

  it('recovery frames ignore ordinary hits (an event says so) until they end', () => {
    const s = arena();
    s.tick = 10;
    apply(s, hit(0));
    const { result, ev } = apply(s, hit(0, { damage: 2 }));
    expect(result).toBe('invulnerable');
    expect(s.players[0]!.vitals!.hp).toBe(3);
    expect(hits(ev)[0]).toMatchObject({ result: 'invulnerable', damage: 0, hpAfter: 3 });
    expect(playerVitalsView(s, 0)!.invulnerable).toBe(true);
    s.tick += CFG.invulnTicks;
    expect(playerVitalsView(s, 0)!.invulnerable).toBe(false);
    expect(apply(s, hit(0)).result).toBe('damaged');
  });

  it('a strong hit pierces frames started by an ordinary hit, but not frames started by another strong one', () => {
    const s = arena();
    s.tick = 10;
    apply(s, hit(0)); // ordinary: 4 -> 3
    expect(apply(s, hit(0, { strong: true, source: 'brick' })).result).toBe('damaged'); // 3 -> 2 through the frames
    s.tick += 5;
    expect(apply(s, hit(0, { strong: true, source: 'brick' })).result).toBe('invulnerable');
    expect(s.players[0]!.vitals!.hp).toBe(2);
  });

  it('each source takes the segments of the damage table', () => {
    expect(CFG.damage).toEqual({ blast: 2, vehicle: 2, hazard: 1, trap: 1 });
    // a real generator flame
    const s = arena();
    put(s, 0, 4, 4);
    addGenerator(s, { ownerId: 1, x: 4, y: 5, timer: 1, range: 2 });
    const ev = run(s, 2);
    expect(s.players[0]!.vitals!.hp).toBe(4 - CFG.damage.blast);
    expect(s.players[0]!.alive).toBe(true);
    expect(hits(ev)).toHaveLength(1);
    expect(hits(ev)[0]).toMatchObject({ source: 'blast', byId: 1, result: 'damaged', damage: 2, hpAfter: 2 });
  });

  it('a hazard takes 1, a vehicle 2, through the lethal-hit path', () => {
    for (const [cause, expected, source] of [
      [{ kind: 'hazard', style: 'traffic', eventId: 7 }, 1, 'hazard'],
      [{ kind: 'vehicle', ownerId: 1, vehicleKind: 'danfo', eventId: 8 }, 2, 'vehicle'],
    ] as const) {
      const s = arena();
      const ev: SimEvent[] = [];
      const lethal: LethalHit[] = [{ playerId: 0, eventId: cause.eventId, cause, graceUntil: s.tick + 30 }];
      applyLethalHits(s, lethal, ev);
      expect(s.players[0]!.vitals!.hp).toBe(4 - expected);
      expect(hits(ev)[0]).toMatchObject({ source, result: 'damaged' });
    }
  });

  it('health at zero eliminates through eliminate(): credit, stats, both events, the cause says why', () => {
    const s = arena(['guard']);
    s.players[0]!.vitals!.hp = 1;
    const ev: SimEvent[] = [];
    expect(applyCampaignHit(s, hit(0, { byId: 1, source: 'punch', damage: 1 }), ev)).toBe('defeated');
    const p = s.players[0]!;
    expect(p.alive).toBe(false);
    expect(p.vitals!.hp).toBe(0);
    expect(p.stats.deaths).toBe(1);
    expect(p.eliminatedBy).toBe(1);
    expect(s.players[1]!.stats.kills).toBe(1);
    expect(p.elimination).toMatchObject({ kind: 'campaign', source: 'punch', ownerId: 1 });
    expect(eventsOf(ev, 'playerEliminated')).toHaveLength(1);
    expect(hits(ev)).toHaveLength(1);
    expect(eventsOf(ev, 'campaignDefeated')).toEqual([
      expect.objectContaining({ victimId: 0, byId: 1, source: 'punch', enemyKind: null }),
    ]);
    // a dead player takes no more hits and announces nothing
    expect(applyCampaignHit(s, hit(0), [])).toBe('invulnerable');
  });

  it('a hit on a player without vitals is ignored (multiplayer rules never run here)', () => {
    const s = sandbox({ players: 2 });
    const ev: SimEvent[] = [];
    expect(applyCampaignHit(s, hit(1), ev)).toBe('invulnerable');
    expect(ev).toEqual([]);
  });

  it('exactly one campaignHit per call, whatever the result', () => {
    const s = arena();
    s.players[0]!.armour = 1;
    const ev: SimEvent[] = [];
    const results = [
      applyCampaignHit(s, hit(0, { damage: 2, source: 'blast' }), ev), // blockedArmour
      applyCampaignHit(s, hit(0, { damage: 1 }), ev), // invulnerable
    ];
    s.tick += CFG.invulnTicks;
    results.push(
      applyCampaignHit(s, hit(0, { damage: 0, dazeTicks: 30 }), ev), // dazed
      applyCampaignHit(s, hit(0, { damage: 1 }), ev), // damaged
    );
    expect(results).toEqual(['blockedArmour', 'invulnerable', 'dazed', 'damaged']);
    expect(hits(ev).map((h) => h.result)).toEqual(results);
  });
});

describe('daze and knockback remove no segment', () => {
  it('damage 0: a daze holds the victim, hp is unchanged, the result says dazed', () => {
    const s = arena();
    s.tick = 5;
    const { result, ev } = apply(s, hit(1, { byId: 0, damage: 0, dazeTicks: 60, source: 'player' }));
    expect(result).toBe('dazed');
    const v = s.players[1]!;
    expect(v.vitals!.hp).toBe(2);
    expect(v.dazedUntil).toBe(65);
    expect(v.vitals!.invulnUntil).toBe(0); // no wound, so no recovery frames
    expect(eventsOf(ev, 'playerDazed')).toHaveLength(1);
    expect(hits(ev)[0]).toMatchObject({
      result: 'dazed',
      damage: 0,
      dazeTicks: 60,
      source: 'player',
      byId: 0,
    });
    expect(enemyHealthView(s, 1)!.dazed).toBe(true);
  });

  it('knockback moves the victim along the line and stops before a wall', () => {
    const s = arena();
    put(s, 1, 5, 4);
    const ev: SimEvent[] = [];
    applyCampaignHit(s, hit(1, { byId: 0, damage: 0, knockback: { dir: 'right', tiles: 2 } }), ev);
    expect([s.players[1]!.x, s.players[1]!.y]).toEqual([7, 4]);
    expect(s.players[1]!.vitals!.hp).toBe(2);
    expect(eventsOf(ev, 'playerPushed')).toHaveLength(1);
    // next to a hard wall it goes nowhere and loses nothing
    const wall = arena();
    wall.tiles[4 * wall.width + 6] = 1; // Tile.Hard
    put(wall, 1, 5, 4);
    applyCampaignHit(wall, hit(1, { damage: 0, knockback: { dir: 'right', tiles: 2 } }), []);
    expect([wall.players[1]!.x, wall.players[1]!.y]).toEqual([5, 4]);
  });

  it('knockback never pushes into a generator: it lands on the last free tile', () => {
    const s = arena();
    put(s, 1, 5, 4);
    addGenerator(s, { ownerId: 0, x: 7, y: 4, timer: 9999 });
    applyCampaignHit(s, hit(1, { damage: 0, knockback: { dir: 'right', tiles: 2 } }), []);
    expect(s.players[1]!.x).toBe(6);
  });

  it('a damaging hit with knockback and daze does all three, once', () => {
    const s = arena(['heavy']);
    put(s, 1, 5, 4);
    const ev: SimEvent[] = [];
    applyCampaignHit(
      s,
      hit(1, { byId: 0, damage: 1, dazeTicks: 20, knockback: { dir: 'left', tiles: 1 } }),
      ev,
    );
    const v = s.players[1]!;
    expect(v.vitals!.hp).toBe(2);
    expect(v.x).toBe(4);
    expect(v.dazedUntil).toBeGreaterThan(s.tick);
    expect(hits(ev)).toHaveLength(1);
  });
});

describe('Okada, then Armour, then health', () => {
  /** A blast hit the way a real explosion delivers it: through the lethal path, one event id each. */
  const blast = (s: GameState, eventId: number): SimEvent[] => {
    const ev: SimEvent[] = [];
    const lethal: LethalHit[] = [
      {
        playerId: 0,
        eventId,
        cause: { kind: 'flame', ownerId: 1, eventId },
        graceUntil: s.tick + 36,
      },
    ];
    applyLethalHits(s, lethal, ev);
    return ev;
  };

  it('the Okada absorbs the first blast, the Armour the second, the third wounds, the fourth wounds again', () => {
    const s = arena();
    const p = s.players[0]!;
    p.mounted = true;
    p.armour = 1;
    s.tick = 100;

    let ev = blast(s, 1);
    expect(hits(ev)[0]).toMatchObject({ result: 'blockedOkada', damage: 0, hpAfter: 4 });
    expect(eventsOf(ev, 'okadaBroken')).toHaveLength(1);
    expect(eventsOf(ev, 'protectionBroken')).toEqual([expect.objectContaining({ layer: 'okada' })]);
    expect([p.mounted, p.armour, p.vitals!.hp]).toEqual([false, 1, 4]);

    s.tick += CFG.invulnTicks; // the recovery after a shield break ends
    ev = blast(s, 2);
    expect(hits(ev)[0]).toMatchObject({ result: 'blockedArmour', hpAfter: 4 });
    expect(eventsOf(ev, 'okadaBroken')).toHaveLength(0);
    expect(eventsOf(ev, 'protectionBroken')).toEqual([expect.objectContaining({ layer: 'armour' })]);
    expect([p.mounted, p.armour, p.vitals!.hp]).toEqual([false, 0, 4]);

    s.tick += CFG.invulnTicks;
    ev = blast(s, 3);
    expect(hits(ev)[0]).toMatchObject({ result: 'damaged', damage: 2, hpAfter: 2 });
    expect(eventsOf(ev, 'protectionBroken')).toHaveLength(0);

    s.tick += CFG.invulnTicks;
    ev = blast(s, 4);
    expect(hits(ev)[0]).toMatchObject({ result: 'defeated', hpAfter: 0 });
    expect(p.alive).toBe(false);
  });

  it('mirrors the deployed one-hit rules: the same layers, the same events, one layer per lethal tick', () => {
    // one vitals player and one plain player, both with Okada + Armour, hit by the same two simultaneous events
    const s = arena();
    const plain = s.players[1]!;
    delete plain.vitals;
    delete plain.enemyKind;
    for (const p of [s.players[0]!, plain]) {
      p.mounted = true;
      p.armour = 1;
    }
    const ev: SimEvent[] = [];
    const lethal = (id: number): LethalHit[] =>
      [10, 11].map((eventId) => ({
        playerId: id,
        eventId,
        cause: { kind: 'flame', ownerId: 1, eventId },
        graceUntil: s.tick + 36,
      }));
    applyLethalHits(s, [...lethal(0), ...lethal(1)], ev);
    for (const p of [s.players[0]!, plain]) expect([p.mounted, p.armour, p.alive]).toEqual([false, 1, true]);
    const layers = (id: number) =>
      eventsOf(ev, 'protectionBroken')
        .filter((e) => e.playerId === id)
        .map((e) => e.layer);
    expect(layers(0)).toEqual(layers(1));
    expect(layers(0)).toEqual(['okada']); // ONE layer for both events of the tick
    expect(
      eventsOf(ev, 'okadaBroken')
        .map((e) => e.playerId)
        .sort(),
    ).toEqual([0, 1]);
  });

  it('a layer used on a lethal event is not damage: the health bar and lives are untouched', () => {
    const s = arena();
    s.players[0]!.armour = 2;
    s.tick = 40;
    expect(apply(s, hit(0, { source: 'vehicle', damage: 2 })).result).toBe('blockedArmour');
    expect(s.players[0]!.vitals).toMatchObject({ hp: 4, lastHitTick: -1e9 });
    expect(s.players[0]!.armour).toBe(1);
    expect(playerVitalsView(s, 0)).toMatchObject({ hp: 4, armour: 1, okada: false, invulnerable: true });
  });

  it('an ordinary enemy punch is not a lethal event: it goes straight to health and spares the Armour', () => {
    const s = arena();
    s.players[0]!.armour = 1;
    s.players[0]!.mounted = true;
    expect(apply(s, hit(0, { source: 'punch', damage: 1 })).result).toBe('damaged');
    expect([s.players[0]!.armour, s.players[0]!.mounted]).toEqual([1, true]);
  });

  it('a strong projectile is lethal-class: it meets the layers first', () => {
    const s = arena();
    s.players[0]!.armour = 1;
    expect(apply(s, hit(0, { source: 'brick', strong: true, damage: 1 })).result).toBe('blockedArmour');
    s.tick += CFG.invulnTicks;
    expect(apply(s, hit(0, { source: 'brick', strong: true, damage: 1 })).result).toBe('damaged');
  });
});

describe('one blast event hurts once', () => {
  it('standing in the same flame for its whole life takes 2 segments, not 2 per tick', () => {
    const s = arena();
    put(s, 0, 4, 4);
    addGenerator(s, { ownerId: 1, x: 4, y: 5, timer: 1, range: 2 });
    run(s, 60); // the flame lasts 0.6 s
    expect(s.players[0]!.vitals!.hp).toBe(2);
  });

  it('the same holds for an enemy: a guard dies to one blast, a heavy loses 2 of 3 and survives it', () => {
    const s = arena(['guard', 'heavy']);
    put(s, 1, 4, 4);
    put(s, 2, 4, 3);
    addGenerator(s, { ownerId: 0, x: 4, y: 5, timer: 1, range: 2 });
    const ev = run(s, 40);
    expect(s.players[1]!.alive).toBe(false); // 2 hp, 2 damage
    expect(s.players[2]!.alive).toBe(true);
    expect(s.players[2]!.vitals!.hp).toBe(1);
    expect(eventsOf(ev, 'campaignDefeated').map((e) => e.victimId)).toEqual([1]);
    expect(hits(ev).filter((h) => h.victimId === 2)).toHaveLength(1);
    expect(s.players[0]!.stats.kills).toBe(1); // credited to the generator's owner
  });

  it('two different events a moment apart: the second is ignored inside the recovery, taken after it', () => {
    const s = arena(['lieutenant']);
    put(s, 1, 4, 4);
    addGenerator(s, { ownerId: 0, x: 4, y: 5, timer: 1, range: 2 });
    run(s, 2);
    addGenerator(s, { ownerId: 0, x: 4, y: 3, timer: 1, range: 2 });
    const ev = run(s, 2);
    expect(hits(ev).map((h) => h.result)).toEqual(['invulnerable']);
    expect(s.players[1]!.vitals!.hp).toBe(8 - 2);
    run(s, CFG.invulnTicks);
    addGenerator(s, { ownerId: 0, x: 4, y: 5, timer: 1, range: 2 });
    run(s, 2);
    expect(s.players[1]!.vitals!.hp).toBe(8 - 4);
  });
});

describe('terminal hits kill through everything', () => {
  const terminalCases: [string, LethalHit['cause'], boolean?][] = [
    ['a closing crush with no tile left', { kind: 'crush', eventId: 3 }, true],
    ['the Sudden Death blast', { kind: 'suddenDeath', eventId: 4 }],
    [
      'any crush, even with a tile to flee to (the campaign has no closing city)',
      { kind: 'crush', eventId: 5 },
    ],
  ];
  for (const [name, cause, terminal] of terminalCases) {
    it(`${name}: Okada, Armour, recovery frames and full health do not save the player`, () => {
      const s = arena();
      const p = s.players[0]!;
      p.mounted = true;
      p.armour = 3;
      p.vitals!.invulnUntil = s.tick + 600;
      const ev: SimEvent[] = [];
      const eliminated = applyLethalHits(
        s,
        [{ playerId: 0, eventId: 3, cause, graceUntil: s.tick + 30, terminal }],
        ev,
      );
      expect(eliminated).toEqual([0]);
      expect(p.alive).toBe(false);
      expect(p.vitals!.hp).toBe(0);
      expect(eventsOf(ev, 'campaignDefeated')).toHaveLength(1);
      expect(eventsOf(ev, 'protectionBroken')).toHaveLength(0);
    });
  }
});

describe('respawn and lives', () => {
  it('a respawn restores full health and shows the spawn protection as recovery frames', () => {
    const s = arena();
    const p = s.players[0]!;
    p.vitals!.hp = 0;
    p.alive = false;
    respawn(s, p, 2, 2);
    expect(p.vitals).toMatchObject({ hp: 4, lastHitBy: null });
    expect(p.protectedUntil).toBeGreaterThan(s.tick);
    expect(p.vitals!.invulnUntil).toBe(p.protectedUntil);
    expect(playerVitalsView(s, 0)!.invulnerable).toBe(true);
    // spawn protection ignores even a strong hit
    expect(apply(s, hit(0, { strong: true, damage: 2, source: 'brick' })).result).toBe('invulnerable');
  });

  it('resetVitals on a player without vitals does nothing', () => {
    const s = sandbox({ players: 1 });
    resetVitals(s.players[0]!);
    expect(s.players[0]!.vitals).toBeUndefined();
  });

  it('createVitals clamps to at least one segment', () => {
    expect(createVitals(0).maxHp).toBe(1);
    expect(createVitals(3.7).maxHp).toBe(3);
  });
});

describe('close attacks against campaign victims', () => {
  const B: Intents = { 0: { special: true } };
  /** Human at (4,4) facing right, one enemy of `kind` at (5,4); the human throws `attack`. */
  function duel(
    kind: EnemyKind,
    attack: 'push' | 'shove' | 'daze' | 'bottle' | 'kick' | 'sweep' | 'headbutt' | 'elbow',
  ) {
    const s = arena([kind]);
    s.players[0]!.attacks = { primary: attack };
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    return s;
  }
  const throwIt = (s: GameState): SimEvent[] => {
    const ev = [...tick(s, B)];
    for (let i = 0; i < 40; i++) ev.push(...tick(s));
    return ev;
  };

  it('Punch takes 1 segment; one punch drops an agbero, a guard needs two', () => {
    let s = duel('agbero', 'push');
    let ev = throwIt(s);
    expect(s.players[1]!.alive).toBe(false);
    expect(hits(ev)[0]).toMatchObject({ source: 'player', byId: 0, result: 'defeated' });
    expect(s.players[0]!.stats.kills).toBe(1);

    s = duel('guard', 'push');
    ev = throwIt(s);
    expect(hits(ev)).toEqual([
      expect.objectContaining({ result: 'damaged', damage: 1, hpAfter: 1, dazeTicks: 30 }),
    ]);
    expect(eventsOf(ev, 'playerDazed')).toHaveLength(1); // the daze still happens, and the event says why
    expect(s.players[1]!.alive).toBe(true);
  });

  it('Bottle Strike takes 2: a guard falls to one, a heavy keeps a segment', () => {
    let s = duel('guard', 'bottle');
    throwIt(s);
    expect(s.players[1]!.alive).toBe(false);
    s = duel('heavy', 'bottle');
    throwIt(s);
    expect(s.players[1]!.vitals!.hp).toBe(1);
  });

  it('Shove and Daze Punch take no segment: displacement / a long daze only, and the event says dazed', () => {
    let s = duel('guard', 'shove');
    let ev = throwIt(s);
    expect(s.players[1]!.vitals!.hp).toBe(2);
    expect(s.players[1]!.x).toBe(7);
    expect(hits(ev)[0]).toMatchObject({ result: 'dazed', damage: 0 });
    expect(eventsOf(ev, 'playerPushed')).toHaveLength(1);

    s = duel('guard', 'daze');
    ev = throwIt(s);
    expect(s.players[1]!.vitals!.hp).toBe(2);
    expect(hits(ev)[0]).toMatchObject({
      result: 'dazed',
      damage: 0,
      dazeTicks: DEFAULT_CONFIG.skills.attacks.daze.dazeTicks,
    });
    expect(s.players[1]!.dazedUntil).toBeGreaterThan(s.tick);
  });

  it('Kick takes 1 and pushes; Leg Sweep takes 1 and slows; Headbutt and Elbow take 1', () => {
    let s = duel('heavy', 'kick');
    throwIt(s);
    expect(s.players[1]!.vitals!.hp).toBe(2);
    expect(s.players[1]!.x).toBe(6);
    s = duel('heavy', 'sweep');
    throwIt(s);
    expect(s.players[1]!.vitals!.hp).toBe(2);
    expect(s.players[1]!.slow).not.toBeNull();
    for (const a of ['headbutt', 'elbow'] as const) {
      s = duel('heavy', a);
      throwIt(s);
      expect(s.players[1]!.vitals!.hp, a).toBe(2);
    }
  });

  it('every attack of the catalogue has a damage entry', () => {
    expect(Object.keys(CFG.playerDamage).sort()).toEqual(
      ['bottle', 'daze', 'elbow', 'headbutt', 'kick', 'push', 'shove', 'sweep'].sort(),
    );
  });

  it('an enemy never takes more than enemyMeleeDamage from the human, and the human is told why', () => {
    const s = arena(['guard']);
    s.players[1]!.attacks = { primary: 'bottle' };
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[1]!.facing = 'left';
    const ev = [...tick(s, { 1: { special: true } })];
    for (let i = 0; i < 40; i++) ev.push(...tick(s));
    expect(s.players[0]!.vitals!.hp).toBe(4 - CFG.enemyMeleeDamage);
    expect(hits(ev)[0]).toMatchObject({ victimId: 0, byId: 1, source: 'punch', result: 'damaged' });
  });

  it('recovery frames protect an enemy from a second hit, and the event says invulnerable', () => {
    const s = arena(['heavy']);
    s.players[0]!.attacks = { primary: 'bottle' };
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    throwIt(s); // 3 -> 1
    expect(s.players[1]!.vitals!.hp).toBe(1);
    const v = s.players[1]!.vitals!;
    expect(s.tick).toBeLessThan(v.invulnUntil);
    expect(apply(s, hit(1, { source: 'player', byId: 0 })).result).toBe('invulnerable');
    expect(s.players[1]!.vitals!.hp).toBe(1);
  });

  it('multiplayer melee is exactly what it was: a daze, no segments, no campaign events', () => {
    const s = sandbox({ players: 2 });
    put(s, 0, 4, 4);
    put(s, 1, 5, 4);
    s.players[0]!.facing = 'right';
    const ev = [...tick(s, B)];
    for (let i = 0; i < 30; i++) ev.push(...tick(s));
    expect(s.players[1]!.alive).toBe(true);
    expect(eventsOf(ev, 'playerDazed')).toHaveLength(1);
    expect(hits(ev)).toHaveLength(0);
  });
});

describe('HUD views', () => {
  it('enemyHealthView: bars are never permanent for everyone', () => {
    const s = arena(['guard', 'guard', 'lieutenant']);
    put(s, 0, 1, 1);
    put(s, 1, 12, 9); // far, untouched
    put(s, 2, 4, 1); // 3 tiles away
    put(s, 3, 12, 5); // the lieutenant
    s.players[0]!.facing = 'down';
    expect(enemyHealthView(s, 1)).toMatchObject({
      hp: 2,
      maxHp: 2,
      kind: 'guard',
      dazed: false,
      recentlyHurt: false,
      showBar: false,
    });
    expect(enemyHealthView(s, 2)!.showBar).toBe(true); // within 3 tiles
    expect(enemyHealthView(s, 3)).toMatchObject({ kind: 'lieutenant', showBar: true }); // the boss bar
    expect(enemyHealthView(s, 0)!.showBar).toBe(false); // the human's own bar is the HUD's, not an enemy bar
  });

  it('shown when adjacent or faced in a clear line, then when hurt, for 3 seconds', () => {
    const s = arena(['guard']);
    put(s, 0, 1, 1);
    put(s, 1, 6, 1);
    s.players[0]!.facing = 'right';
    expect(enemyHealthView(s, 1)!.showBar).toBe(false); // 5 tiles, not faced within 2
    put(s, 1, 3, 1);
    expect(enemyHealthView(s, 1)!.showBar).toBe(true); // faced, 2 tiles, clear
    put(s, 1, 6, 1);
    s.tick = 200;
    apply(s, hit(1, { byId: 0 }));
    expect(enemyHealthView(s, 1)).toMatchObject({ recentlyHurt: true, showBar: true, hp: 1 });
    s.tick += CFG.bar.recentTicks + 1;
    expect(enemyHealthView(s, 1)).toMatchObject({ recentlyHurt: false, showBar: false });
  });

  it('a dead enemy shows no bar', () => {
    const s = arena(['guard']);
    put(s, 0, 1, 1);
    put(s, 1, 3, 1);
    expect(enemyHealthView(s, 1)!.showBar).toBe(true); // near
    s.players[1]!.alive = false;
    expect(enemyHealthView(s, 1)!.showBar).toBe(false);
  });

  it('views are null for seats without vitals', () => {
    const s = sandbox({ players: 2 });
    expect(enemyHealthView(s, 1)).toBeNull();
    expect(playerVitalsView(s, 0)).toBeNull();
    expect(enemyHealthView(s, 9)).toBeNull();
  });

  it('playerVitalsView reports health, protection and the mission lives', () => {
    const s = arena();
    s.players[0]!.armour = 2;
    s.players[0]!.mounted = true;
    expect(playerVitalsView(s, 0)).toEqual({
      hp: 4,
      maxHp: 4,
      armour: 2,
      okada: true,
      invulnerable: false,
      lives: null,
    });
    (s as GameState & { mission?: unknown }).mission = { livesUsed: 1, livesMax: 3 } as never;
    expect(playerVitalsView(s, 0)!.lives).toEqual({ used: 1, max: 3, left: 2 });
  });
});

describe('readable feedback: the player can always tell why', () => {
  it('every outcome of a hit has a campaignHit with its source, and defeats a campaignDefeated', () => {
    const s = arena(['guard']);
    const ev: SimEvent[] = [];
    s.players[1]!.armour = 1;
    applyCampaignHit(s, hit(1, { byId: 0, source: 'blast', damage: 2 }), ev); // blockedArmour
    s.tick += CFG.invulnTicks;
    applyCampaignHit(s, hit(1, { byId: 0, source: 'player', damage: 0, dazeTicks: 30 }), ev); // dazed
    applyCampaignHit(s, hit(1, { byId: 0, source: 'player', damage: 1 }), ev); // damaged
    applyCampaignHit(s, hit(1, { byId: 0, source: 'player', damage: 1 }), ev); // invulnerable
    s.tick += CFG.invulnTicks;
    applyCampaignHit(s, hit(1, { byId: 0, source: 'bottle', damage: 1 }), ev); // defeated
    expect(hits(ev).map((h) => [h.result, h.source])).toEqual([
      ['blockedArmour', 'blast'],
      ['dazed', 'player'],
      ['damaged', 'player'],
      ['invulnerable', 'player'],
      ['defeated', 'bottle'],
    ]);
    expect(eventsOf(ev, 'campaignDefeated')).toEqual([
      expect.objectContaining({ victimId: 1, source: 'bottle', byId: 0, enemyKind: 'guard' }),
    ]);
    expect(s.players[1]!.vitals).toMatchObject({ lastHitBy: 0, lastHitSource: 'bottle' });
  });
});

describe('determinism', () => {
  it('the same scene twice gives identical events and state', () => {
    const play = () => {
      const s = arena(['guard', 'thrower']);
      s.players[0]!.armour = 1;
      put(s, 0, 4, 4);
      put(s, 1, 5, 4);
      addGenerator(s, { ownerId: 2, x: 4, y: 5, timer: 5, range: 3 });
      const ev = run(s, 90);
      return JSON.stringify({ ev, players: s.players });
    };
    expect(play()).toBe(play());
  });
});

describe('campaign lives sit behind protection and health (a real mission)', () => {
  it('a defeated human costs one life, respawns with full health and spawn protection', () => {
    const s = newMission({ id: 'oshodi', timeLimitSec: 600 }, { seed: 5 });
    const me = s.players[0]!;
    me.vitals = vitalsFor({ maxHp: 3 }, s.config);
    me.armour = 1;
    const m = s.mission!;
    const used = m.livesUsed;
    const ev: SimEvent[] = [];
    // protection first (the Armour), then health, then the life
    expect(applyCampaignHit(s, hit(0, { source: 'blast', damage: 2 }), ev)).toBe('blockedArmour');
    expect(m.livesUsed).toBe(used);
    s.tick += CFG.invulnTicks;
    expect(applyCampaignHit(s, hit(0, { source: 'blast', damage: 2 }), ev)).toBe('damaged');
    expect(me.vitals!.hp).toBe(1);
    s.tick += CFG.invulnTicks;
    // a real flame ends the life exactly like a one-hit death, and the mission counts it
    const w = s.width;
    const free = (x: number, y: number): boolean => s.tiles[y * w + x] === 0;
    let spot: [number, number] | null = null;
    for (let y = 2; y < s.height - 2 && !spot; y++)
      for (let x = 2; x < w - 2 && !spot; x++) if (free(x, y) && free(x, y + 1)) spot = [x, y];
    put(s, 0, spot![0], spot![1]);
    for (const q of s.players.slice(1)) put(s, q.id, 1, 1); // nobody else is in the blast
    addGenerator(s, { ownerId: 1, x: spot![0], y: spot![1] + 1, timer: 1, range: 2 });
    run(s, 2);
    expect(me.alive).toBe(false);
    expect(m.livesUsed).toBe(used + 1);
    run(s, s.config.respawn.delayTicks + 5);
    expect(me.alive).toBe(true);
    expect(me.vitals).toMatchObject({ hp: 3, maxHp: 3 });
    expect(playerVitalsView(s, 0)).toMatchObject({ hp: 3, invulnerable: true });
  });
});

describe('multiplayer is untouched', () => {
  it('a 6-bot Rumble carries no vitals, no campaign tuning and no campaign event, and ends on the one-hit rules', () => {
    const state = createGame({
      seed: 31,
      arenaId: 'rumbleMushin',
      players: Array.from({ length: 6 }, (_, i) => ({
        name: `R${i}`,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
        isBot: true,
      })),
      settings: { game: 'survival' },
    });
    const bots = state.players.map((_, id) =>
      createBot({ difficulty: 'standard', seed: 11 + id, playerId: id }),
    );
    const all: SimEvent[] = [];
    for (let i = 0; i < 1500; i++) {
      const intents: Intents = {};
      bots.forEach((bot, id) => {
        if (state.players[id]!.alive) intents[id] = bot.decide(observe(state, id));
      });
      all.push(...tick(state, intents));
    }
    expect(state.config.campaign).toBeUndefined();
    expect(state.players.every((p) => p.vitals === undefined && p.enemyKind === undefined)).toBe(true);
    expect(all.some((e) => e.type === 'campaignHit' || e.type === 'campaignDefeated')).toBe(false);
    expect(all.some((e) => e.type === 'playerEliminated')).toBe(true);
    expect(JSON.stringify(state)).not.toContain('vitals');
  });
});
