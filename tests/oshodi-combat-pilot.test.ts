/**
 * THE OSHODI MISSION 1 COMBAT PILOT (decisions CP1-CP12, docs/OSHODI_COMBAT_PILOT.md), through the REAL tick on the
 * REAL Terminal Approach field mission. Every check reads actual health, defeats, accepted presses and events:
 *
 *   gate        only `oshodi.approach` carries `config.combatPilot`; other field missions, the Dispatch Depot raid, the
 *               boss missions, City Rumble and Classic do not, and their enemies keep their health
 *   1-7         punch-only guard / thrower, generator-only, mixed, two enemies, the heavy, presses under fire
 *   8           repeated deaths and respawns, by blasts and by enemy punches (with the respawn-freeze hotfix)
 *   10          checkpoints, the door hold, the raid hand-over and the return still work with the pilot on
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_CONFIG,
  CHARACTER_IDS,
  OSHODI_COMBAT_PILOT,
  buildMissionGame,
  buildRaidGame,
  createGame,
  enemyDef,
  missionView,
  tick,
} from '../src/sim';
import type { CharacterId, GameState, Intent, SimEvent } from '../src/sim';
import { resolveRaid } from '../src/sim/mission/field';
import { FIELD_COMBAT_PILOTS, fieldEnemiesOf } from '../src/sim/mission/combatPilot';
import { getFieldMission } from '../src/sim/mission/fieldDefs';
import { addGenerator } from './helpers';
import { FieldWalker, raidOutcome, walkField } from './field-helpers';
import { oshodiScene } from '../scripts/lib/pilotFight';
import type { SceneEnemy } from '../scripts/lib/pilotFight';

const P = OSHODI_COMBAT_PILOT;

function scene(
  enemies: SceneEnemy[],
  o: { character?: CharacterId; level?: 'easy' | 'normal' | 'hard' } = {},
): GameState {
  return oshodiScene({ seed: 5, human: { x: 9, y: 39, facing: 'right' }, enemies, ...o }).state;
}

/** Runs `n` ticks with the human's intent from `human(t)` and the enemies idle; returns every event. */
function run(s: GameState, n: number, human: (t: number) => Intent = () => ({})): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < n; t++) out.push(...tick(s, { 0: human(t) }));
  return out;
}

const hits = (ev: SimEvent[], victim: number) =>
  ev.filter(
    (e): e is Extract<SimEvent, { type: 'campaignHit' }> => e.type === 'campaignHit' && e.victimId === victim,
  );

/** Taps B every `every` ticks until the enemy in seat 1 is down; returns the punches that took health and the ticks. */
function punchOut(s: GameState, every = 8, max = 600): { landed: number; ticks: number; events: SimEvent[] } {
  const events: SimEvent[] = [];
  let t = 0;
  for (; t < max && s.players[1]!.alive; t++)
    events.push(...tick(s, { 0: t % every === 0 ? { special: true } : {} }));
  return {
    landed: hits(events, 1).filter((e) => e.damage > 0 && e.source === 'player').length,
    ticks: t,
    events,
  };
}

