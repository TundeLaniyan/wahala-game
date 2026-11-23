/**
 * The Test Lab's registry and isolated scenarios (docs/TEST_LAB.md, decision TL3): every scenario builds a valid raid
 * state, is deterministic, wakes exactly the enemies it names through the sim's own wave code, and runs under the real
 * enemy bots without error at every level. The set-up only chooses positions: these tests check the positions' promises
 * (behind the guard, hidden by a corner, a row, adjacent, surrounded), never an outcome.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../../src/ai';
import {
  CAMPAIGN_MISSION_IDS,
  FIELD_MISSION_DEFS,
  RAID_DEFS,
  RUMBLE_ARENA_IDS,
  STANDARD_ARENA_IDS,
  buildRaidGame,
  campaignEnemyLevel,
  createGame,
  inViewCone,
  observe,
  tick,
} from '../../src/sim';
import type { CampaignLevel, GameState, Intents } from '../../src/sim';
import { LAB_ENTRIES, entriesIn, entriesOf, entryById } from '../../src/testlab/registry';
import {
  ONE_HIT_POST,
  ONE_HIT_START,
  SCENARIOS,
  hidingTile,
  routeExposure,
  scenarioById,
} from '../../src/testlab/scenarios/defs';
import type { ScenarioDef } from '../../src/testlab/scenarios/defs';
import { routeFor } from '../../src/testlab/scenarios/kit';
import { hashOf } from '../raid-helpers';
import { RAID_TUNING } from '../../src/sim/raid';

const LEVELS: readonly CampaignLevel[] = ['easy', 'normal', 'hard'];

function build(def: ScenarioDef, level: CampaignLevel): GameState {
  const state = createGame(
    buildRaidGame({
      raidId: def.raidId,
      humanCharacter: 'streetBaller',
      seed: def.seed,
      difficulty: campaignEnemyLevel(level),
      level,
      timeLimitSec: def.timeLimitSec,
    }),
  );
  def.prepare(state);
  return state;
}

/** Plays `n` ticks with the real bots deciding for every living enemy and the human idle. */
function play(state: GameState, n: number, level: CampaignLevel, each?: () => void): void {
  const bots = new Map<number, ReturnType<typeof createBot>>();
  for (const p of state.players)
    if (p.isBot)
      bots.set(
        p.id,
        createBot({ difficulty: campaignEnemyLevel(level), seed: state.seed + p.id * 7919, playerId: p.id }),
      );
  for (let i = 0; i < n && state.match.phase !== 'ended'; i++) {
    const intents: Intents = { 0: {} };
    for (const [id, bot] of bots) if (state.players[id]!.alive) intents[id] = bot.decide(observe(state, id));
    tick(state, intents);
    each?.();
  }
}

/** The tick after which every kept enemy has appeared (countdown + the wave's warning + a beat). */
const AWAKE = 90 + RAID_TUNING.spawnWarnTicks + 10;

const enemiesAlive = (s: GameState): { id: number; kind: string }[] =>
  s.players.filter((p) => p.id > 0 && p.alive).map((p) => ({ id: p.id, kind: p.enemyKind ?? '' }));

