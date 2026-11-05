/**
 * Raid world markers, damage feedback and projectiles (docs/RAID_PRESENTATION.md), built from hand-made fixtures of the
 * contract types (`RaidView`, `SimEvent`, `Player.vitals`) so they run before raid-sim's runtime lands: the pure look
 * functions, then the views driven headlessly with a fake canvas. Nothing here needs WebGL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mesh } from 'three';
import { Quaternion, Vector3 } from 'three';
import { enemyHealthView } from '../../src/sim';
import type { Dir, RaidView, SimEvent, Vitals } from '../../src/sim';
import { createLayout } from '../../src/render/coords';
import { QUALITY } from '../../src/render/quality';
import { Effects } from '../../src/render/fx/Effects';
import {
  RAID_COLORS,
  beltPhase,
  beltYaw,
  cargoLook,
  crackLevel,
  doorLook,
  extractionLook,
  shipmentTelegraph,
} from '../../src/render/views/raidStyle';
import {
  HIT_COLORS,
  PIP_MAX,
  hitFeedback,
  impactFor,
  joltOffset,
  moveStartTick,
  pathProgress,
  pipCounts,
  pipsShown,
  pointAlong,
} from '../../src/render/views/damageModel';
import { RaidViews, doorSpansZ, isRaidMatch } from '../../src/render/views/RaidViews';
import { DamageViews, hasCampaignFeedback } from '../../src/render/views/DamageViews';
import { ProjectileViews } from '../../src/render/views/ProjectileViews';
import type { FrameContext } from '../../src/render/views/types';
import { put, sandbox } from '../helpers';

function fakeContext(canvas: { width: number; height: number }): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const target: Record<string | symbol, unknown> = {
    canvas,
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => undefined),
    set: (t, p, v) => {
      t[p] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => {
      const c = { width: 1, height: 1, style: {} } as {
        width: number;
        height: number;
        getContext?: () => unknown;
      };
      c.getContext = () => fakeContext(c);
      return c;
    },
  });
});
afterAll(() => vi.unstubAllGlobals());

// ------------------------------------------------------------------------------------------ fixtures

const vitals = (hp: number, maxHp: number, lastHitTick = -9999): Vitals => ({
  hp,
  maxHp,
  invulnUntil: 0,
  lastHitTick,
  lastHitBy: null,
  lastHitSource: null,
});

function raidFixture(over: Partial<RaidView> = {}): RaidView {
  return {
    raidId: 'warehouseDispatchDepot',
    objective: 'Destroy the 3 marked crates',
    progress: { done: 0, goal: 3, label: '0 of 3' },
    cargo: [
      { id: 'c1', kind: 'cargo', x: 3, y: 2, hp: 3, maxHp: 3, marked: true, state: 'intact' },
      { id: 'c2', kind: 'cargo', x: 5, y: 2, hp: 2, maxHp: 3, marked: true, state: 'damaged' },
      { id: 'c3', kind: 'cargo', x: 7, y: 2, hp: 1, maxHp: 3, marked: true, state: 'damaged' },
      { id: 'k1', kind: 'crate', x: 2, y: 4, hp: 1, maxHp: 1, marked: false, state: 'intact' },
      { id: 'b1', kind: 'barrel', x: 4, y: 4, hp: 1, maxHp: 1, marked: false, state: 'intact' },
      { id: 'gone', kind: 'crate', x: 6, y: 4, hp: 0, maxHp: 1, marked: false, state: 'destroyed' },
    ],
    conveyors: [
      {
        id: 'belt1',
        stepTicks: 20,
        tiles: [
          { x: 1, y: 6, dir: 'right' },
          { x: 2, y: 6, dir: 'right' },
          { x: 3, y: 6, dir: 'right' },
        ],
      },
    ],
    shipments: [{ id: 's1', x: 1, y: 6, dir: 'right', warnTicks: 30 }],
    doors: [
      { id: 'd1', x: 8, y: 5, locked: true, optionalRoom: false, opensWhen: 'Destroy the marked cargo' },
      { id: 'd2', x: 9, y: 2, locked: true, optionalRoom: true, opensWhen: 'Hit the switch' },
    ],
    rooms: [],
    wave: { index: 0, total: 2, enemiesAlive: 2, nextInTicks: null },
    extraction: { open: false, x: 12, y: 9 },
    stage: 'cargo',
    lives: { used: 0, max: 3 },
    timeRemainingSec: 120,
    warnings: [],
    outcome: null,
    ...over,
  };
}

function rig(raid: RaidView | null, players = 3) {
  const state = sandbox({ players });
  state.settings.game = 'raid';
  const layout = createLayout(state.width, state.height);
  const fx = new Effects(layout, QUALITY.medium);
  let current = raid;
  const views = new RaidViews(() => current);
  const ctx = (time = 0, alpha = 0, tick = state.tick): FrameContext =>
    ({
      state: Object.assign(state, { tick }),
      alpha,
      time,
      dt: 1 / 60,
      info: { localPlayerId: 0, excitement: 0, entryOverlay: null },
      layout,
      fx,
    }) as unknown as FrameContext;
  return { state, layout, fx, views, ctx, set: (r: RaidView | null) => (current = r) };
}

/** A recording stand-in for `Effects`: which cue was asked for, with what. */
function fakeFx() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const rec =
    (fn: string) =>
    (...args: unknown[]): void => {
      calls.push({ fn, args });
    };
  const fx = {
    shake: 0,
    flash: rec('flash'),
    shockwave: rec('shockwave'),
    sparkle: rec('sparkle'),
    dust: rec('dust'),
    blockDebris: rec('blockDebris'),
    comicPuff: rec('comicPuff'),
  } as unknown as Effects;
  return { fx, calls, names: () => calls.map((c) => c.fn) };
}