describe('the pilot is gated to the Oshodi Terminal Approach field mission (CP1)', () => {
  const field = (fieldId: string) =>
    createGame(
      buildMissionGame({
        spec: { id: fieldId.split('.')[0] as never, fieldId },
        humanCharacter: 'streetBaller',
        seed: 1,
      }),
    );

  it('Terminal Approach carries the pilot and its enemies have the pilot health', () => {
    const s = field('oshodi.approach');
    expect(s.config.combatPilot?.id).toBe(P.id);
    const kinds = s.players.filter((p) => p.enemyKind).map((p) => [p.enemyKind, p.vitals!.maxHp]);
    expect(kinds).toEqual([
      ['guard', 3],
      ['guard', 3],
      ['heavy', 5],
      ['guard', 3],
      ['thrower', 2],
    ]);
  });

  it('every other field mission, the depot raid, the boss missions, Rumble and Classic have no pilot at all', () => {
    for (const def of Object.keys(FIELD_COMBAT_PILOTS)) expect(def).toBe('oshodi.approach');
    const rail = field('oshodi.railEdge');
    expect('combatPilot' in rail.config).toBe(false);
    for (const p of rail.players) if (p.enemyKind) expect(p.vitals!.maxHp).toBe(enemyDef(p.enemyKind).hp);
    expect(fieldEnemiesOf(getFieldMission('oshodi.railEdge'))).toBe(
      getFieldMission('oshodi.railEdge').enemies,
    );
    const raid = createGame(
      buildRaidGame({ raidId: 'warehouseDispatchDepot', humanCharacter: 'streetBaller', seed: 1 }),
    );
    expect('combatPilot' in raid.config).toBe(false);
    expect(raid.config.generator.blastMode).toBe('plus'); // the raid keeps its cross blasts
    const boss = createGame(
      buildMissionGame({ spec: { id: 'oshodi' }, humanCharacter: 'streetBaller', seed: 1 }),
    );
    expect('combatPilot' in boss.config).toBe(false);
    const rumble = createGame({
      seed: 1,
      arenaId: 'rumbleOshodi',
      players: Array.from({ length: 4 }, (_, i) => ({
        name: `p${i}`,
        characterId: 'streetBaller' as const,
        isBot: i > 0,
      })),
      settings: { game: 'survival' },
    });
    expect('combatPilot' in rumble.config).toBe(false);
    expect('pilotCombat' in rumble).toBe(false);
  });

  it('the pilot field mission keeps its radius blasts and Normal adds no level layer', () => {
    const o = buildMissionGame({
      spec: { id: 'oshodi', fieldId: 'oshodi.approach' },
      humanCharacter: 'streetBaller',
      seed: 1,
      level: 'normal',
    });
    expect(o.config).toBeUndefined();
    expect(createGame(o).config.generator.blastMode).toBe('radial');
  });
});

describe('1-2. punches defeat ordinary enemies in 2-3 hits, whatever the fighter (CP2-CP3)', () => {
  for (const character of CHARACTER_IDS) {
    it(`${character}: a guard takes exactly 3 punches, a thrower 2`, () => {
      const g = scene([{ kind: 'guard', x: 10, y: 39 }], { character });
      const rg = punchOut(g);
      expect(g.players[1]!.alive).toBe(false);
      expect(rg.landed).toBe(3);
      expect(rg.ticks).toBeLessThan(90); // 1.5 s of tapping
      const t = scene([{ kind: 'thrower', x: 10, y: 39 }], { character });
      const rt = punchOut(t);
      expect(t.players[1]!.alive).toBe(false);
      expect(rt.landed).toBe(2);
    });
  }

  it('every accepted press swings; out of reach it is a clear miss that takes nothing', () => {
    const s = scene([{ kind: 'guard', x: 12, y: 39 }]);
    const ev = run(s, 30, (t) => (t === 0 ? { special: true } : {}));
    expect(ev.filter((e) => e.type === 'punchSwing')).toHaveLength(1);
    expect(ev.find((e) => e.type === 'attackResolved')).toMatchObject({ hit: false, targetId: null });
    expect(hits(ev, 1)).toHaveLength(0);
    expect(s.players[1]!.vitals!.hp).toBe(3);
  });

  it('the punch reaches a diagonal enemy and one standing on the human tile', () => {
    for (const [x, y] of [
      [10, 40],
      [9, 39],
    ] as const) {
      const s = scene([{ kind: 'guard', x, y }]);
      run(s, 12, (t) => (t === 0 ? { special: true } : {}));
      expect(s.players[1]!.vitals!.hp, `${x},${y}`).toBe(2);
    }
  });

  it('a stagger cuts a wind-up short, then the enemy is immune to stagger for a while (no stun-lock)', () => {
    const s = scene([{ kind: 'guard', x: 10, y: 39 }]);
    const g = s.players[1]!;
    tick(s, { 1: { special: true } }); // the guard starts its wind-up
    expect(g.attack).not.toBeNull();
    const ev = run(s, P.punch.startupTicks + 1, (t) => (t === 0 ? { special: true } : {}));
    expect(ev.some((e) => e.type === 'attackInterrupted' && e.playerId === 1)).toBe(true);
    expect(g.attack).toBeNull();
    expect(g.dazedUntil).toBeGreaterThan(s.tick);
    expect(g.dazeImmuneUntil).toBe(g.dazedUntil + P.punch.staggerImmunityTicks);
    // the next punch inside the immunity takes health but does not stagger again
    run(s, P.punch.staggerTicks + 1);
    const ev2 = run(s, P.punch.hitRecoveryTicks + P.punch.startupTicks + 2, (t) =>
      t === 0 ? { special: true } : {},
    );
    const h = hits(ev2, 1).find((e) => e.source === 'player')!;
    expect(h.damage).toBe(1);
    expect(h.dazeTicks).toBe(0);
    expect(s.tick).toBeGreaterThanOrEqual(g.dazedUntil);
  });
});