describe('the registry', () => {
  it('has the five tests requiring review in the founder’s order and the fifteen completed ones, unique ids, one-line objectives', () => {
    expect(entriesOf('review').map((e) => e.id)).toEqual([
      'suddenDeath',
      'identifyPlayer',
      'teamBlastFfOff',
      'teamBlastFfOn',
      'teamBlastOverlap',
    ]);
    expect(entriesOf('completed').map((e) => e.id)).toEqual([
      'cityRumble',
      'occludedBuildings',
      'boss',
      'classicRearAmbush',
      'oneHit',
      'classicRaid',
      'recordsVault',
      'classicBlast',
      'fieldMission',
      'roster',
      'rearApproach',
      'patrolAmbush',
      'punchDodge',
      'pursuit',
      'flashlight',
    ]);
    expect(LAB_ENTRIES).toHaveLength(20);
    expect(new Set(LAB_ENTRIES.map((e) => e.id)).size).toBe(LAB_ENTRIES.length);
    for (const e of LAB_ENTRIES) {
      expect(e.title.length).toBeGreaterThan(2);
      expect(e.objective).not.toMatch(/\n/);
    }
    // every test that needs review says what to look for
    for (const e of entriesOf('review')) expect(e.lookFor?.length ?? 0).toBeGreaterThan(20);
  });

  it('keeps every id of the first fourteen tests (their stored feedback stays attached)', () => {
    for (const id of [
      'classicRaid',
      'recordsVault',
      'classicBlast',
      'cityRumble',
      'fieldMission',
      'boss',
      'roster',
      'rearApproach',
      'patrolAmbush',
      'oneHit',
      'punchDodge',
      'pursuit',
      'flashlight',
      'identifyPlayer',
    ])
      expect(entryById(id), id).toBeDefined();
    expect(entriesIn('playtest').length + entriesIn('scenario').length).toBe(LAB_ENTRIES.length);
  });

  it('every launch names something that exists in this build (the real modes, never a copy)', () => {
    for (const e of LAB_ENTRIES) {
      const l = e.launch;
      if (l.kind === 'raid') expect(RAID_DEFS[l.raidId]).toBeDefined();
      if (l.kind === 'scenario') expect(scenarioById(l.scenarioId)).toBeDefined();
      if (l.kind === 'field') expect(FIELD_MISSION_DEFS[l.missionId]).toBeDefined();
      if (l.kind === 'boss')
        expect((CAMPAIGN_MISSION_IDS as readonly string[]).includes(l.districtId)).toBe(true);
      if (l.kind === 'classic') expect(STANDARD_ARENA_IDS).toContain(l.arenaId);
      if (l.kind === 'rumble') expect(RUMBLE_ARENA_IDS).toContain(l.arenaId);
      for (const v of e.variants ?? []) expect(scenarioById(v.scenarioId)).toBeDefined();
    }
    expect(entryById('classicRaid')!.launch).toEqual({ kind: 'raid', raidId: 'warehouseDispatchDepot' });
    // the rear-ambush review test is the same real first raid
    expect(entryById('classicRearAmbush')!.launch).toEqual({
      kind: 'raid',
      raidId: 'warehouseDispatchDepot',
    });
    expect(entryById('recordsVault')!.launch).toEqual({ kind: 'raid', raidId: 'recordsVault' });
    expect(entryById('fieldMission')!.launch).toEqual({ kind: 'field', missionId: 'oshodi.approach' });
    expect(entryById('boss')!.launch).toEqual({ kind: 'boss', districtId: 'oshodi' });
    // occluded buildings: the Lekki Rumble stage (the arena whose buildings fade, e2e/view-clear.spec.ts)
    expect(entryById('occludedBuildings')!.launch).toMatchObject({ kind: 'rumble', arenaId: 'rumbleLekki' });
    expect(entryById('suddenDeath')!.launch).toEqual({ kind: 'suddenDeath' });
    expect(entryById('cityRumble')!.launch).toEqual({ kind: 'rumbleConfigured' });
  });

  it('every scenario (and every variant) has a definition and every definition an entry', () => {
    const ids = LAB_ENTRIES.flatMap((e) =>
      e.variants
        ? e.variants.map((v) => v.scenarioId)
        : e.launch.kind === 'scenario'
          ? [e.launch.scenarioId]
          : [],
    );
    expect(ids.sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
    for (const s of SCENARIOS) expect(s.setup.length).toBeGreaterThan(0);
    // the first variant is the entry's own launch
    for (const e of LAB_ENTRIES)
      if (e.variants && e.launch.kind === 'scenario')
        expect(e.variants[0]!.scenarioId).toBe(e.launch.scenarioId);
  });
});

describe('scenarios', () => {
  for (const def of SCENARIOS)
    describe(def.id, () => {
      for (const level of LEVELS)
        it(`builds a valid state and is deterministic at ${level}`, () => {
          const a = build(def, level);
          const b = build(def, level);
          expect(a.raid).toBeDefined();
          expect(a.match.phase).toBe('countdown');
          const human = a.players[0]!;
          expect(a.tiles[human.y * a.width + human.x]).toBe(0); // the human stands on open floor
          for (const seat of a.raid!.seats) expect(a.tiles[seat.spot.y * a.width + seat.spot.x]).toBe(0);
          expect(hashOf(a.raid)).toBe(hashOf(b.raid));
          expect(hashOf(a.players)).toBe(hashOf(b.players));
          play(a, 400, level);
          play(b, 400, level);
          expect(hashOf(a.players)).toBe(hashOf(b.players)); // the same play on the same prepared state
        });
    });

  it('only the named enemies wake, through the sim’s wave code, with no scripted outcome', () => {
    const expected: Record<string, string[]> = {
      rearApproach: ['guard'],
      patrolAmbush: ['guard'],
      oneHitAgbero: ['agbero'],
      oneHitGuard: ['guard'],
      oneHitThrower: ['thrower'],
      punchDodge: ['guard'],
      pursuit: ['guard', 'guard', 'guard', 'thrower', 'thrower'],
      flashlight: ['guard'],
      identifyPlayer: ['guard', 'guard', 'guard', 'thrower', 'thrower'],
    };
    for (const def of SCENARIOS) {
      const s = build(def, 'normal');
      expect(enemiesAlive(s)).toEqual([]); // nobody before the wave
      play(s, AWAKE, 'normal');
      expect(
        enemiesAlive(s)
          .map((e) => e.kind)
          .sort(),
      ).toEqual(expected[def.id]!.slice().sort());
      expect(s.players[0]!.alive).toBe(true);
      expect(s.raid!.outcome).toBeNull();
    }
  });

  it('rear approach: the guard wakes facing away, the player is outside its view cone', () => {
    const def = scenarioById('rearApproach')!;
    for (const level of LEVELS) {
      const s = build(def, level);
      play(s, AWAKE, level);
      const guard = s.players[1]!;
      const me = s.players[0]!;
      expect(inViewCone(guard, me.x, me.y)).toBe(false);
      // and it is walking its patrol loop (a route with corners)
      expect(routeFor(build(def, level), 1).waypoints.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('patrol ambush: hidden within 3 steps of a corner of the loop, off the route, rarely visible', () => {
    const def = scenarioById('patrolAmbush')!;
    const s = build(def, 'normal');
    const me = s.players[0]!;
    const route = routeFor(s, 1);
    expect(route.style).toBe('loop');
    const range = s.config.campaignTactics!.awareness.calmNoticeTiles.guard;
    const nearCorner = route.waypoints.some((c) => Math.abs(c.x - me.x) + Math.abs(c.y - me.y) <= 3);
    expect(nearCorner).toBe(true);
    expect(hidingTile(s, route.waypoints, range)).toEqual({ x: me.x, y: me.y });
    const exposure = routeExposure(s, route.waypoints, { x: me.x, y: me.y }, range);
    // far better hidden than standing on the loop's own corner (which every neighbouring tile sees)
    expect(exposure).toBeLessThan(routeExposure(s, route.waypoints, route.waypoints[0]!, range));
    expect(exposure).toBeLessThanOrEqual(2);
  });

  it('one-hit lethality: one ordinary enemy at the entrance post, facing into the depot, the player two steps from behind it', () => {
    for (const [id, kind] of [
      ['oneHitAgbero', 'agbero'],
      ['oneHitGuard', 'guard'],
      ['oneHitThrower', 'thrower'],
    ] as const) {
      const s = build(scenarioById(id)!, 'normal');
      const seats = s.raid!.seats.filter((x) => !x.active);
      expect(seats.map((x) => x.kind)).toEqual([kind]);
      expect(seats[0]!.spot).toEqual(ONE_HIT_POST);
      expect(s.players[seats[0]!.playerId]!.vitals).toBeDefined(); // ordinary health, nothing granted
      expect(s.players[0]!).toMatchObject({ x: ONE_HIT_START.x, y: ONE_HIT_START.y });
    }
  });

  it('punch dodge: the guard wakes beside the player and two free tiles are open to step to', () => {
    const s = build(scenarioById('punchDodge')!, 'normal');
    const me = s.players[0]!;
    const spot = s.raid!.seats[0]!.spot;
    expect(Math.abs(spot.x - me.x) + Math.abs(spot.y - me.y)).toBe(1);
    const free = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(
      ([dx, dy]) =>
        s.tiles[(me.y + dy!) * s.width + me.x + dx!] === 0 &&
        !(me.x + dx! === spot.x && me.y + dy! === spot.y),
    );
    expect(free.length).toBeGreaterThanOrEqual(2);
  });

  it('identify player: five enemies wake within three steps of the player', () => {
    const s = build(scenarioById('identifyPlayer')!, 'normal');
    const me = s.players[0]!;
    const near = s.raid!.seats.filter((x) => !x.active);
    expect(near).toHaveLength(5);
    for (const x of near) {
      const d = Math.abs(x.spot.x - me.x) + Math.abs(x.spot.y - me.y);
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(3);
    }
  });

  it('flashlight: the Records Vault at night, one torch guard', () => {
    const s = build(scenarioById('flashlight')!, 'normal');
    expect(s.arenaId).toBe('raidRecordsVault');
    expect(RAID_DEFS.recordsVault.lighting?.mode).toBe('night');
    expect(s.raid!.seats.filter((x) => !x.active)).toHaveLength(1);
  });
});
