/**
 * City Rumble Evolution, workstream C (decisions RE-C1..RE-C5): generator availability, the elimination
 * ladder under radial caps, supply crates, and the measurement harness (scripts/rumbleMetrics).
 */
import { describe, expect, it } from 'vitest';
import {
  ARENAS,
  DEFAULT_CONFIG,
  RUMBLE_ARENA_IDS,
  Tile,
  createGame,
  observe,
  previewRewards,
  radialFootprint,
  radialRadius,
  radialSquareRadius,
} from '../src/sim';
import type { GameKind, GameState, MatchSettings } from '../src/sim';
import { destroySoftBlocks } from '../src/sim/systems/explosions';
import { grantRewards } from '../src/sim/systems/rewards';
import type { SimEvent } from '../src/sim';
import {
  CampTracker,
  EmptyRunTracker,
  MetricsCollector,
  causeKey,
  mean,
  median,
  powerScore,
} from '../scripts/rumbleMetrics/collector';
import { ladderCurve, openBlastTiles } from '../scripts/rumbleMetrics/ladder';
import { aggregate, runMetricsMatch } from '../scripts/rumbleMetrics/run';
import { VARIANTS, mergeConfigs } from '../scripts/rumbleMetrics/variants';
import { eventsOf, put, run } from './helpers';

const RUMBLE: GameKind[] = ['survival', 'deathmatch', 'team'];
const CHARS = ['streetBaller', 'lekkiBoy', 'campusQueen'] as const;

/** A playing Rumble match with the crates cleared (scenarios stay controlled); stage hazards off. */
function rumble(
  game: GameKind,
  players = 4,
  arenaId = 'rumbleOshodi',
  extra: Partial<MatchSettings> = {},
  keepCrates = false,
): GameState {
  const s = createGame({
    seed: 3,
    arenaId,
    settings: { game, stageHazards: false, durationSec: 300, ...extra },
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      characterId: CHARS[i % 3]!,
      isBot: false,
    })),
  });
  if (!keepCrates) {
    s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
    s.hidden = {};
  }
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

describe('two generators from the start in every Rumble ruleset (RE-C1)', () => {
  it.each(RUMBLE)(
    '%s: every fighter starts with capacity 2 and can have exactly two on the floor',
    (game) => {
      const s = rumble(game);
      for (const p of s.players) expect(p.capacity).toBe(2);
      put(s, 0, 5, 6); // a road row: open floor to walk along
      const mine = (): number => s.generators.filter((g) => g.ownerId === 0).length;
      run(s, 1, { 0: { place: true } });
      expect(mine()).toBe(1);
      run(s, 14, { 0: { move: 'right' } });
      run(s, 1, { 0: { place: true } });
      expect(mine()).toBe(2);
      run(s, 14, { 0: { move: 'right' } });
      run(s, 1, { 0: { place: true } });
      expect(mine()).toBe(2); // the third is refused until one has gone off
    },
  );

  it.each(['deathmatch', 'team'] as const)(
    '%s: a respawn resets generators to 2, reach to 2 and the ladder to rung 1',
    (game) => {
      const s = rumble(game, 4);
      put(s, 1, 30, 6);
      put(s, 2, 30, 24);
      put(s, 3, 10, 24);
      const victim = s.players[0]!;
      put(s, 0, 5, 6);
      Object.assign(victim, { capacity: 7, range: 5, armour: 0, squareTier: 2, speedLevel: 2 });
      victim.stats.streak = 4;
      // an opponent's generator under the victim
      const killer = game === 'team' ? s.players.find((p) => p.team !== victim.team)! : s.players[1]!;
      put(s, killer.id, 30, 6);
      s.generators.push({
        id: s.nextId++,
        ownerId: killer.id,
        x: 5,
        y: 6,
        stepFromX: 5,
        stepFromY: 6,
        range: 2,
        pierce: false,
        square: 0,
        fromSpectator: false,
        mode: 'timed',
        timer: 1,
        carriedBy: null,
        carryBonusUsed: false,
        slide: null,
        flight: null,
        triggered: false,
        placedTick: s.tick,
      });
      const ev = run(s, 4);
      expect(eventsOf(ev, 'playerEliminated').some((e) => e.playerId === 0)).toBe(true);
      run(s, s.config.respawn.delayTicks + 240);
      expect(victim.alive).toBe(true);
      expect(victim.capacity).toBe(s.config.generator.baseCapacity);
      expect(s.config.generator.baseCapacity).toBe(2);
      expect(victim.range).toBe(s.config.generator.baseRange);
      expect(victim.squareTier).toBe(0);
      expect(victim.speedLevel).toBe(0);
      expect(victim.stats.streak).toBe(0);
      expect(previewRewards(s, victim)).toEqual(['socket', 'petrol']);
    },
  );

  it('Classic Battle is untouched: one generator, the cross, no elimination rewards, the old caps', () => {
    const s = createGame({
      seed: 1,
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: true },
      ],
    });
    expect(s.config.generator).toEqual(DEFAULT_CONFIG.generator);
    expect(s.config.generator.blastMode).toBe('plus');
    expect(s.config.generator.baseCapacity).toBe(1);
    expect(s.config.generator.maxCapacity).toBe(6);
    expect(s.config.generator.maxRange).toBe(8);
    expect(s.config.rewards).toEqual(DEFAULT_CONFIG.rewards);
    expect(s.config.rewards.enabled).toBe(false);
    expect(s.config.protection.maxArmour).toBe(1);
    expect(s.config.square).toEqual(DEFAULT_CONFIG.square);
    expect(s.config.supply).toEqual(DEFAULT_CONFIG.supply);
    expect(s.players.every((p) => p.capacity === 1)).toBe(true);
    expect(previewRewards(s, s.players[0]!)).toEqual([]);
    expect(s.supplies).toEqual([]);
  });
});