describe('3-4. generators stay the big weapon; punches set them up (CP3)', () => {
  it('one blast drops a guard (3 segments) and is not blocked by a punch just before it', () => {
    const s = scene([{ kind: 'guard', x: 10, y: 39 }]);
    addGenerator(s, { ownerId: 0, x: 11, y: 39, timer: 12 });
    const ev = run(s, 6, (t) => (t === 0 ? { special: true } : {}));
    expect(hits(ev, 1)[0]).toMatchObject({ source: 'player', damage: 1 });
    run(s, 20);
    expect(s.players[1]!.alive).toBe(false);
  });

  it('a heavy survives one blast (3 of 5) and is finished by two punches', () => {
    const s = scene([{ kind: 'heavy', x: 10, y: 39 }]);
    addGenerator(s, { ownerId: 0, x: 11, y: 39, timer: 2 });
    run(s, 6);
    expect(s.players[1]!.vitals!.hp).toBe(2);
    run(s, 20); // past the blast's flames
    const r = punchOut(s);
    expect(s.players[1]!.alive).toBe(false);
    expect(r.landed).toBe(2);
  });

  it('the human still takes the ordinary 2 from a blast (only enemies get the pilot number)', () => {
    const s = scene([{ kind: 'guard', x: 20, y: 39 }]);
    addGenerator(s, { ownerId: 0, x: 9, y: 39, timer: 2 });
    run(s, 5);
    expect(s.players[0]!.vitals!.hp).toBe(s.players[0]!.vitals!.maxHp - CAMPAIGN_CONFIG.damage.blast);
  });
});

describe('5. two ordinary enemies take turns (CP7)', () => {
  it('never two wind-ups on the human at once, and a hit buys the free window', () => {
    const s = oshodiScene({
      seed: 3,
      human: { x: 9, y: 39 },
      enemies: [
        { kind: 'guard', x: 10, y: 39 },
        { kind: 'guard', x: 8, y: 39 },
      ],
    });
    let both = 0;
    let lastHit = -1e9;
    let minGap = Infinity;
    for (let t = 0; t < 600 && s.state.players[0]!.alive; t++) {
      const ev = tick(s.state, { 1: { special: true }, 2: { special: true } });
      if (s.state.players[1]!.attack && s.state.players[2]!.attack) both++;
      for (const e of hits(ev, 0)) {
        if (e.damage <= 0) continue;
        minGap = Math.min(minGap, s.state.tick - lastHit);
        lastHit = s.state.tick;
      }
    }
    expect(both).toBe(0);
    expect(minGap).toBeGreaterThanOrEqual(60); // the human's own recovery frames, at least
  });
});

