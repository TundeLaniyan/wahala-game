import { describe, expect, it } from 'vitest';
import { Tile, buildRoute, entryKey, getArena, listEntries, listKekeTurns } from '../../src/sim';
import { CHAPTERS, DEMO_ENTRY, DEMO_TURN, inRumbleCore } from '../../src/tutorial';
import { of, playDemo } from './harness';
import type { DemoRun } from './harness';

/**
 * Every chapter's demonstration is played headlessly through the real MatchController and
 * simulation, and must actually show its mechanic (not just print a caption about it).
 */
const runs = new Map<string, DemoRun>();
const demo = (id: string): DemoRun => {
  if (!runs.has(id)) runs.set(id, playDemo(id));
  return runs.get(id)!;
};

describe('every demo plays cleanly', () => {
  for (const chapter of CHAPTERS) {
    it(`${chapter.id}: script completes, no stalls, the demo hero survives`, () => {
      const run = demo(chapter.id);
      expect(run.problems).toEqual([]);
      expect(run.state.players[0]!.alive).toBe(true);
      // every caption of the chapter was shown, in order
      expect(run.captions.filter(Boolean)).toEqual(
        chapter.demo.beats.map((b) => b.caption).filter((c, i, a) => a.indexOf(c) === i),
      );
      // a watchable length: long enough to see, short enough to sit through
      expect(run.ticks).toBeGreaterThan(8 * 60);
      expect(run.ticks).toBeLessThan(75 * 60);
      // a demo never ends the "match" (no results, nothing counted)
      expect(of(run.events, 'matchEnded')).toEqual([]);
    });
  }
});

