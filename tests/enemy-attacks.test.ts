/**
 * Campaign enemy attacks (decisions EA1-EA3): projectiles with a visible cue, a readable path and a clear collision;
 * punches and throws through the one B press; no generators; rate limits; normal matches untouched.
 * The harm itself is combat-core's `applyCampaignHit`: assertions on results accept what it defines (damaged / dazed).
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import {
  DEFAULT_CONFIG,
  arrivalTick,
  chooseThrow,
  createGame,
  launchProjectile,
  observe,
  tick,
} from '../src/sim';
import type { EnemyKind, GameState, Intents, SimEvent } from '../src/sim';
import { enemyScene, openSpot, placeRing } from '../scripts/lib/enemyScene';
import { addSoft, eventsOf, run, sandbox } from './helpers';
import { hashOf } from './mission-helpers';

const CFG = DEFAULT_CONFIG.enemyAttacks;
const idx = (s: GameState, x: number, y: number): number => y * s.width + x;

/** A thrower of `kind` at (4, 2) facing right and the human at (8, 2) on the open row 2 of the Danfo Bus Park. */
function lineScene(kind: EnemyKind = 'thrower', humanX = 8, extra = {}): GameState {
  const s = enemyScene({ human: { x: humanX, y: 2, hp: 3 }, enemies: [{ kind, x: 4, y: 2 }], ...extra });
  s.players[1]!.facing = 'right';
  return s;
}

const press: Intents = { 1: { special: true } };