describe('6. the heavy is steadfast: five punches, staggered only by every third (CP3)', () => {
  it('takes 5, and only the 3rd punch cuts its wind-up short', () => {
    const s = scene([{ kind: 'heavy', x: 10, y: 39 }]);
    const h = s.players[1]!;
    const staggered: number[] = [];
    let n = 0;
    for (let t = 0; t < 900 && h.alive; t++) {
      const ev = tick(s, { 0: t % 8 === 0 ? { special: true } : {} });
      for (const e of hits(ev, 1))
        if (e.source === 'player' && e.damage > 0) {
          n++;
          if (e.dazeTicks > 0) staggered.push(n);
        }
    }
    expect(h.alive).toBe(false);
    expect(n).toBe(5);
    expect(staggered).toEqual([3]);
  });
});

describe('7. presses under fire are kept, never silently lost (CP5)', () => {
  it('B pressed during hit-stun punches the moment the stun ends', () => {
    const s = scene([{ kind: 'guard', x: 10, y: 39 }]);
    const me = s.players[0]!;
    me.dazedUntil = s.tick + 10;
    const ev = run(s, 20, (t) => (t === 2 ? { special: true } : {}));
    const start = ev.find((e) => e.type === 'punchSwing');
    expect(start).toBeDefined();
    expect(s.players[1]!.vitals!.hp).toBe(2);
  });

  it('A pressed during hit-stun lays the generator when the stun ends; a press too early is dropped with a notice', () => {
    const s = scene([{ kind: 'guard', x: 14, y: 39 }]);
    s.players[0]!.dazedUntil = s.tick + 10;
    const ev = run(s, 16, (t) => (t === 0 ? { place: true } : {}));
    expect(ev.filter((e) => e.type === 'generatorPlaced')).toHaveLength(1);
    const s2 = scene([{ kind: 'guard', x: 14, y: 39 }]);
    s2.players[0]!.dazedUntil = s2.tick + 60; // a long stun: the press is not stretched over it
    const ev2 = run(s2, 65, (t) => (t === 0 ? { place: true } : {}));
    expect(ev2.filter((e) => e.type === 'generatorPlaced')).toHaveLength(0);
    expect(ev2.find((e) => e.type === 'placeRefused')).toMatchObject({ reason: 'stunned' });
  });

  it('a press with every socket in use or on a taken tile says why at once', () => {
    const s = scene([{ kind: 'guard', x: 14, y: 39 }]);
    const me = s.players[0]!;
    run(s, 2, (t) => (t === 0 ? { place: true } : {}));
    const ev = run(s, 2, (t) => (t === 0 ? { place: true } : {}));
    expect(ev.find((e) => e.type === 'placeRefused')).toMatchObject({
      reason: me.capacity > 1 ? 'occupied' : 'capacity',
    });
  });

  it('a punch press during the punch recovery is kept and lands next (mashing is never wasted)', () => {
    const s = scene([{ kind: 'guard', x: 10, y: 39 }]);
    const ev = run(s, 50, (t) => (t === 0 || t === P.punch.startupTicks + 4 ? { special: true } : {}));
    expect(ev.filter((e) => e.type === 'punchSwing')).toHaveLength(2);
  });

  it('enemies keep off the human tile (they used to stand inside the player, out of reach)', () => {
    const s = oshodiScene({
      seed: 1,
      human: { x: 9, y: 39 },
      enemies: [{ kind: 'guard', x: 10, y: 39 }],
    }).state;
    for (let t = 0; t < 300; t++) {
      tick(s, { 1: { move: 'left' } });
      expect(s.players[1]!.x === 9 && s.players[1]!.y === 39).toBe(false);
    }
  });
});