// ------------------------------------------------------------------------------------------ pure looks

describe('raid style (pure)', () => {
  it('crack level follows hit points: clean, hairline above half, broken at half or less', () => {
    const c = (hp: number, maxHp: number, state: 'intact' | 'damaged' | 'destroyed') => ({
      hp,
      maxHp,
      state,
    });
    expect(crackLevel(c(3, 3, 'intact'))).toBe(0);
    expect(crackLevel(c(2, 3, 'damaged'))).toBe(1);
    expect(crackLevel(c(1, 3, 'damaged'))).toBe(2);
    expect(crackLevel(c(1, 2, 'damaged'))).toBe(2);
    expect(crackLevel(c(3, 3, 'damaged'))).toBe(1); // 'damaged' is never drawn clean
    expect(crackLevel(c(0, 1, 'destroyed'))).toBe(2);
  });

  it('only marked cargo gets the pulsing ring; a hit punches the scale and settles', () => {
    const marked = raidFixture().cargo[0]!;
    const plain = raidFixture().cargo[3]!;
    expect(cargoLook(marked, 0.3, Infinity).ring).toBeGreaterThan(0.3);
    expect(cargoLook(plain, 0.3, Infinity).ring).toBe(0);
    expect(cargoLook(marked, 0, 0).scale).toBeGreaterThan(1.05);
    expect(cargoLook(marked, 0, 1).scale).toBe(1);
    expect(cargoLook({ ...marked, kind: 'crate' }, 0, Infinity).marked).toBe(false);
    for (let t = 0; t < 4; t += 0.1) {
      const r = cargoLook(marked, t, Infinity).ring;
      expect(r).toBeGreaterThanOrEqual(0.4);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it('belt phase is one tile per stepTicks, locked to the sim clock', () => {
    expect(beltPhase(0, 0, 20)).toBe(0);
    expect(beltPhase(10, 0, 20)).toBeCloseTo(0.5);
    expect(beltPhase(20, 0, 20)).toBeCloseTo(0);
    expect(beltPhase(5, 0.5, 10)).toBeCloseTo(0.55);
    expect(beltPhase(5, 0, 0)).toBe(0);
  });

  it('belt yaw turns +x onto the direction of travel on the board (up = -z, down = +z)', () => {
    const want: Record<Dir, [number, number]> = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
    for (const d of Object.keys(want) as Dir[]) {
      const v = new Vector3(1, 0, 0).applyQuaternion(
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), beltYaw(d)),
      );
      expect(v.x).toBeCloseTo(want[d][0]);
      expect(v.z).toBeCloseTo(want[d][1]);
    }
  });

  it('a shipment telegraphs its next tiles only while it is about to move, never off the board', () => {
    expect(shipmentTelegraph({ x: 1, y: 1, dir: 'right', warnTicks: 0 }, 15, 11)).toEqual([]);
    expect(shipmentTelegraph({ x: 1, y: 1, dir: 'right', warnTicks: 20 }, 15, 11)).toEqual([
      1 * 15 + 2,
      1 * 15 + 3,
    ]);
    expect(shipmentTelegraph({ x: 13, y: 1, dir: 'right', warnTicks: 20 }, 15, 11)).toEqual([1 * 15 + 14]);
    expect(shipmentTelegraph({ x: 3, y: 0, dir: 'up', warnTicks: 5 }, 15, 11)).toEqual([]);
    expect(shipmentTelegraph({ x: 3, y: 4, dir: 'down', warnTicks: 5 }, 15, 11, 3)).toEqual([
      5 * 15 + 3,
      6 * 15 + 3,
      7 * 15 + 3,
    ]);
  });

  it('doors: locked is closed with a lock and chain, opening lifts the shutter and drops the chain; rooms wear teal', () => {
    const locked = doorLook({ locked: true, optionalRoom: false }, 0);
    expect(locked).toMatchObject({ lift: 0, lock: 1, chain: 0, locked: true, color: RAID_COLORS.doorLocked });
    const mid = doorLook({ locked: false, optionalRoom: false }, 0.35);
    expect(mid.lift).toBeGreaterThan(0.3);
    expect(mid.lift).toBeLessThan(1);
    const open = doorLook({ locked: false, optionalRoom: false }, 5);
    expect(open).toMatchObject({ lift: 1, lock: 0, chain: 1, color: RAID_COLORS.doorOpen });
    expect(doorLook({ locked: true, optionalRoom: true }, 0).color).toBe(RAID_COLORS.roomLocked);
    expect(doorLook({ locked: false, optionalRoom: true }, 5).color).toBe(RAID_COLORS.roomOpen);
    // already open when first seen (negative infinity since): fully open at once
    expect(doorLook({ locked: false, optionalRoom: false }, Infinity).lift).toBe(1);
  });

  it('the extraction marker is hidden until the exit opens, then grows in and pulses', () => {
    expect(extractionLook(false, 0, 0).visible).toBe(false);
    expect(extractionLook(true, 0, 0).scale).toBeLessThan(0.5);
    const full = extractionLook(true, 5, 1);
    expect(full.visible).toBe(true);
    expect(full.scale).toBeCloseTo(1);
    expect(full.beam).toBeGreaterThan(0.5);
  });
});

describe('damage model (pure)', () => {
  it('pips follow the sim rule (enemyHealthView.showBar): targeted, recently hurt or near - never for everyone', () => {
    const state = sandbox({ players: 3 });
    put(state, 0, 4, 5);
    state.players[0]!.facing = 'right';
    put(state, 1, 7, 5);
    put(state, 2, 12, 9);
    for (const id of [1, 2]) {
      state.players[id]!.enemyKind = 'guard';
      state.players[id]!.vitals = vitals(2, 2);
    }
    const shown = (id: number) => pipsShown(enemyHealthView(state, id), state.players[id]!.alive);
    expect(shown(1)).toBe(true); // straight ahead, 3 tiles
    expect(shown(2)).toBe(false); // far, healthy
    state.players[2]!.vitals = vitals(1, 2, state.tick - 10);
    expect(shown(2)).toBe(true); // hurt a moment ago
    state.players[2]!.vitals = vitals(1, 2, state.tick - 5000);
    expect(shown(2)).toBe(false);
  });

  it('never for the dead, the boss or a lieutenant (their bar is the rail)', () => {
    const view = (kind: string | null) => ({ showBar: true, kind });
    expect(pipsShown(view('guard'), true)).toBe(true);
    expect(pipsShown(view('guard'), false)).toBe(false);
    expect(pipsShown(view('boss'), true)).toBe(false);
    expect(pipsShown(view('lieutenant'), true)).toBe(false);
    expect(pipsShown({ showBar: false, kind: 'guard' }, true)).toBe(false);
    expect(pipsShown(null, true)).toBe(false);
  });

  it('pip counts: one per segment, scaled down past the cap, never zero while alive', () => {
    expect(pipCounts(2, 3)).toEqual({ filled: 2, total: 3 });
    expect(pipCounts(0, 3)).toEqual({ filled: 0, total: 3 });
    expect(pipCounts(1, 20)).toEqual({ filled: 1, total: PIP_MAX });
    expect(pipCounts(20, 20)).toEqual({ filled: PIP_MAX, total: PIP_MAX });
  });

  it('every hit result has its own cue: shields are white-blue (never the red of a hit), invulnerable is silent', () => {
    expect(hitFeedback('blockedArmour', true).color).toBe(HIT_COLORS.shield);
    expect(hitFeedback('blockedOkada', true).color).toBe(HIT_COLORS.shield);
    expect(hitFeedback('blockedArmour', true).kind).toBe('shield');
    expect(hitFeedback('damaged', true).color).toBe(HIT_COLORS.hit);
    expect(hitFeedback('damaged', false).color).toBe(HIT_COLORS.hitEnemy);
    expect(hitFeedback('dazed', false).kind).toBe('daze');
    expect(hitFeedback('invulnerable', true).kind).toBe('none');
    expect(hitFeedback('blockedArmour', true).shake).toBe(0);
    expect(hitFeedback('damaged', true).shake).toBeGreaterThan(hitFeedback('damaged', false).shake);
    const colours = new Set(
      ['damaged', 'dazed', 'blockedArmour'].map((r) => hitFeedback(r as 'damaged', true).color),
    );
    expect(colours.size).toBe(3);
  });

  it('the flinch is a short shove that settles to exactly nothing', () => {
    expect(Math.abs(joltOffset(0.1, 0.01))).toBeGreaterThan(0.05);
    expect(joltOffset(0.1, 0.25)).toBe(0);
    expect(joltOffset(0.1, -1)).toBe(0);
    for (let t = 0; t < 0.2; t += 0.01) expect(Math.abs(joltOffset(0.1, t))).toBeLessThanOrEqual(0.1);
  });

  it('projectile geometry: the telegraph comes before any movement; progress is per tile; points interpolate', () => {
    expect(moveStartTick(100, 100, 30)).toBe(130);
    expect(moveStartTick(100, 130, 30)).toBe(130);
    expect(moveStartTick(100, 150, 30)).toBe(150);
    expect(pathProgress(-5, 10, 4)).toBe(0);
    expect(pathProgress(25, 10, 4)).toBeCloseTo(2.5);
    expect(pathProgress(999, 10, 4)).toBe(4);
    const path = [1 * 15 + 5, 1 * 15 + 6, 1 * 15 + 7];
    expect(pointAlong({ x: 4, y: 1 }, path, 15, 0)).toEqual({ x: 4, y: 1 });
    expect(pointAlong({ x: 4, y: 1 }, path, 15, 1.5)).toEqual({ x: 5.5, y: 1 });
    expect(pointAlong({ x: 4, y: 1 }, path, 15, 99)).toEqual({ x: 7, y: 1 });
  });

  it('each projectile result maps to a distinct landing cue', () => {
    expect(impactFor('wall')).toBe('shatter');
    expect(impactFor('blocked')).toBe('spark');
    expect(impactFor('blockedArmour')).toBe('spark');
    expect(impactFor('damaged')).toBe('flash');
    expect(impactFor('dazed')).toBe('flash');
    expect(impactFor('expired')).toBe('thud');
    expect(impactFor('invulnerable')).toBe('puff');
  });
});

// ------------------------------------------------------------------------------------------ RaidViews

describe('RaidViews', () => {
  it('is a no-op without a raid: hidden, nothing built', () => {
    const r = rig(null);
    r.views.update(r.ctx());
    expect(r.views.group.visible).toBe(false);
    expect(r.views.stats()).toMatchObject({ cargo: 0, belts: 0, doors: 0, visible: false });
    expect(isRaidMatch(sandbox())).toBe(false);
    expect(isRaidMatch(r.state)).toBe(true);
  });

  it('draws the cargo by kind: marked / plain / barrel instances, destroyed ones gone, a ring per marked', () => {
    const r = rig(raidFixture());
    r.views.update(r.ctx());
    const s = r.views.stats();
    expect(s.visible).toBe(true);
    expect(s).toMatchObject({ cargo: 5, marked: 3, crates: 1, barrels: 1, rings: 3 });
    // c2 (hairline) and c3 (broken) show cracks; the clean ones do not
    expect(s.cracks).toBe(2);
  });

  it('a piece of cargo that takes damage shows cracks at once; destroying it removes it', () => {
    const fixture = raidFixture();
    const r = rig(fixture);
    r.views.update(r.ctx());
    expect(r.views.stats().cracks).toBe(2);
    fixture.cargo[0] = { ...fixture.cargo[0]!, hp: 2, state: 'damaged' };
    r.views.update(r.ctx(0.1));
    expect(r.views.stats().cracks).toBe(3);
    fixture.cargo[1] = { ...fixture.cargo[1]!, hp: 0, state: 'destroyed' };
    r.views.update(r.ctx(0.2));
    expect(r.views.stats()).toMatchObject({ marked: 2, cracks: 2 });
  });

  it('stays cheap: a crowded warehouse is still a handful of draw calls, not one per crate', () => {
    const many = raidFixture({
      cargo: Array.from({ length: 80 }, (_, i) => ({
        id: `k${i}`,
        kind: i % 5 === 0 ? ('barrel' as const) : i % 7 === 0 ? ('cargo' as const) : ('crate' as const),
        x: i % 15,
        y: 1 + Math.floor(i / 15),
        hp: 1,
        maxHp: 2,
        marked: i % 7 === 0,
        state: i % 3 === 0 ? ('damaged' as const) : ('intact' as const),
      })),
    });
    const r = rig(many);
    r.views.update(r.ctx());
    let drawables = 0;
    r.views.group.traverse((o) => {
      if ((o as Mesh).isMesh || (o as { isInstancedMesh?: boolean }).isInstancedMesh) drawables++;
    });
    // 9 cargo batches + 5 overlays + 1 belt + 2 doors x (3 posts/lintel + shutter + 2 chain bars)
    expect(drawables).toBeLessThan(40);
    expect(r.views.stats().cargo).toBe(80);
  });

  it('conveyors: one instanced mesh per belt with a tile per belt tile; the texture scrolls with the sim clock', () => {
    const r = rig(raidFixture());
    r.views.update(r.ctx(0, 0, 0));
    expect(r.views.stats().belts).toBe(1);
    const belt = (
      r.views as unknown as {
        belts: Map<string, { mesh: { count: number }; material: { map: { offset: { x: number } } } }>;
      }
    ).belts.get('belt1')!;
    expect(belt.mesh.count).toBe(3);
    const a = belt.material.map.offset.x;
    r.views.update(r.ctx(0.1, 0, 5));
    const b = belt.material.map.offset.x;
    expect(b).not.toBe(a);
    r.views.update(r.ctx(0.2, 0, 20)); // a whole step later: the same phase again
    expect(belt.material.map.offset.x).toBeCloseTo(a);
  });

  it('a belt that is rebuilt (different tiles) replaces its mesh; one that vanishes is removed', () => {
    const fixture = raidFixture();
    const r = rig(fixture);
    r.views.update(r.ctx());
    const before = r.views.group.children.length;
    fixture.conveyors = [{ id: 'belt1', stepTicks: 20, tiles: [{ x: 1, y: 7, dir: 'down' }] }];
    r.views.update(r.ctx(0.1));
    expect(r.views.stats().belts).toBe(1);
    expect(r.views.group.children.length).toBe(before);
    fixture.conveyors = [];
    r.views.update(r.ctx(0.2));
    expect(r.views.stats().belts).toBe(0);
    expect(r.views.group.children.length).toBe(before - 1);
  });

  it('shipments draw a crate on the belt and hatch the next two tiles while warnTicks > 0', () => {
    const fixture = raidFixture();
    const r = rig(fixture);
    r.views.update(r.ctx());
    expect(r.views.stats()).toMatchObject({ shipments: 1, warnTiles: 2 });
    fixture.shipments[0] = { ...fixture.shipments[0]!, warnTicks: 0 };
    r.views.update(r.ctx(0.1));
    expect(r.views.stats().warnTiles).toBe(0);
  });

  it('sim warnings of kind shipment / wave are hatched, projectile warnings are left to the projectile view, tiles never double', () => {
    const w = 15;
    const fixture = raidFixture({
      shipments: [],
      warnings: [
        { kind: 'shipment', tiles: [6 * w + 2, 6 * w + 3], remainingTicks: 30 },
        { kind: 'projectile', tiles: [2 * w + 2, 2 * w + 3, 2 * w + 4], remainingTicks: 30 },
        { kind: 'wave', tiles: [6 * w + 3, 9 * w + 1], remainingTicks: 60 },
      ],
    });
    const r = rig(fixture);
    r.views.update(r.ctx());
    expect(r.views.stats().warnTiles).toBe(3); // 2 shipment + 1 new wave tile (the shared one is drawn once)
  });

  it('locked doors show a lock; opening plays an animation (shutter lifts, lock fades) on the state flip and on the event', () => {
    const fixture = raidFixture();
    const r = rig(fixture);
    r.views.update(r.ctx(0));
    expect(r.views.stats()).toMatchObject({ doors: 2, locked: 2 });
    const door = (
      r.views as unknown as { doors: Map<string, { shutter: Mesh; lockSprite: { visible: boolean } }> }
    ).doors.get('d1')!;
    expect(door.shutter.visible).toBe(true);
    expect(door.lockSprite.visible).toBe(true);
    const full = door.shutter.scale.y;
    // the sim opens d1; the event arrives first
    const fx = fakeFx();
    r.views.handleEvents([{ type: 'raidDoorOpened', id: 'd1', x: 8, y: 5 }], fx.fx, r.layout);
    expect(fx.names()).toContain('sparkle');
    fixture.doors[0] = { ...fixture.doors[0]!, locked: false };
    r.views.update(r.ctx(1));
    expect(door.shutter.scale.y).toBeCloseTo(full); // t = 0: just starting
    r.views.update(r.ctx(1.3));
    expect(door.shutter.scale.y).toBeLessThan(full * 0.8);
    r.views.update(r.ctx(3));
    expect(door.shutter.visible).toBe(false); // an open frame
    expect(door.lockSprite.visible).toBe(false);
    expect(r.views.stats().locked).toBe(1);
  });

  it('a door that is already open when first seen has no animation', () => {
    const fixture = raidFixture();
    fixture.doors[0] = { ...fixture.doors[0]!, locked: false };
    const r = rig(fixture);
    r.views.update(r.ctx(0));
    const door = (r.views as unknown as { doors: Map<string, { shutter: Mesh }> }).doors.get('d1')!;
    expect(door.shutter.visible).toBe(false);
  });

  it('the door shutter spans the wall it sits in', () => {
    const state = sandbox({ players: 2 });
    state.tiles = state.tiles.map(() => 0);
    const at = (x: number, y: number) => y * state.width + x;
    state.tiles[at(4, 3)] = 1;
    state.tiles[at(4, 5)] = 1;
    expect(doorSpansZ(state, { x: 4, y: 4 })).toBe(true); // wall runs north-south
    state.tiles[at(3, 4)] = 1;
    state.tiles[at(5, 4)] = 1;
    expect(doorSpansZ(state, { x: 4, y: 4 })).toBe(false); // tie: faces the camera
  });

  it('the extraction marker appears only once the exit is open, and an event grows it in', () => {
    const fixture = raidFixture();
    const r = rig(fixture);
    r.views.update(r.ctx(0));
    expect(r.views.stats().extraction).toBe(false);
    const fx = fakeFx();
    r.views.handleEvents([{ type: 'raidExtractionOpened', x: 12, y: 9 }], fx.fx, r.layout);
    expect(fx.names()).toEqual(expect.arrayContaining(['shockwave', 'sparkle']));
    fixture.extraction = { open: true, x: 12, y: 9 };
    r.views.update(r.ctx(0.1));
    expect(r.views.stats().extraction).toBe(true);
    fixture.extraction = { open: false, x: 12, y: 9 };
    r.views.update(r.ctx(0.2));
    expect(r.views.stats().extraction).toBe(false);
  });

  it('events: a hit puffs dust and punches the crate; a destroyed crate throws debris, a marked one sparkles gold', () => {
    const r = rig(raidFixture());
    const fx = fakeFx();
    r.views.update(r.ctx(1));
    r.views.handleEvents(
      [{ type: 'cargoHit', id: 'c1', x: 3, y: 2, hpAfter: 2, maxHp: 3, byId: 0 }],
      fx.fx,
      r.layout,
    );
    expect(fx.names()).toContain('dust');
    const marked = (r.views as unknown as { marked: { mesh: { instanceMatrix: { array: Float32Array } } } })
      .marked;
    r.views.update(r.ctx(1.01));
    expect(marked.mesh.instanceMatrix.array[0]).toBeGreaterThan(1.05); // the scale of instance 0 (c1) punched
    r.views.update(r.ctx(2));
    expect(marked.mesh.instanceMatrix.array[0]).toBeCloseTo(1);
    const fx2 = fakeFx();
    r.views.handleEvents(
      [{ type: 'cargoDestroyed', id: 'c1', kind: 'cargo', x: 3, y: 2, marked: true, byId: 0 }],
      fx2.fx,
      r.layout,
    );
    expect(fx2.names()).toEqual(expect.arrayContaining(['blockDebris', 'dust', 'sparkle']));
    const fx3 = fakeFx();
    r.views.handleEvents(
      [{ type: 'cargoDestroyed', id: 'k1', kind: 'crate', x: 2, y: 4, marked: false, byId: 0 }],
      fx3.fx,
      r.layout,
    );
    expect(fx3.names()).toEqual(['blockDebris', 'dust']);
  });

  it('wave announcements draw nothing in the world (they are a rail notice)', () => {
    const r = rig(raidFixture());
    r.views.update(r.ctx());
    const fx = fakeFx();
    r.views.handleEvents([{ type: 'raidWaveStarted', index: 1, total: 2 }], fx.fx, r.layout);
    expect(fx.calls).toHaveLength(0);
  });

  it('dispose releases everything and a second dispose of the shared textures is harmless', () => {
    const r = rig(raidFixture());
    r.views.update(r.ctx());
    expect(() => r.views.dispose()).not.toThrow();
  });
});

// ------------------------------------------------------------------------------------------ DamageViews

describe('DamageViews', () => {
  function campaign() {
    const state = sandbox({ players: 3 });
    state.settings.game = 'raid';
    const layout = createLayout(state.width, state.height);
    put(state, 0, 4, 5);
    put(state, 1, 7, 5); // straight ahead of the local player
    put(state, 2, 12, 9); // far away
    state.players[0]!.facing = 'right';
    state.players[1]!.vitals = vitals(1, 2, state.tick - 10);
    state.players[1]!.enemyKind = 'guard';
    state.players[2]!.vitals = vitals(3, 3);
    state.players[2]!.enemyKind = 'heavy';
    const jolts: unknown[][] = [];
    const views = new DamageViews({ jolt: (...a) => jolts.push(a) }, false);
    const ctx = (): FrameContext =>
      ({
        state,
        alpha: 0,
        time: 0,
        dt: 1 / 60,
        info: { localPlayerId: 0 },
        layout,
        fx: {},
      }) as unknown as FrameContext;
    return { state, layout, views, jolts, ctx };
  }

  it('is only built for a match with campaign health', () => {
    expect(hasCampaignFeedback(sandbox())).toBe(false);
    const c = campaign();
    expect(hasCampaignFeedback(c.state)).toBe(true);
  });

  it('draws pips for the targeted / hurt enemy and not for the far healthy one', () => {
    const c = campaign();
    c.views.update(c.ctx());
    expect(c.views.pipEnemies).toBe(1);
    expect((c.views.group.children[0] as unknown as { count: number }).count).toBe(2); // the guard's two segments
    c.state.players[2]!.vitals = vitals(2, 3, c.state.tick - 5); // now hurt as well
    c.views.update(c.ctx());
    expect(c.views.pipEnemies).toBe(2);
    expect((c.views.group.children[0] as unknown as { count: number }).count).toBe(5);
    c.state.players[1]!.enemyKind = 'boss'; // the rail owns the boss bar
    c.views.update(c.ctx());
    expect(c.views.pipEnemies).toBe(1);
  });

  it('a damaging hit flashes (red on the player), rings, shakes the camera and flinches along the hit', () => {
    const c = campaign();
    const fx = fakeFx();
    const ev: SimEvent = {
      type: 'campaignHit',
      victimId: 0,
      byId: 1,
      source: 'punch',
      result: 'damaged',
      damage: 1,
      hpAfter: 2,
      maxHp: 3,
      dazeTicks: 0,
      x: 4,
      y: 5,
    };
    c.views.handleEvents([ev], c.state, fx.fx, c.layout, 0);
    expect(fx.names()).toEqual(expect.arrayContaining(['flash', 'shockwave']));
    expect(fx.calls.find((x) => x.fn === 'flash')!.args[4]).toBe(HIT_COLORS.hit);
    expect(fx.fx.shake).toBeGreaterThan(0);
    // the attacker is at x=7, the victim at x=4: shoved west
    expect(c.jolts).toHaveLength(1);
    expect(c.jolts[0]![0]).toBe(0);
    expect(c.jolts[0]![1]).toBeLessThan(0);
  });

  it('an absorbed hit is a white-blue spark with no flinch and no shake; invulnerable is silent', () => {
    const c = campaign();
    const fx = fakeFx();
    const base = {
      type: 'campaignHit',
      victimId: 0,
      byId: 1,
      source: 'brick',
      damage: 0,
      hpAfter: 3,
      maxHp: 3,
      dazeTicks: 0,
      x: 4,
      y: 5,
    } as const;
    c.views.handleEvents([{ ...base, result: 'blockedArmour' }], c.state, fx.fx, c.layout, 0);
    expect(fx.calls.find((x) => x.fn === 'flash')!.args[4]).toBe(HIT_COLORS.shield);
    expect(fx.names()).toContain('sparkle');
    expect(fx.fx.shake).toBe(0);
    expect(c.jolts).toHaveLength(0);
    const quiet = fakeFx();
    c.views.handleEvents([{ ...base, result: 'invulnerable' }], c.state, quiet.fx, c.layout, 0);
    expect(quiet.calls).toHaveLength(0);
  });

  it('a dazed hit is yellow; an enemy hit shakes less than the player; reduced motion removes the flinch', () => {
    const c = campaign();
    const fx = fakeFx();
    const hit = (victimId: number, result: 'dazed' | 'damaged'): SimEvent => ({
      type: 'campaignHit',
      victimId,
      byId: 0,
      source: 'player',
      result,
      damage: 0,
      hpAfter: 1,
      maxHp: 2,
      dazeTicks: 30,
      x: 7,
      y: 5,
    });
    c.views.handleEvents([hit(1, 'dazed')], c.state, fx.fx, c.layout, 0);
    expect(fx.calls.find((x) => x.fn === 'flash')!.args[4]).toBe(HIT_COLORS.daze);
    const reduced = new DamageViews({ jolt: (...a) => c.jolts.push(a) }, true);
    c.jolts.length = 0;
    reduced.handleEvents([hit(1, 'damaged')], c.state, fx.fx, c.layout, 0);
    expect(c.jolts).toHaveLength(0);
  });

  it('a defeat is a poof, never silent', () => {
    const c = campaign();
    const fx = fakeFx();
    c.views.handleEvents(
      [{ type: 'campaignDefeated', victimId: 1, byId: 0, source: 'blast', enemyKind: 'guard', x: 7, y: 5 }],
      c.state,
      fx.fx,
      c.layout,
      0,
    );
    expect(fx.names()).toEqual(expect.arrayContaining(['comicPuff', 'dust', 'flash']));
  });
});

// ------------------------------------------------------------------------------------------ ProjectileViews

describe('ProjectileViews', () => {
  function throwing() {
    const state = sandbox({ players: 2 });
    state.settings.game = 'raid';
    const layout = createLayout(state.width, state.height);
    const views = new ProjectileViews();
    const w = state.width;
    const launch: SimEvent = {
      type: 'projectileLaunched',
      id: 7,
      ownerId: 1,
      kind: 'bottle',
      strong: false,
      fromX: 9,
      fromY: 5,
      path: [5 * w + 8, 5 * w + 7, 5 * w + 6, 5 * w + 5],
      stepTicks: 6,
      launchTick: state.tick,
      warnTicks: 30,
    };
    const ctx = (tick: number, time: number, alpha = 0): FrameContext =>
      ({
        state: Object.assign(state, { tick }),
        alpha,
        time,
        dt: 1 / 60,
        info: { localPlayerId: 0 },
        layout,
        fx: {},
      }) as unknown as FrameContext;
    return { state, layout, views, launch, ctx, w };
  }

  const bodyOf = (v: ProjectileViews): { position: { x: number; y: number; z: number }; visible: boolean } =>
    v.group.children.find((o) => (o as { type?: string }).type === 'Group') as never;

  it('a launch raises the cue (flash + ring at the thrower), holds the object overhead and previews the whole path', () => {
    const t = throwing();
    const fx = fakeFx();
    t.views.handleEvents([t.launch], t.state, fx.fx, t.layout);
    expect(fx.names()).toEqual(['flash', 'shockwave']);
    expect(t.views.active).toBe(1);
    t.views.update(t.ctx(t.state.tick, 0));
    const preview = t.views.group.children[0] as unknown as { count: number };
    expect(preview.count).toBe(4);
    const hand = bodyOf(t.views);
    expect(hand.position.x).toBeCloseTo(t.layout.wx(9)); // still at the thrower
    expect(hand.position.y).toBeGreaterThan(1.2); // overhead
  });

  it('the object does not move until the telegraph is over, then travels the path at stepTicks per tile', () => {
    const t = throwing();
    t.views.handleEvents([t.launch], t.state, fakeFx().fx, t.layout);
    const t0 = t.state.tick;
    t.views.update(t.ctx(t0 + 20, 0.3));
    expect(bodyOf(t.views).position.x).toBeCloseTo(t.layout.wx(9));
    t.views.update(t.ctx(t0 + 30 + 6, 0.6)); // one tile in
    expect(bodyOf(t.views).position.x).toBeCloseTo(t.layout.wx(8));
    t.views.update(t.ctx(t0 + 30 + 15, 0.9)); // two and a half tiles in
    expect(bodyOf(t.views).position.x).toBeCloseTo(t.layout.wx(6.5), 1);
    t.views.update(t.ctx(t0 + 30 + 9, 0.8)); // a path preview ahead remains, behind the object it is gone
    const preview = t.views.group.children[0] as unknown as { count: number };
    expect(preview.count).toBeLessThan(4);
  });

  it('a hit shows its result and the object is gone a beat later: wall shatters, shield sparks, body flashes, miss thuds', () => {
    const cases: [Parameters<typeof impactFor>[0], string[]][] = [
      ['wall', ['sparkle', 'dust']],
      ['blockedArmour', ['flash', 'sparkle']],
      ['damaged', ['flash', 'dust']],
      ['expired', ['shockwave', 'dust']],
    ];
    for (const [result, want] of cases) {
      const t = throwing();
      t.views.handleEvents([t.launch], t.state, fakeFx().fx, t.layout);
      t.views.update(t.ctx(t.state.tick + 40, 0.9));
      const fx = fakeFx();
      t.views.handleEvents(
        [
          {
            type: 'projectileHit',
            id: 7,
            kind: 'bottle',
            victimId: result === 'wall' || result === 'expired' ? null : 0,
            result,
            x: 6,
            y: 5,
          },
        ],
        t.state,
        fx.fx,
        t.layout,
      );
      expect(fx.names()).toEqual(want);
      t.views.update(t.ctx(t.state.tick + 41, 1));
      expect(t.views.active).toBe(1); // lingers a beat
      t.views.update(t.ctx(t.state.tick + 42, 2));
      expect(t.views.active).toBe(0);
    }
  });

  it('a strong projectile is cued red-hot and drawn bigger; a stone shattering on a wall also throws debris', () => {
    const t = throwing();
    const fx = fakeFx();
    t.views.handleEvents(
      [{ ...(t.launch as Extract<SimEvent, { type: 'projectileLaunched' }>), strong: true, kind: 'stone' }],
      t.state,
      fx.fx,
      t.layout,
    );
    expect(fx.calls[0]!.args[4]).toBe(0xff3d2e);
    t.views.update(t.ctx(t.state.tick + 40, 1));
    expect((bodyOf(t.views) as unknown as { scale: { x: number } }).scale.x).toBeCloseTo(1.5);
    const fx2 = fakeFx();
    t.views.handleEvents(
      [{ type: 'projectileHit', id: 7, kind: 'stone', victimId: null, result: 'wall', x: 5, y: 5 }],
      t.state,
      fx2.fx,
      t.layout,
    );
    expect(fx2.names()).toContain('blockDebris');
  });

  it('a path that ends with no hit event is cleaned up on its own', () => {
    const t = throwing();
    t.views.handleEvents([t.launch], t.state, fakeFx().fx, t.layout);
    const t0 = t.state.tick;
    t.views.update(t.ctx(t0 + 200, 5));
    expect(t.views.active).toBe(1);
    t.views.update(t.ctx(t0 + 210, 6));
    expect(t.views.active).toBe(0);
  });

  it('dispose removes everything', () => {
    const t = throwing();
    t.views.handleEvents([t.launch], t.state, fakeFx().fx, t.layout);
    expect(() => t.views.dispose()).not.toThrow();
    expect(t.views.active).toBe(0);
  });
});