describe('the ladder under radial caps (RE-C4)', () => {
  const g = rumble('survival').config.generator;

  it('every rung up to the point where everything is owned pays, and nothing exceeds a cap', () => {
    for (const character of CHARS) {
      const rows = ladderCurve({ character, kills: 14 });
      const cfg = rumble('survival').config;
      let dry = false;
      for (const r of rows.slice(1)) {
        if (r.paid.length === 0) dry = true;
        else expect(dry, `kill ${r.kills} pays after a dry rung`).toBe(false);
        expect(r.radius).toBeLessThanOrEqual(g.maxRange);
        expect(r.capacity).toBeLessThanOrEqual(cfg.generator.maxCapacity);
        expect(r.armour).toBeLessThanOrEqual(cfg.protection.maxArmour);
        expect(r.squareTier).toBeLessThanOrEqual(cfg.square.maxTier);
      }
      // the first nine eliminations all pay something that makes the fighter stronger
      for (const r of rows.slice(1, 10)) expect(r.paid.length, `kill ${r.kills}`).toBeGreaterThan(0);
      // the early rungs are the documented ones: generators and reach first, then the tool
      expect(rows[1]!.paid).toEqual(['socket', 'petrol']);
      expect(rows[1]!.capacity).toBe(g.baseCapacity + 1);
    }
  });

  it('never pays a Square Blast tier that does not widen the footprint', () => {
    for (const character of CHARS) {
      const rows = ladderCurve({ character, kills: 14 });
      rows.forEach((r, i) => {
        if (i > 0 && r.paid.includes('square'))
          expect(r.blastTiles, `kill ${r.kills}`).toBeGreaterThan(rows[i - 1]!.blastTiles);
      });
    }
    // and the helper agrees with the simulation's own footprint on open ground
    const s = rumble('survival');
    const p = s.players[0]!;
    p.range = 5;
    p.squareTier = 1;
    const grid = { width: 31, height: 31, tiles: new Array<number>(31 * 31).fill(Tile.Empty) };
    const r = radialRadius(p.range, s.config.generator.maxRange);
    const sq = radialSquareRadius(r, p.squareTier, s.config.generator.radialMaxSquareRadius);
    expect(openBlastTiles(s.config, p)).toBe(
      radialFootprint(grid, 15, 15, r, { squareRadius: sq }).length + 1,
    );
  });

  it('progression is monotone: more eliminations is never weaker, and the early ladder strictly grows', () => {
    for (const variant of ['evolution', 'legacy'] as const) {
      for (const character of CHARS) {
        const rows = ladderCurve({ character, kills: 16, config: VARIANTS[variant]!.config });
        for (let i = 1; i < rows.length; i++) {
          const a = rows[i - 1]!;
          const b = rows[i]!;
          expect(b.power, `${variant} kill ${i}`).toBeGreaterThanOrEqual(a.power);
          expect(b.coverage).toBeGreaterThanOrEqual(a.coverage);
          expect(b.blastTiles).toBeGreaterThanOrEqual(a.blastTiles);
          for (const k of ['capacity', 'range', 'squareTier', 'armour', 'speedLevel'] as const)
            expect(b[k], `${variant} ${k} kill ${i}`).toBeGreaterThanOrEqual(a[k]);
          if (i <= 8) expect(b.power, `${variant} kill ${i} strictly stronger`).toBeGreaterThan(a.power);
        }
      }
    }
  });

  it('spent protection is paid again: a fighter who lost armour and the Okada gets them back first', () => {
    const s = rumble('survival');
    const p = s.players[0]!;
    // everything capped / owned except the protection layers the fighter has used up
    Object.assign(p, {
      capacity: s.config.generator.maxCapacity,
      range: s.config.generator.maxRange,
      speedLevel: s.config.pickups.maxSpeedLevel,
      squareTier: s.config.square.maxTier,
      contact: 'kick',
      remote: true,
      hasVoucher: true,
      armour: 0,
      mounted: false,
    });
    p.stats.streak = 11;
    const paid = previewRewards(s, p);
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.every((k) => k === 'armour' || k === 'okada')).toBe(true);
  });

  it('grantRewards applies exactly what the curve says (same code path as a real elimination)', () => {
    const s = rumble('survival');
    const curve = ladderCurve({ character: 'streetBaller', kills: 6 });
    const killer = s.players[0]!;
    for (let k = 1; k <= 6; k++) {
      killer.stats.kills++;
      killer.stats.streak++;
      const events: SimEvent[] = [
        {
          type: 'playerEliminated',
          playerId: 1,
          cause: { kind: 'flame', ownerId: 0, eventId: k },
          x: 0,
          y: 0,
          creditId: 0,
          assistIds: [],
        },
      ];
      grantRewards(s, events);
    }
    const row = curve[6]!;
    expect(killer.capacity).toBe(row.capacity);
    expect(killer.range).toBe(row.range);
    expect(killer.squareTier).toBe(row.squareTier);
    expect(killer.armour).toBe(row.armour);
    expect(killer.mounted).toBe(row.mounted);
    expect(
      powerScore(killer, { range: s.config.generator.baseRange, capacity: s.config.generator.baseCapacity }),
    ).toBe(row.power);
  });
});