describe('8. repeated deaths and respawns keep the ordinary lifecycle', () => {
  it('blast deaths spend a life each, respawn at the checkpoint with full health, the last one ends the mission', () => {
    const s = scene([{ kind: 'guard', x: 20, y: 42 }]);
    const m = s.mission!;
    const me = s.players[0]!;
    for (let life = 1; life <= m.livesMax; life++) {
      for (let i = 0; i < 400 && me.alive && s.match.phase === 'playing'; i++) {
        if (s.generators.length === 0 && s.tick >= me.protectedUntil)
          addGenerator(s, { ownerId: 1, x: me.x, y: me.y, timer: 1 });
        tick(s, {});
      }
      expect(m.livesUsed).toBe(life);
      if (life === m.livesMax) break;
      for (let i = 0; i < 600 && !me.alive; i++) tick(s, {});
      expect(me.alive).toBe(true);
      expect(me.vitals!.hp).toBe(me.vitals!.maxHp);
    }
    for (let i = 0; i < 10; i++) tick(s, {});
    expect(m.outcome?.result).toBe('lost');
  });

  // RF1-RF4 (the respawn-freeze hotfix, released in 5869154 and integrated on the review branch): a defeat dealt by an
  // enemy attack spends a life and schedules the respawn. On the pilot branch (from b55e95f) this was an `it.fails`
  // tripwire; with the release underneath it is an ordinary regression test of the pilot's punches and the lifecycle.
  it('repeated deaths from enemy punches spend a life each, respawn with full health, the last one ends the mission', () => {
    const s = scene([{ kind: 'guard', x: 10, y: 39 }]);
    const m = s.mission!;
    const me = s.players[0]!;
    const guard = s.players[1]!;
    for (let life = 1; life <= m.livesMax; life++) {
      // the guard right next to the human, the human on its last segment with no protection
      guard.x = guard.stepFromX = me.x + 1;
      guard.y = guard.stepFromY = me.y;
      guard.stepRemaining = 0;
      me.vitals!.hp = 1;
      me.vitals!.invulnUntil = 0;
      me.protectedUntil = 0;
      s.enemyFire = undefined; // no free window left over from the last life
      for (let i = 0; i < 300 && me.alive; i++) tick(s, { 1: { special: true } });
      expect(me.alive, `life ${life}: defeated by the punch`).toBe(false);
      expect(m.livesUsed).toBe(life);
      if (life === m.livesMax) break;
      expect(me.respawnAt, `life ${life}: a respawn is scheduled`).not.toBeNull();
      for (let i = 0; i < 600 && !me.alive; i++) tick(s, {});
      expect(me.alive, `life ${life}: back on the map`).toBe(true);
      expect(me.vitals!.hp).toBe(me.vitals!.maxHp);
    }
    for (let i = 0; i < 10; i++) tick(s, {});
    expect(m.outcome?.result).toBe('lost');
  });
});

describe('10. the mission route is untouched: checkpoints, door hold, raid and return', () => {
  it('walks A, B, C, holds the depot door, plays the raid, returns to the gate and wins', () => {
    const s = createGame(
      buildMissionGame({
        spec: { id: 'oshodi', fieldId: 'oshodi.approach' },
        humanCharacter: 'streetBaller',
        seed: 2,
      }),
    );
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    for (const p of s.players) if (p.enemyKind) p.alive = false; // the route alone
    let raids = 0;
    const r = walkField(s, 60 * 200, {
      walker: new FieldWalker(),
      onRaid: (st, events) => {
        raids++;
        const req = st.mission!.pendingRaid!;
        expect(
          'combatPilot' in
            createGame(buildRaidGame({ raidId: req.raidId, humanCharacter: 'streetBaller', seed: 1 })).config,
        ).toBe(false);
        resolveRaid(st, req.doorId, raidOutcome(req.raidId), events);
      },
    });
    expect(raids).toBe(1);
    expect(s.mission!.outcome?.result).toBe('won');
    expect(
      r.events.filter((e) => e.type === 'missionPhase' && e.change === 'cleared').length,
    ).toBeGreaterThanOrEqual(2);
    expect(missionView(s)).not.toBeNull();
    expect(s.config.combatPilot?.id).toBe(P.id);
  });
});