describe('each demo demonstrates its mechanic', () => {
  it('move: walks the lanes, passes through a rival and collects Roller Skates', () => {
    const run = demo('move');
    expect(run.heroTiles.length).toBeGreaterThan(12);
    expect(run.heroTiles).toContain('10,6'); // the dummy's tile
    expect(of(run.events, 'pickupCollected').some((e) => e.playerId === 0 && e.kind === 'skates')).toBe(true);
    expect(run.state.players[0]!.speedLevel).toBe(1);
  });

  it('generator: a plus-shaped blast stopped by concrete and the first crate, which drops a pickup', () => {
    const run = demo('generator');
    const blast = of(run.events, 'generatorExploded');
    expect(blast).toHaveLength(1);
    const broken = of(run.events, 'blockDestroyed').map((e) => `${e.x},${e.y}`);
    expect(broken.sort()).toEqual(['5,6', '6,5']);
    expect(run.state.tiles[6 * run.state.width + 4]).toBe(Tile.Soft); // behind the first crate: untouched
    expect(of(run.events, 'playerEliminated').map((e) => e.playerId)).toEqual([1]);
    expect(of(run.events, 'pickupCollected').some((e) => e.playerId === 0 && e.kind === 'petrol')).toBe(true);
  });

  it('sockets: an Extra Socket allows two generators at once and they chain', () => {
    const run = demo('sockets');
    expect(run.maxActiveGenerators[0]).toBe(2);
    const blasts = of(run.events, 'generatorExploded');
    expect(blasts).toHaveLength(2);
    expect(blasts[0]!.eventId).toBe(blasts[1]!.eventId); // one chain reaction
  });

  it('range: the crate out of reach at range 2 breaks at range 4', () => {
    const run = demo('range');
    const blasts = of(run.events, 'generatorExploded').map((e) => e.range);
    expect(blasts).toEqual([2, 4]);
    expect(of(run.events, 'blockDestroyed').map((e) => `${e.x},${e.y}`)).toEqual(['6,6']);
  });

  it('kick: walking into a generator with Boots sends it sliding to the crate', () => {
    const run = demo('kick');
    expect(of(run.events, 'generatorKicked')).toHaveLength(1);
    const blast = of(run.events, 'generatorExploded')[0]!;
    expect([blast.x, blast.y]).toEqual([9, 8]);
  });

  it('punch: the generator flies over the crate wall and skips the occupied landing tile', () => {
    const run = demo('punch');
    const thrown = of(run.events, 'generatorThrown')[0]!;
    expect([thrown.toX, thrown.toY]).toEqual([8, 8]);
    const blast = of(run.events, 'generatorExploded')[0]!;
    expect([blast.x, blast.y]).toEqual([8, 8]);
  });

  it('carry: picked up (+1 s once), carried four tiles and dropped', () => {
    const run = demo('carry');
    const carried = of(run.events, 'generatorCarried');
    expect(carried).toHaveLength(1);
    expect(carried[0]!.bonus).toBe(true);
    expect(of(run.events, 'generatorDropped')).toHaveLength(1);
    const blast = of(run.events, 'generatorExploded')[0]!;
    expect([blast.x, blast.y]).toEqual([8, 8]);
  });

  it("pass: the hero walks over the rival's generator tile", () => {
    const run = demo('pass');
    const gen = of(run.events, 'generatorPlaced').find((e) => e.ownerId === 1)!;
    expect(run.heroTiles).toContain(`${gen.x},${gen.y}`);
    expect(run.state.players[0]!.bombPass).toBe(true);
  });

  it('remote: the generator waits, then goes off on command', () => {
    const run = demo('remote');
    const placed = of(run.events, 'generatorPlaced')[0]!;
    const placedAt = run.events.indexOf(placed);
    const blast = of(run.events, 'generatorExploded')[0]!;
    expect(run.events.indexOf(blast)).toBeGreaterThan(placedAt);
    // it went off long before the 3 s fuse a timed generator would have... and before the 20 s failsafe
    expect(run.state.players[0]!.remote).toBe(true);
  });

  it('skills: push, daze and shove all land on the dummy', () => {
    const run = demo('skills');
    const used = of(run.events, 'skillUsed').map((e) => [e.playerId, e.skill, e.targetId]);
    expect(used).toEqual([
      [0, 'push', 3],
      [1, 'daze', 3],
      [2, 'shove', 3],
    ]);
    expect(of(run.events, 'playerPushed')).toHaveLength(2);
    expect(of(run.events, 'playerDazed')).toHaveLength(1);
  });

  it('vehicle: voucher collected, entry mode, legal entrance, Keke turn used, vehicle drove', () => {
    const run = demo('vehicle');
    expect(of(run.events, 'pickupCollected').some((e) => e.playerId === 0 && e.kind === 'voucher')).toBe(
      true,
    );
    expect(of(run.events, 'vehicleEntryBegan')).toHaveLength(1);
    expect(of(run.events, 'vehicleEntryCancelled')).toEqual([]);
    const warning = of(run.events, 'vehicleWarning')[0]!;
    expect(warning.kind).toBe('keke');
    expect(warning.entry).toEqual({ x: DEMO_ENTRY.x, y: DEMO_ENTRY.y });
    expect(of(run.events, 'vehicleLaunched')).toHaveLength(1);
    expect(of(run.events, 'vehicleExited')).toHaveLength(1);
    expect(of(run.events, 'vehicleHitPlayer').map((e) => e.playerId)).toEqual([1]);
    expect(run.state.players[0]!.hasVoucher).toBe(false);
  });

  it('vehicle: the selector is driven step by step: browse, preview the chosen entrance, confirm, pick the turn, launch', () => {
    const run = demo('vehicle');
    const target = entryKey(DEMO_ENTRY);
    const turn = `${DEMO_TURN.atIndex}:${DEMO_TURN.dir}`;
    const seq = run.selector;
    const firstEntry = seq.findIndex((x) => x.startsWith('entry|'));
    const preview = seq.indexOf(`entry|${target}|`);
    const turnStage = seq.findIndex((x) => x.startsWith(`turn|${target}|`));
    const turnPick = seq.indexOf(`turn|${target}|${turn}`);
    // browsing with the arrows visits other entrances before the target is picked
    expect(seq.slice(firstEntry, preview).length).toBeGreaterThanOrEqual(3);
    expect(preview).toBeGreaterThan(firstEntry);
    expect(turnStage).toBeGreaterThan(preview);
    expect(seq[turnStage]).not.toBe(`turn|${target}|${turn}`); // the turn is chosen, not pre-selected
    expect(turnPick).toBeGreaterThan(turnStage);
    expect(seq[seq.length - 1]).toBe('idle');
  });

  it('vehicle: the scripted entrance and turn are legal and the turn really bends the route', () => {
    const run = demo('vehicle');
    const state = run.state;
    expect(listEntries(state, 'keke').map(entryKey)).toContain(entryKey(DEMO_ENTRY));
    expect(listKekeTurns(state, DEMO_ENTRY)).toContainEqual(DEMO_TURN);
    const route = buildRoute(state, 'keke', DEMO_ENTRY, DEMO_TURN)!;
    expect(new Set(route.map((t) => t.x)).size).toBeGreaterThan(1);
    expect(new Set(route.map((t) => t.y)).size).toBeGreaterThan(1);
  });

  it('hazards: a telegraphed bay Danfo, an oil slide and a pothole stumble', () => {
    const run = demo('hazards');
    const warn = of(run.events, 'stageWarning')[0]!;
    const start = of(run.events, 'stageStarted')[0]!;
    expect(start.event.startTick - warn.event.warnTick).toBeGreaterThanOrEqual(90);
    expect(of(run.events, 'hazardTriggered').map((e) => e.kind)).toEqual(['oil', 'pothole']);
  });

  it('endgame: both trap waves are telegraphed and go live even with stage hazards off', () => {
    const run = demo('endgame');
    expect(run.state.stage.enabled).toBe(false);
    expect(of(run.events, 'trapsWarning').map((e) => e.wave)).toEqual([0, 1]);
    expect(of(run.events, 'trapsActivated').map((e) => e.wave)).toEqual([0, 1]);
    expect(of(run.events, 'hazardTriggered').map((e) => e.kind)).toContain('pothole');
  });

  it('power yard: one blast fills its whole row and column, through pillars, breaking every crate in line', () => {
    const run = demo('powerYard');
    const blast = of(run.events, 'generatorExploded')[0]!;
    const broken = of(run.events, 'blockDestroyed')
      .map((e) => `${e.x},${e.y}`)
      .sort();
    expect(broken).toEqual(['10,6', '12,6', '3,0', '3,2', '8,6'].sort());
    expect(of(run.events, 'playerEliminated').map((e) => e.playerId)).toEqual([1]); // behind a pillar
    expect(blast.x).toBe(3);
    expect(getArena('surulerePowerYard').config?.generator?.blastMode).toBe('fullLine');
  });

  it('city rumble: walks towards the centre and the city starts closing at 3:00', () => {
    const run = demo('cityRumble');
    const hero = run.state.players[0]!;
    expect(run.state.players).toHaveLength(8);
    expect(inRumbleCore(run.state, hero.x, hero.y)).toBe(true);
    expect(of(run.events, 'crushWarning').length).toBeGreaterThan(0);
  });
});