describe('marked supply crates (RE-C3, RE-C5)', () => {
  const STAGES = ['rumbleOshodi', 'rumbleLagosIsland', 'rumbleApapa', 'rumbleLekkiNight'];
  const BASIC = ['socket', 'petrol'];

  it('the four V2 stages place a few symmetric supply crates; every stage keeps the count small', () => {
    for (const id of RUMBLE_ARENA_IDS) {
      const a = ARENAS[id]!;
      const marks = a.layout.join('').split('$').length - 1;
      expect(marks, id).toBeLessThanOrEqual(24);
      if (STAGES.includes(id)) expect(marks, id).toBeGreaterThanOrEqual(8);
    }
    for (const id of STAGES) {
      const a = ARENAS[id]!;
      const W = a.layout[0]!.length;
      const H = a.layout.length;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (a.layout[y]![x] !== '$') continue;
          expect(a.layout[y]![W - 1 - x], `${id} ${x},${y}`).toBe('$');
          expect(a.layout[H - 1 - y]![x]).toBe('$');
          // away from spawns (never inside a spawn's clearance), off roads, traps and strike zones
          for (const sp of a.spawns)
            expect(Math.abs(sp.x - x) + Math.abs(sp.y - y)).toBeGreaterThanOrEqual(5);
          for (const rows of [a.floorTraps ?? [], ...a.endgameTraps]) expect(rows[y]?.[x] ?? '.').toBe('.');
          for (const h of a.stageHazards) {
            if (h.kind === 'sweep')
              for (const r of h.routes) expect(r.some(([rx, ry]) => rx === x && ry === y)).toBe(false);
            if (h.kind === 'strike')
              for (const z of h.zones) expect(z.some(([zx, zy]) => zx === x && zy === y)).toBe(false);
          }
        }
    }
  });

  it.each(STAGES.flatMap((id) => RUMBLE.map((game) => [id, game] as const)))(
    '%s %s: supplies hold basic upgrades only; ordinary crates hold nothing',
    (id, game) => {
      const s = rumble(game, 4, id, {}, true);
      expect(s.supplies.length).toBeGreaterThanOrEqual(8);
      // the only hidden items on the board are the supplies' own
      expect(
        Object.keys(s.hidden)
          .map(Number)
          .sort((a, b) => a - b),
      ).toEqual([...s.supplies].sort((a, b) => a - b));
      for (const i of s.supplies) {
        expect(s.tiles[i]).toBe(Tile.Soft);
        expect(BASIC).toContain(s.hidden[i]);
        expect(s.config.supply.kinds).toContain(s.hidden[i]);
      }
    },
  );

  it('the marking is public and the content is not: observe() shows tiles, never what is inside', () => {
    const s = rumble('survival', 4, 'rumbleOshodi', {}, true);
    const view = observe(s, 1);
    expect(view.supplies).toEqual(s.supplies);
    expect(Object.keys(view)).not.toContain('hidden');
    const text = JSON.stringify({ ...view, config: undefined });
    expect(text).not.toContain('"petrol"');
    expect(text).not.toContain('"socket"');
  });

  it('is finite: blasting every supply pays once each and nothing ever refills', () => {
    const s = rumble('survival', 4, 'rumbleOshodi', {}, true);
    const count = s.supplies.length;
    const events: SimEvent[] = [];
    destroySoftBlocks(s, new Map(s.supplies.map((i) => [i, 1])), 'flame', events);
    expect(s.supplies).toEqual([]);
    expect(eventsOf(events, 'pickupRevealed')).toHaveLength(count);
    expect(s.pickups).toHaveLength(count);
    for (const p of s.pickups) expect(BASIC).toContain(p.kind);
    // a long time later no supply, crate or pickup has come back, and plain crates never revealed anything
    const all = run(s, 1200);
    expect(s.supplies).toEqual([]);
    expect(eventsOf(all, 'pickupRevealed')).toHaveLength(0);
    expect(s.pickups.length).toBeLessThanOrEqual(count);
    for (const i of [...Array(s.tiles.length).keys()])
      if (s.hidden[i] !== undefined) throw new Error('a hidden pickup is left');
  });

  it('Classic arenas place no supply crates', () => {
    for (const a of Object.values(ARENAS))
      if (a.kind !== 'rumble') expect(a.layout.join('')).not.toContain('$');
  });
});