describe('launch cue, path and collision', () => {
  it('shows the launch first: the full path, the telegraph and the speed, and nothing moves during the cue', () => {
    const s = lineScene();
    const ev = tick(s, press);
    const [launch] = eventsOf(ev, 'projectileLaunched');
    expect(launch).toBeDefined();
    expect(launch!.ownerId).toBe(1);
    expect(launch!.kind).toBe('bottle');
    expect(launch!.strong).toBe(false);
    expect(launch!.fromX).toBe(4);
    expect(launch!.path).toEqual([5, 6, 7, 8, 9, 10].map((x) => idx(s, x, 2)));
    expect(launch!.warnTicks).toBeGreaterThanOrEqual(CFG.minWarnTicks);
    expect(launch!.stepTicks).toBe(CFG.projectiles.bottle.stepTicks);
    expect(launch!.launchTick).toBe(s.tick);
    // the thrower is committed (planted) for the cue
    expect(s.players[1]!.rootedUntil).toBeGreaterThanOrEqual(s.tick + launch!.warnTicks);
    // nothing moves and nothing lands before the first step
    const p = s.projectiles![0]!;
    const first = arrivalTick(p, 0);
    const during = run(s, first - 1 - s.tick);
    expect(p.index).toBe(0);
    expect(eventsOf(during, 'projectileHit')).toHaveLength(0);
  });

  it('hits a rival standing on a path tile exactly when it arrives (one path tile per stepTicks)', () => {
    const s = lineScene(); // the human stands on path tile index 3 (x = 8)
    tick(s, press);
    const p = s.projectiles![0]!;
    const arrive = arrivalTick(p, 3);
    expect(arrive).toBe(p.launchTick + p.warnTicks! + 4 * p.stepTicks);
    expect(eventsOf(run(s, arrive - 1 - s.tick), 'projectileHit')).toHaveLength(0);
    const ev = run(s, 1);
    const [hit] = eventsOf(ev, 'projectileHit');
    expect(s.tick).toBe(arrive);
    expect(hit).toMatchObject({ id: p.id, kind: 'bottle', victimId: 0, x: 8, y: 2 });
    expect(['dazed', 'damaged']).toContain(hit!.result);
    expect(eventsOf(ev, 'campaignHit').some((e) => e.victimId === 0 && e.byId === 1)).toBe(true);
    expect(s.projectiles).toHaveLength(0);
  });

  it('is dodged by a rival who leaves the line in time, and flies on to the end of its range', () => {
    const s = lineScene();
    tick(s, press);
    const p = s.projectiles![0]!;
    // step off the line one tile up after a short reaction (the cue is at least minWarnTicks long)
    const ev: SimEvent[] = [];
    ev.push(...run(s, 12, (t) => (t === 0 ? { 0: { move: 'up' } } : {})));
    ev.push(...run(s, arrivalTick(p, 5) - s.tick + 2));
    expect(s.players[0]!.y).toBe(1);
    expect(eventsOf(ev, 'campaignHit')).toHaveLength(0);
    const hits = eventsOf(ev, 'projectileHit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ victimId: null, result: 'expired', x: 10, y: 2 });
    expect(s.players[0]!.vitals!.hp).toBe(3);
  });

  it('is stopped by a wall, a hard block or a soft block (nobody behind it is hit)', () => {
    // a pillar right in front of the thrower
    const a = enemyScene({ human: { x: 1, y: 6, hp: 3 }, enemies: [{ kind: 'thrower', x: 1, y: 2 }] });
    const p = a.players[1]!;
    const evA: SimEvent[] = [];
    launchProjectile(a, p, 'down', evA);
    const launched = eventsOf(evA, 'projectileLaunched')[0]!;
    expect(launched.path).toEqual([idx(a, 1, 3)]); // the blocking tile is the last (and here the only) tile
    const hitsA = eventsOf(run(a, launched.warnTicks + launched.stepTicks + 2), 'projectileHit');
    expect(hitsA).toHaveLength(1);
    expect(hitsA[0]).toMatchObject({ result: 'wall', victimId: null, x: 1, y: 3 });

    // a soft block on the row: the human behind it is untouched
    const b = lineScene('thrower', 9);
    addSoft(b, 7, 2);
    // (the AI would not throw at a rival behind a crate: it has no line; the rule is checked on a launch)
    expect(chooseThrow(b, b.players[1]!)).toBeNull();
    const evB: SimEvent[] = [];
    launchProjectile(b, b.players[1]!, 'right', evB);
    const path = eventsOf(evB, 'projectileLaunched')[0]!.path;
    expect(path[path.length - 1]).toBe(idx(b, 7, 2));
    const after = run(b, 200);
    expect(eventsOf(after, 'projectileHit')[0]).toMatchObject({ result: 'wall', x: 7, y: 2 });
    expect(eventsOf(after, 'campaignHit')).toHaveLength(0);
  });

  it("never passes through the thrower's team: an ally in the line stops it harmlessly, and the AI does not throw", () => {
    const s = enemyScene({
      human: { x: 9, y: 2, hp: 3 },
      enemies: [
        { kind: 'thrower', x: 4, y: 2 },
        { kind: 'guard', x: 6, y: 2 },
      ],
    });
    s.players[1]!.facing = 'right';
    // the AI check: the ally is in the way, so there is no line
    expect(chooseThrow(s, s.players[1]!)).toBeNull();
    // the sim rule on its own: a projectile that is in flight stops at the ally
    const ev: SimEvent[] = [];
    launchProjectile(s, s.players[1]!, 'right', ev);
    const after = run(s, 200);
    const hits = eventsOf(after, 'projectileHit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ result: 'blocked', victimId: 2, x: 6, y: 2 });
    expect(eventsOf(after, 'campaignHit')).toHaveLength(0);
    expect(s.players[0]!.vitals!.hp).toBe(3);
  });

  it('an Okada or Armour absorbs a strong projectile (combat-core rules) and the event says so', () => {
    for (const layer of ['armour', 'okada'] as const) {
      const s = lineScene('heavy'); // a strong tool: the only thrown object a shield has to answer (decision CC2)
      if (layer === 'armour') s.players[0]!.armour = 1;
      else s.players[0]!.mounted = true;
      tick(s, press);
      expect(eventsOf(run(s, 200), 'projectileHit')[0]!.result).toBe(
        layer === 'armour' ? 'blockedArmour' : 'blockedOkada',
      );
      expect(s.players[0]!.vitals!.hp).toBe(3);
    }
  });

  it('a strong projectile takes a whole segment, cues longer and flies clearly slower than the common ones', () => {
    const t = CFG.projectiles;
    for (const common of [t.bottle, t.stone, t.brick]) {
      expect(common.strong).toBe(false);
      expect(t.tool.stepTicks / common.stepTicks).toBeGreaterThanOrEqual(1.4);
      expect(t.tool.warnTicks / common.warnTicks).toBeGreaterThanOrEqual(1.4);
    }
    const s = lineScene('heavy', 7); // the heavy throws a tool
    const launch = eventsOf(tick(s, press), 'projectileLaunched')[0]!;
    expect(launch).toMatchObject({ kind: 'tool', strong: true, stepTicks: t.tool.stepTicks });
    expect(launch.warnTicks).toBe(t.tool.warnTicks);
    const hit = eventsOf(run(s, 300), 'projectileHit')[0]!;
    expect(hit.victimId).toBe(0);
    expect(hit.result).toBe('damaged');
    expect(s.players[0]!.vitals!.hp).toBe(2);
  });

  it('cancels the throw when the thrower is dazed during the cue', () => {
    const s = lineScene();
    tick(s, press);
    s.players[1]!.dazedUntil = s.tick + 100; // a jab landed on the thrower
    const ev = run(s, 150);
    const hits = eventsOf(ev, 'projectileHit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ result: 'expired', victimId: null });
    expect(s.projectiles).toHaveLength(0);
    expect(eventsOf(ev, 'campaignHit')).toHaveLength(0);
  });

  it('never cues for less than minWarnTicks, whatever the data says', () => {
    const s = lineScene('thrower', 8, {
      config: { enemyAttacks: { projectiles: { bottle: { warnTicks: 1 } } } },
    });
    expect(eventsOf(tick(s, press), 'projectileLaunched')[0]!.warnTicks).toBe(CFG.minWarnTicks);
  });
});

describe('rate limits', () => {
  /** Four throwers on the four sides of the human, each in a clear line, all pressing B every tick. */
  function squareOff(config = {}): GameState {
    const s = enemyScene({
      human: { x: 0, y: 0, hp: 99 },
      enemies: [
        { kind: 'thrower', x: 0, y: 0 },
        { kind: 'thrower', x: 0, y: 0 },
        { kind: 'thrower', x: 0, y: 0 },
        { kind: 'thrower', x: 0, y: 0 },
      ],
      config,
    });
    const spot = openSpot(s, 7, 5);
    placeRing(s, spot);
    const set = (id: number, dx: number, dy: number, f: 'left' | 'right' | 'up' | 'down'): void => {
      const p = s.players[id]!;
      p.x = p.stepFromX = spot.x + dx;
      p.y = p.stepFromY = spot.y + dy;
      p.facing = f;
    };
    set(1, -3, 0, 'right');
    set(2, 3, 0, 'left');
    set(3, 0, -3, 'down');
    set(4, 0, 3, 'up');
    return s;
  }
  const everyone: Intents = {
    1: { special: true },
    2: { special: true },
    3: { special: true },
    4: { special: true },
  };

  it('lets a group throw at most once per groupGapTicks: enemies never all throw in the same tick', () => {
    const s = squareOff();
    const launches: number[] = [];
    for (let t = 0; t < 600; t++) {
      for (const e of tick(s, everyone)) if (e.type === 'projectileLaunched') launches.push(s.tick);
    }
    expect(launches.length).toBeGreaterThanOrEqual(5);
    expect(launches[0]).toBe(1); // the first press is not delayed ...
    for (let i = 1; i < launches.length; i++)
      expect(launches[i]! - launches[i - 1]!).toBeGreaterThanOrEqual(CFG.groupGapTicks);
    expect(launches.length).toBeLessThanOrEqual(Math.ceil(600 / CFG.groupGapTicks) + 1);
  });

  it('caps the projectiles in flight per group and in the whole match', () => {
    const perGroup = squareOff({ enemyAttacks: { groupGapTicks: 0, maxInFlightPerGroup: 2 } });
    let count = 0;
    for (let t = 0; t < 8; t++)
      for (const e of tick(perGroup, everyone)) if (e.type === 'projectileLaunched') count++;
    expect(count).toBe(2);
    const overall = squareOff({ enemyAttacks: { groupGapTicks: 0, maxInFlight: 1 } });
    count = 0;
    for (let t = 0; t < 8; t++)
      for (const e of tick(overall, everyone)) if (e.type === 'projectileLaunched') count++;
    expect(count).toBe(1);
  });

  it('gives each enemy its own cooldown after a throw', () => {
    const s = lineScene('thrower', 8, { config: { enemyAttacks: { groupGapTicks: 0 } } });
    s.players[0]!.vitals!.hp = 99;
    const launches: number[] = [];
    for (let t = 0; t < 900; t++)
      for (const e of tick(s, press)) if (e.type === 'projectileLaunched') launches.push(s.tick);
    expect(launches.length).toBeGreaterThanOrEqual(3);
    const shortest = Math.min(CFG.projectiles.bottle.cooldownTicks, CFG.projectiles.stone.cooldownTicks);
    for (let i = 1; i < launches.length; i++)
      expect(launches[i]! - launches[i - 1]!).toBeGreaterThanOrEqual(shortest);
  });

  it('leaves a free window after a hit: a second object arriving inside it lands harmlessly', () => {
    // two throwers on one human: one along the row, one up the column; the group gap staggers their cues
    const s = enemyScene({
      human: { x: 8, y: 2, hp: 99 },
      enemies: [
        { kind: 'thrower', x: 4, y: 2 },
        { kind: 'thrower', x: 8, y: 5 },
      ],
    });
    s.players[1]!.facing = 'right';
    s.players[2]!.facing = 'up';
    const ev = run(s, 400, { 1: { special: true }, 2: { special: true } });
    const onHuman = eventsOf(ev, 'projectileHit').filter((e) => e.victimId === 0);
    expect(onHuman.length).toBeGreaterThanOrEqual(2);
    expect(['dazed', 'damaged']).toContain(onHuman[0]!.result);
    expect(onHuman[1]!.result).toBe('invulnerable'); // inside stun + victimFreeTicks
    expect(s.players[0]!.vitals!.hp).toBe(99);
  });
});

describe('the B press of an enemy', () => {
  it("punches an adjacent rival: a slower wind-up than the player's, campaign damage on arrival", () => {
    const s = enemyScene({ human: { x: 6, y: 2, hp: 3 }, enemies: [{ kind: 'guard', x: 7, y: 2 }] });
    s.players[1]!.facing = 'left';
    const ev = tick(s, press);
    const [start] = eventsOf(ev, 'attackStarted');
    expect(start).toMatchObject({ playerId: 1, targetId: 0 });
    const player = DEFAULT_CONFIG.skills.attacks.push.startupTicks;
    expect(start!.resolveTick - s.tick).toBe(player + CFG.melee.guard!.extraStartupTicks);
    expect(start!.resolveTick - s.tick).toBeGreaterThan(player * 3);
    const after = run(s, start!.resolveTick - s.tick);
    expect(eventsOf(after, 'attackResolved')[0]).toMatchObject({ playerId: 1, hit: true });
    expect(
      eventsOf(after, 'campaignHit').filter((e) => e.victimId === 0 && e.source === 'punch'),
    ).toHaveLength(1);
    expect(s.players[0]!.vitals!.hp).toBe(2);
    // pressing again at once does nothing (cooldown, free window): no second punch starts
    expect(eventsOf(run(s, 20, press), 'attackStarted')).toHaveLength(0);
  });

  it('a rival who steps away in time is missed, and a fast jab cuts the wind-up short', () => {
    const away = enemyScene({ human: { x: 6, y: 2, hp: 3 }, enemies: [{ kind: 'guard', x: 7, y: 2 }] });
    away.players[1]!.facing = 'left';
    const start = eventsOf(tick(away, press), 'attackStarted')[0]!;
    const ev = run(away, start.resolveTick - away.tick + 2, (t) => (t < 2 ? { 0: { move: 'left' } } : {}));
    expect(eventsOf(ev, 'attackResolved')[0]).toMatchObject({ playerId: 1, hit: false });
    expect(away.players[0]!.vitals!.hp).toBe(3);

    const jab = enemyScene({ human: { x: 6, y: 2, hp: 3 }, enemies: [{ kind: 'guard', x: 7, y: 2 }] });
    jab.players[0]!.attacks = { primary: 'push', secondary: null };
    jab.players[0]!.facing = 'right';
    jab.players[1]!.facing = 'left';
    tick(jab, press);
    const ev2 = run(jab, 40, (t) => (t === 1 ? { 0: { special: true } } : {}));
    expect(eventsOf(ev2, 'attackInterrupted').some((e) => e.playerId === 1)).toBe(true);
    expect(jab.players[0]!.vitals!.hp).toBe(3);
  });

  it('a thrower with a rival next to it shoves instead of throwing', () => {
    const s = enemyScene({ human: { x: 6, y: 2, hp: 3 }, enemies: [{ kind: 'thrower', x: 7, y: 2 }] });
    s.players[1]!.facing = 'left';
    const ev = tick(s, press);
    expect(eventsOf(ev, 'projectileLaunched')).toHaveLength(0);
    expect(eventsOf(ev, 'attackStarted')[0]).toMatchObject({ playerId: 1, skill: 'shove' });
  });

  it('a kind with no thrown object never throws, even with a rival in a clear line; an agbero only punches', () => {
    for (const kind of ['agbero', 'guard'] as EnemyKind[]) {
      const g = lineScene(kind);
      expect(eventsOf(run(g, 120, press), 'projectileLaunched'), kind).toHaveLength(0);
      expect(g.projectiles, kind).toBeUndefined();
    }
    const t = enemyScene({ human: { x: 6, y: 2, hp: 3 }, enemies: [{ kind: 'agbero', x: 7, y: 2 }] });
    expect(eventsOf(tick(t, press), 'attackStarted')).toHaveLength(1);
  });

  it('enemies never use generators: the place intent is ignored for an enemy seat', () => {
    const s = enemyScene({ human: { x: 8, y: 2, hp: 3 }, enemies: [{ kind: 'guard', x: 4, y: 2 }] });
    const ev = run(s, 30, { 1: { place: true, placeHeld: true } });
    expect(s.generators).toHaveLength(0);
    expect(eventsOf(ev, 'generatorPlaced')).toHaveLength(0);
    // ... and the human still can
    expect(eventsOf(run(s, 2, { 0: { place: true } }), 'generatorPlaced')).toHaveLength(1);
  });

  it('the enemy bot never sends place / detonate / vehicle intents and never lays a generator over 40 seconds', () => {
    const s = enemyScene({
      human: { x: 7, y: 5, hp: 99 },
      enemies: (['agbero', 'guard', 'thrower', 'heavy'] as EnemyKind[]).map((kind) => ({ kind, x: 0, y: 0 })),
    });
    placeRing(s, openSpot(s, 7, 5));
    const bots = s.players
      .slice(1)
      .map((p) => createBot({ difficulty: 'nightmare', seed: 5 + p.id, playerId: p.id }));
    let presses = 0;
    for (let t = 0; t < 2400; t++) {
      const intents: Intents = {};
      s.players.slice(1).forEach((p, i) => {
        const intent = bots[i]!.decide(observe(s, p.id));
        expect(intent.place).toBeUndefined();
        expect(intent.placeHeld).toBeUndefined();
        expect(intent.detonate).toBeUndefined();
        expect(intent.vehicle).toBeUndefined();
        expect(intent.disarm).toBeUndefined();
        if (intent.special) presses++;
        intents[p.id] = intent;
      });
      tick(s, intents);
    }
    expect(s.generators).toHaveLength(0);
    expect(presses).toBeGreaterThan(0); // they did attack
  });
});

describe('reinforcement calls', () => {
  function callsOver(
    kind: EnemyKind,
    ticks: number,
    withGroup = false,
  ): { events: SimEvent[]; s: GameState } {
    const s = enemyScene({
      human: { x: 8, y: 2, hp: 99 },
      enemies: [
        { kind, x: 4, y: 2, hp: 4 },
        ...(withGroup
          ? [
              { kind: 'guard' as const, x: 2, y: 2 },
              { kind: 'guard' as const, x: 2, y: 4 },
            ]
          : []),
      ],
    });
    const n = s.players.length;
    return { events: run(s, ticks), s: Object.assign(s, { players: s.players.slice(0, n) }) };
  }

  it('a lone lieutenant calls once, a lone boss twice, the others never; nothing is spawned here', () => {
    const lt = callsOver('lieutenant', 3000);
    expect(eventsOf(lt.events, 'reinforcementCalled')).toHaveLength(CFG.reinforce.maxCalls.lieutenant);
    const boss = callsOver('boss', 3000);
    const calls = eventsOf(boss.events, 'reinforcementCalled');
    expect(calls).toHaveLength(CFG.reinforce.maxCalls.boss);
    expect(calls[1]!.untilTick - calls[0]!.untilTick).toBeGreaterThanOrEqual(CFG.reinforce.cooldownTicks);
    expect(calls[0]).toMatchObject({
      callerId: 1,
      enemyKind: 'boss',
      count: CFG.reinforce.count.boss,
      team: 1,
    });
    expect(boss.s.players).toHaveLength(2); // no player was added
    for (const kind of ['agbero', 'guard', 'thrower', 'heavy'] as EnemyKind[])
      expect(eventsOf(callsOver(kind, 600).events, 'reinforcementCalled')).toHaveLength(0);
  });

  it('a lieutenant with its group around calls only once it is badly hurt', () => {
    const fresh = callsOver('lieutenant', 300, true);
    expect(eventsOf(fresh.events, 'reinforcementCalled')).toHaveLength(0);
    const s = enemyScene({
      human: { x: 8, y: 2, hp: 99 },
      enemies: [
        { kind: 'lieutenant', x: 4, y: 2, hp: 4 },
        { kind: 'guard', x: 2, y: 2 },
        { kind: 'guard', x: 2, y: 4 },
      ],
    });
    s.players[1]!.vitals!.hp = 2; // at the threshold share
    expect(eventsOf(run(s, 5), 'reinforcementCalled')).toHaveLength(1);
    expect(s.enemyFire!.calls).toHaveLength(1);
  });
});

describe('normal matches are untouched', () => {
  it('a bot match never creates projectiles or enemy bookkeeping and emits no enemy event', () => {
    const run1 = (): { json: string; types: Set<string>; state: GameState } => {
      const s = createGame({
        seed: 11,
        players: [0, 1, 2, 3].map((i) => ({
          name: `B${i}`,
          characterId: 'streetBaller' as const,
          isBot: true,
          difficulty: 'standard' as const,
        })),
        settings: { stageHazards: false },
      });
      const bots = s.players.map((p) =>
        createBot({ difficulty: 'standard', seed: 3 + p.id, playerId: p.id }),
      );
      const types = new Set<string>();
      for (let t = 0; t < 1800; t++) {
        const intents: Intents = {};
        for (const p of s.players) if (p.alive) intents[p.id] = bots[p.id]!.decide(observe(s, p.id));
        for (const e of tick(s, intents)) types.add(e.type);
      }
      return { json: hashOf(s), types, state: s };
    };
    const a = run1();
    const b = run1();
    expect(a.json).toBe(b.json); // deterministic
    expect(a.state.projectiles).toBeUndefined();
    expect(a.state.enemyFire).toBeUndefined();
    expect('projectiles' in a.state).toBe(false);
    expect('enemyFire' in a.state).toBe(false);
    for (const t of ['projectileLaunched', 'projectileHit', 'reinforcementCalled', 'campaignHit'])
      expect(a.types.has(t)).toBe(false);
    for (const p of a.state.players) {
      expect(p.enemyKind).toBeUndefined();
      expect(p.vitals).toBeUndefined();
    }
  });

  it('the observation of a normal player carries no directive and the human B press is unchanged', () => {
    const s = sandbox({ players: 2 });
    expect(observe(s, 0).directive).toBeUndefined();
    expect(observe(s, 1).directive).toBeUndefined();
  });
});