describe('measurement harness (scripts/rumbleMetrics)', () => {
  it('median / mean / powerScore', () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(mean([1, 2, 3, 6])).toBe(3);
    const s = rumble('survival');
    const base = { range: 2, capacity: 2 };
    expect(powerScore(s.players[0]!, base)).toBe(0);
    Object.assign(s.players[0]!, {
      capacity: 4,
      range: 3,
      squareTier: 1,
      armour: 1,
      mounted: true,
      remote: true,
    });
    expect(powerScore(s.players[0]!, base)).toBe(2 + 1 + 2 + 2 + 2 + 1);
  });

  it('the camp tracker counts runs of at least the threshold inside a 3 x 3 area, and only those', () => {
    const t = new CampTracker(300); // 5 s
    // fighter 0 stays inside 3 x 3 for 6 s (sampled every 6 ticks), fighter 1 wanders
    for (let i = 0; i < 60; i++) {
      t.step(0, 10 + (i % 3), 5 + ((i >> 1) % 3), 6);
      t.step(1, i, 5, 6);
    }
    t.finish();
    expect(t.campedTicks).toBe(360);
    // a run of 4 s, then leaving, is not camping
    const u = new CampTracker(300);
    for (let i = 0; i < 40; i++) u.step(0, 3, 3, 6);
    u.step(0, 9, 9, 6);
    u.finish();
    expect(u.campedTicks).toBe(0);
    // a fighter who dies ends its run (banked only when long enough)
    const v = new CampTracker(300);
    for (let i = 0; i < 60; i++) v.step(0, 3, 3, 6);
    v.stop(0);
    v.step(0, 3, 3, 6);
    v.finish();
    expect(v.campedTicks).toBe(360);
  });

  it('the empty-run tracker flags stretches with no opponent in reach of 15 s or more', () => {
    const t = new EmptyRunTracker(900);
    for (let i = 0; i < 160; i++) t.step(0, true, 6); // 16 s alone: flagged
    t.step(0, false, 6);
    for (let i = 0; i < 100; i++) t.step(1, true, 6); // 10 s alone, then dies: not flagged
    t.stop(1);
    for (let i = 0; i < 160; i++) t.step(2, true, 6); // still alone when the match ends: flagged
    t.finish();
    expect(t.flaggedRuns).toBe(2);
    expect(t.longestTicks).toBe(960);
  });

  it('eliminations are classified by cause', () => {
    const s = rumble('team', 4);
    s.players.forEach((p, i) => (p.team = i % 2));
    const e = (
      playerId: number,
      cause: Extract<SimEvent, { type: 'playerEliminated' }>['cause'],
      creditId: number | null = null,
    ): Extract<SimEvent, { type: 'playerEliminated' }> => ({
      type: 'playerEliminated',
      playerId,
      cause,
      x: 0,
      y: 0,
      creditId,
      assistIds: [],
    });
    expect(causeKey(s, e(0, { kind: 'flame', ownerId: 0, eventId: 1 }))).toBe('ownBlast');
    expect(causeKey(s, e(0, { kind: 'flame', ownerId: 1, eventId: 1 }, 1))).toBe('rivalBlast');
    expect(causeKey(s, e(0, { kind: 'flame', ownerId: 2, eventId: 1 }))).toBe('teamBlast');
    expect(causeKey(s, e(0, { kind: 'vehicle', ownerId: 1, vehicleKind: 'taxi', eventId: 1 }, 1))).toBe(
      'vehicle',
    );
    expect(causeKey(s, e(0, { kind: 'crush', eventId: 1 }))).toBe('crush');
    expect(causeKey(s, e(0, { kind: 'crush', eventId: 1 }, 1))).toBe('melee');
    expect(causeKey(s, e(0, { kind: 'hazard', style: 'traffic', eventId: 1 }))).toBe('stageHazard');
    expect(causeKey(s, e(0, { kind: 'crowd', eventId: 1 }))).toBe('stageHazard');
  });

  it('a measured match is deterministic per seed and reports sane numbers; legacy and evolution differ', () => {
    const spec = {
      seed: 11,
      arenaId: 'rumbleOshodi',
      game: 'survival' as const,
      players: 12,
      difficulty: 'standard' as const,
      durationSec: null,
      maxPlayTicks: 20 * 60,
    };
    const evo = { ...spec, variant: VARIANTS.evolution! };
    const a = runMetricsMatch(evo);
    const b = runMetricsMatch(evo);
    expect({ ...a, msPerTick: 0 }).toEqual({ ...b, msPerTick: 0 });
    expect(a.fighters).toBe(12);
    expect(a.playSeconds).toBeGreaterThan(0);
    expect(a.placements).toBeGreaterThan(0);
    expect(a.placementsPerFighterMinute).toBeGreaterThan(0);
    for (const k of [
      'engagedShare',
      'exposedShare',
      'campShare',
      'aimedPlacementShare',
      'nearPlacementShare',
      'openingEngagedShare',
    ] as const) {
      expect(a[k]).toBeGreaterThanOrEqual(0);
      expect(a[k]).toBeLessThanOrEqual(1);
    }
    expect(a.elimsPerMinute).toBeCloseTo(a.eliminations / (a.playSeconds / 60), 6);
    expect(a.elims30).toBeLessThanOrEqual(a.elims60);
    expect(a.elims60).toBeLessThanOrEqual(a.eliminations);
    if (a.eliminations > 0) expect(a.firstElimSec).toBe(Math.min(...a.elimTimes));
    expect(a.selfEliminations).toBeLessThanOrEqual(a.eliminations);
    // the research metrics: causes add up, supplies / generators / slots are reported
    expect(Object.values(a.causes).reduce((x, y) => x + y, 0)).toBe(a.eliminations);
    expect(a.causes.ownBlast).toBeLessThanOrEqual(a.selfEliminations);
    if (a.firstEncounterSec !== null && a.firstElimSec !== null) {
      expect(a.firstEncounterSec).toBeGreaterThan(0);
    }
    expect(a.suppliesStart).toBe(8);
    expect(a.suppliesOpened).toBeLessThanOrEqual(a.suppliesStart);
    expect(a.suppliesOpened60).toBe(a.suppliesOpened);
    expect(a.meanLiveGenerators).toBeGreaterThan(0);
    expect(a.peakLiveGenerators).toBeGreaterThanOrEqual(a.meanLiveGenerators);
    expect(a.slotSurvival).toHaveLength(12);
    expect(a.slotKills).toHaveLength(12);
    expect(Math.min(...a.slotSurvival)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a.slotSurvival)).toBeLessThanOrEqual(1);
    expect(a.longestEmptySec).toBeLessThanOrEqual(a.playSeconds);
    expect(a.topKills).toBeGreaterThanOrEqual(a.medianKills);
    const legacy = runMetricsMatch({ ...spec, variant: VARIANTS.legacy! });
    expect(legacy.fighters).toBe(12);
    expect(JSON.stringify({ ...legacy, msPerTick: 0 })).not.toBe(JSON.stringify({ ...a, msPerTick: 0 }));
    const agg = aggregate([a, legacy]);
    expect(agg.matches).toBe(2);
    expect(agg.mean.eliminations).toBeCloseTo((a.eliminations + legacy.eliminations) / 2, 6);
  }, 60_000);

  it('the collector only reads: a measured and an unmeasured match end in the same state', () => {
    const make = (): GameState => {
      const s = rumble('survival', 3, 'rumbleOshodi', {}, true);
      return s;
    };
    const plain = make();
    const watched = make();
    const c = new MetricsCollector(watched);
    for (let i = 0; i < 300; i++) {
      run(plain, 1, { 0: { place: i === 0, move: i % 40 < 20 ? 'right' : 'left' } });
      const ev = run(watched, 1, { 0: { place: i === 0, move: i % 40 < 20 ? 'right' : 'left' } });
      c.onTick(watched, ev);
    }
    expect(JSON.stringify(watched.players)).toBe(JSON.stringify(plain.players));
    expect(watched.rngState).toEqual(plain.rngState);
  });

  it('config merging for variants nests objects and replaces numbers', () => {
    const merged = mergeConfigs(
      { generator: { maxRange: 10, baseCapacity: 1 } },
      { generator: { maxRange: 5 } },
    );
    expect(merged).toEqual({ generator: { maxRange: 5, baseCapacity: 1 } });
  });
});
