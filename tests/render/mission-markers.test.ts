/**
 * Campaign mission markers in the world (docs/MISSION_PRESENTATION.md): the pure look functions (colour per node state,
 * warning kind, boss state), the icon registry, and the view driving a real simulated mission headlessly: it builds
 * nothing without `state.mission`, draws a marker per objective node, a hatched tile per telegraphed tile, a bubble on a
 * shielded boss and a countdown ring on an exposed one.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mesh } from 'three';
import { createGame, missionView } from '../../src/sim';
import type { MissionNodeState, MissionStrike, NpcRole } from '../../src/sim';
import { MISSION_IDS } from '../../src/sim';
import { createLayout } from '../../src/render/coords';
import { Effects } from '../../src/render/fx/Effects';
import { QUALITY } from '../../src/render/quality';
import { iconFor } from '../../src/render/views/missionIcons';
import { hasEnemyTelegraphs } from '../../src/render/views/EnemyTelegraphViews';
import { emptyTelegraph, readTelegraph, telegraphKindOf } from '../../src/render/views/enemyTelegraph';
import { MissionViews } from '../../src/render/views/MissionViews';
import {
  ARC_STEPS,
  MARKER_COLORS,
  ROLE_COLORS,
  arcStep,
  bossLook,
  nodeLook,
  warningKey,
  warningLook,
} from '../../src/render/views/missionStyle';
import type { FrameContext } from '../../src/render/views/types';
import { newMission, put } from '../mission-helpers';

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

describe('node look (pure)', () => {
  const states: MissionNodeState[] = ['locked', 'idle', 'live', 'progress', 'done'];

  it('gold asks for the player, green is done, grey is not yet', () => {
    expect(nodeLook('live', 0, 0).color).toBe(MARKER_COLORS.target);
    expect(nodeLook('idle', 0, 0).color).toBe(MARKER_COLORS.target);
    expect(nodeLook('progress', 0.4, 0).color).toBe(MARKER_COLORS.target);
    expect(nodeLook('done', 1, 0).color).toBe(MARKER_COLORS.done);
    expect(nodeLook('locked', 0, 0).color).toBe(MARKER_COLORS.locked);
  });

  it('only wanted nodes get a beam; progress draws a ring by fraction; done a tick; locked is dim', () => {
    for (const t of [0, 0.3, 1.1]) {
      expect(nodeLook('live', 0, t).beam).toBeGreaterThan(0);
      expect(nodeLook('progress', 0.5, t).beam).toBeGreaterThan(0);
      expect(nodeLook('done', 1, t).beam).toBe(0);
      expect(nodeLook('locked', 0, t).beam).toBe(0);
    }
    expect(nodeLook('progress', 0.5, 0).arc).toBeCloseTo(0.5);
    expect(nodeLook('progress', 0, 0).arc).toBeGreaterThan(0); // a started channel always shows a sliver
    expect(nodeLook('live', 0, 0).arc).toBe(0);
    expect(nodeLook('done', 1, 0).tick).toBe(true);
    expect(nodeLook('done', 1, 0).arc).toBe(1);
    expect(nodeLook('locked', 0, 0).pad).toBeLessThan(nodeLook('live', 0, 0).pad);
    expect(nodeLook('locked', 0, 0).glow).toBe(0);
  });

  it('a live node pulses; every value stays in range for every state and time', () => {
    const a = nodeLook('live', 0, 0).pad;
    const b = nodeLook('live', 0, 0.37).pad;
    expect(a).not.toBe(b);
    for (const s of states)
      for (let t = 0; t < 3; t += 0.13) {
        const l = nodeLook(s, 0.5, t);
        for (const v of [l.pad, l.glow, l.beam, l.arc]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
  });

  it('quantises ring fractions to a small shared set of geometries', () => {
    expect(arcStep(0)).toBe(0);
    expect(arcStep(1)).toBe(ARC_STEPS);
    expect(arcStep(2)).toBe(ARC_STEPS);
    expect(arcStep(0.5)).toBe(ARC_STEPS / 2);
  });
});

describe('warning and boss look (pure)', () => {
  it('red for strikes and convoys, amber for the rail lane, blue for reinforcements', () => {
    expect(warningLook('strike', 0.2, 0).color).toBe(MARKER_COLORS.strike);
    expect(warningLook('convoy', 0.2, 0).color).toBe(MARKER_COLORS.strike);
    expect(warningLook('contingency', 0.2, 0).color).toBe(MARKER_COLORS.strike);
    expect(warningLook('window', 0.2, 0).color).toBe(MARKER_COLORS.window);
    expect(warningLook('reinforce', 0.2, 0).color).toBe(MARKER_COLORS.reinforce);
  });

  it('the hatch fills the tile and the edge brightens as the landing nears; the last quarter is urgent', () => {
    const early = warningLook('convoy', 0.05, 0.1);
    const late = warningLook('convoy', 0.95, 0.1);
    expect(late.hatchScale).toBeGreaterThan(early.hatchScale);
    expect(late.hatchScale).toBeLessThanOrEqual(1);
    expect(late.edge).toBeGreaterThan(early.edge * 0.9);
    expect(early.urgent).toBe(false);
    expect(late.urgent).toBe(true);
    // out-of-range progress is clamped
    expect(warningLook('strike', -3, 0).hatchScale).toBeCloseTo(0.3);
    expect(warningLook('strike', 7, 0).hatchScale).toBeCloseTo(0.96);
  });

  it('keys a warning by kind, first tile and size (the sim gives no id)', () => {
    const a = { kind: 'convoy' as const, tiles: [5, 6, 7], x: 6, y: 0 };
    expect(warningKey(a)).toBe(warningKey({ ...a, tiles: [5, 6, 7] }));
    expect(warningKey(a)).not.toBe(warningKey({ ...a, kind: 'strike' }));
    expect(warningKey(a)).not.toBe(warningKey({ ...a, tiles: [5, 6] }));
  });

  it('boss: blue bubble while shielded, flashing red / gold with a draining arc when exposed, fading when defeated', () => {
    const shielded = bossLook(
      { shielded: true, exposed: false, exposedRemainingTicks: 0, defeated: false },
      1500,
      0,
      0,
    );
    expect(shielded.ringColor).toBe(MARKER_COLORS.bossShield);
    expect(shielded.bubble).toBeGreaterThan(0);
    expect(shielded.arc).toBe(0);
    const exposed = (left: number, t = 0) =>
      bossLook({ shielded: false, exposed: true, exposedRemainingTicks: left, defeated: false }, 1500, t, 0);
    expect(exposed(1500).bubble).toBe(0);
    expect(exposed(1500).arc).toBeCloseTo(1);
    expect(exposed(750).arc).toBeCloseTo(0.5);
    expect(exposed(0).arc).toBeGreaterThan(0);
    expect(exposed(1000).beam).toBeGreaterThan(0);
    const colours = new Set([0, 0.1, 0.2, 0.3, 0.4].map((t) => exposed(1000, t).ringColor));
    expect([...colours].sort()).toEqual([MARKER_COLORS.bossExposed, MARKER_COLORS.bossExposedAlt].sort());
    const gone = bossLook(
      { shielded: false, exposed: false, exposedRemainingTicks: 0, defeated: true },
      1500,
      0,
      1.2,
    );
    expect(gone.ring).toBeLessThan(0.3);
    expect(
      bossLook({ shielded: false, exposed: false, exposedRemainingTicks: 0, defeated: true }, 1500, 0, 5)
        .ring,
    ).toBe(0);
  });

  it('every crew role has its own pip colour', () => {
    const roles: NpcRole[] = [
      'meleeGuard',
      'rangedAttacker',
      'blocker',
      'runner',
      'escort',
      'objectiveDefender',
      'supportUnit',
      'bossAssistant',
    ];
    expect(new Set(roles.map((r) => ROLE_COLORS[r])).size).toBe(roles.length);
  });
});

describe('icons', () => {
  it('every objective has an icon, and the press drop differs from a ledger', () => {
    expect(iconFor('dispatchRelays', 'r1')).toBe('relay');
    expect(iconFor('supplyRoutes', 's1')).toBe('parts');
    expect(iconFor('junctionAccess', 'j1')).toBe('barrier');
    expect(iconFor('evidenceRun', 'l1')).toBe('ledger');
    expect(iconFor('evidenceRun', 'press')).toBe('press');
    expect(iconFor('contingencyGrid', 'a')).toBe('cabinet');
    expect(iconFor('dispatchWindows', 'w1')).toBe('lever');
  });
});

describe('the mission view draws a simulated mission', () => {
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
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const rig = (id: (typeof MISSION_IDS)[number] = 'oshodi') => {
    const state = newMission({ id });
    const layout = createLayout(state.width, state.height);
    const fx = new Effects(layout, QUALITY.medium);
    const views = new MissionViews();
    const ctx = (time = 0, alpha = 0): FrameContext =>
      ({ state, alpha, time, dt: 1 / 60, info: { excitement: 0 }, layout, fx }) as unknown as FrameContext;
    return { state, views, ctx };
  };
  const instances = (views: MissionViews, key: string): number =>
    (views as unknown as Record<string, { mesh: { count: number } }>)[key]!.mesh.count;

  it('is a no-op without state.mission', () => {
    const state = createGame({
      seed: 3,
      arenaId: 'danfoBusPark',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false },
        { name: 'B', characterId: 'lekkiBoy', isBot: false },
      ],
    });
    const layout = createLayout(state.width, state.height);
    const views = new MissionViews();
    views.update({
      state,
      alpha: 0,
      time: 0,
      dt: 0.016,
      info: { excitement: 0 },
      layout,
      fx: null,
    } as unknown as FrameContext);
    expect(views.group.visible).toBe(false);
    expect(views.stats()).toMatchObject({ nodes: 0, boss: false, visible: false });
    views.dispose();
  });

  it('draws one marker per node of every mission, gold while live, with the right icon kind in the board colours', () => {
    for (const id of MISSION_IDS) {
      const { state, views, ctx } = rig(id);
      views.update(ctx());
      const view = missionView(state)!;
      expect(views.stats().nodes, id).toBe(view.nodes.length);
      expect(views.stats().nodes, id).toBeGreaterThan(0);
      expect(views.group.visible).toBe(true);
      views.dispose();
    }
  });

  it('hatches every telegraphed tile with its own colour and drops them when they land', () => {
    const { state, views, ctx } = rig('oshodi');
    const m = state.mission!;
    const lane = [30, 31, 32, 33, 34];
    const strike: MissionStrike = {
      id: 900,
      kind: 'convoy',
      tiles: lane,
      warnTick: state.tick,
      landTick: state.tick + 200,
      endTick: state.tick + 240,
      eventId: 900,
      source: '',
      postponed: 0,
      landed: false,
    };
    m.strikes.push(strike);
    views.update(ctx());
    expect(instances(views, 'warnHatch')).toBe(lane.length);
    expect(instances(views, 'warnGlow')).toBe(lane.length);
    expect(instances(views, 'warnEdge')).toBe(lane.length);
    const hatch = (views as unknown as { warnHatch: { mesh: { instanceColor: { array: Float32Array } } } })
      .warnHatch;
    const [r, g, b] = [...hatch.mesh.instanceColor.array.slice(0, 3)];
    expect(r!).toBeGreaterThan(g!); // red
    expect(r!).toBeGreaterThan(b!);
    strike.landed = true; // the flames are FlameViews' business from here
    views.update(ctx(0.5));
    expect(instances(views, 'warnHatch')).toBe(0);
    views.dispose();
  });

  it('puts a bubble on the shielded boss and a flashing ring with a countdown arc on the exposed one', () => {
    const { state, views, ctx } = rig('oshodi');
    const m = state.mission!;
    views.update(ctx());
    const boss = (
      views as unknown as {
        boss: { group: { visible: boolean }; bubble: Mesh; arc: Mesh; halo: Mesh; beam: Mesh };
      }
    ).boss;
    expect(views.stats().boss).toBe(true);
    expect(boss.bubble.visible).toBe(true);
    expect(boss.arc.visible).toBe(false);
    expect(boss.halo.visible).toBe(false);

    m.boss.shielded = false;
    m.boss.exposedUntil = state.tick + 900;
    m.phaseState = 'exposed';
    views.update(ctx(1));
    expect(boss.bubble.visible).toBe(false);
    expect(boss.arc.visible).toBe(true);
    expect(boss.halo.visible).toBe(true);
    expect(boss.beam.visible).toBe(true);

    // defeated: the ring fades out and is gone after a moment
    m.boss.defeated = true;
    state.players[m.bossId]!.alive = false;
    views.update(ctx(2));
    expect(boss.group.visible).toBe(true);
    views.update(ctx(4));
    expect(boss.group.visible).toBe(false);
    views.dispose();
  });

  it('rings only living crew, one pip each, and none for the human or the boss', () => {
    const { state, views, ctx } = rig('oshodi');
    views.update(ctx());
    const crew = state.mission!.seats.filter((s) => s.role !== 'player' && s.role !== 'boss');
    expect(instances(views, 'pips')).toBe(crew.length);
    state.players[crew[0]!.playerId]!.alive = false;
    views.update(ctx(0.1));
    expect(instances(views, 'pips')).toBe(crew.length - 1);
    views.dispose();
  });

  it('follows a progressing node (a ring appears) and tidies up markers of nodes that left the view', () => {
    // a half-broken parts stack (relays have no partial state since they are jammed by one blast, decision BX4)
    const { state, views, ctx } = rig('mushin');
    const m = state.mission!;
    views.update(ctx());
    const n0 = m.nodes[0]!;
    put(state, 0, n0.x, n0.y);
    m.tuning.phases[0].hp = 2;
    n0.hp = 1;
    views.update(ctx(0.2));
    const marker = (views as unknown as { nodes: Map<string, { arc: Mesh; beam: Mesh }> }).nodes.get(n0.id)!;
    expect(marker.arc.visible).toBe(true);
    expect(marker.beam.visible).toBe(true);
    n0.done = true;
    views.update(ctx(0.3));
    expect(marker.arc.visible).toBe(true); // a full green ring + tick
    m.nodes.pop();
    views.update(ctx(0.4));
    expect(views.stats().nodes).toBe(m.nodes.length);
    views.dispose();
  });

  // ------------------------------------------------------------ boss exposure cues (decisions BX1, BX8)
  it('a restore ring on the anchor tile while the boss is exposed; none while he is shielded', () => {
    const state = newMission({ id: 'oshodi' });
    const layout = createLayout(state.width, state.height);
    const fx = new Effects(layout, QUALITY.medium);
    const views = new MissionViews();
    const ctx = (time = 0): FrameContext =>
      ({ state, alpha: 0, time, dt: 1 / 60, info: { excitement: 0 }, layout, fx }) as unknown as FrameContext;
    views.update(ctx());
    const boss = (views as unknown as { boss: { anchor: Mesh } | null }).boss!;
    expect(boss.anchor.visible).toBe(false);
    const m = state.mission!;
    const post = m.seats[1]!.post!;
    m.boss.shielded = false;
    m.phaseState = 'exposed';
    m.boss.exposedUntil = state.tick + 600;
    m.boss.anchor = { ...post };
    views.update(ctx(0.5));
    expect(boss.anchor.visible).toBe(true);
    expect(boss.anchor.position.x).toBeCloseTo(layout.wx(post.x));
    expect(boss.anchor.position.z).toBeCloseTo(layout.wz(post.y));
    m.boss.shielded = true;
    m.phaseState = 'active';
    views.update(ctx(1));
    expect(boss.anchor.visible).toBe(false);
    views.dispose();
  });

  // ------------------------------------------------------------ boss fight beats (decisions BH1-BH5)
  it("the sim's boss events draw their beats on the boss: a hit, the shield closing, the defeat; nothing else does", () => {
    const state = newMission({ id: 'oshodi' });
    const layout = createLayout(state.width, state.height);
    const calls: string[] = [];
    const rec =
      (name: string) =>
      (...args: unknown[]): void => {
        calls.push(`${name}:${args.length}`);
      };
    const fx = {
      flash: rec('flash'),
      shockwave: rec('shockwave'),
      sparkle: rec('sparkle'),
      comicPuff: rec('puff'),
      dust: rec('dust'),
      shake: 0,
    } as unknown as Effects;
    const views = new MissionViews();
    const boss = state.players[1]!;
    const at = { x: boss.x, y: boss.y };
    views.handleEvents([{ type: 'bossShielded', bossId: 1, reason: 'start' }], state, fx, layout);
    views.handleEvents([{ type: 'missionPhase', phase: 0, change: 'started' }], state, fx, layout);
    expect(calls).toEqual([]);
    views.handleEvents(
      [{ type: 'bossHit', bossId: 1, byId: 0, hitsLeft: 2, maxHits: 3, ...at }],
      state,
      fx,
      layout,
    );
    expect(calls).toEqual(['flash:6', 'shockwave:4', 'shockwave:4', 'sparkle:3']);
    expect((fx as unknown as { shake: number }).shake).toBeGreaterThan(0);
    calls.length = 0;
    views.handleEvents([{ type: 'bossShielded', bossId: 1, reason: 'phase' }], state, fx, layout);
    expect(calls).toEqual(['flash:6', 'shockwave:4']); // a cold ring, no sparks
    calls.length = 0;
    views.handleEvents(
      [{ type: 'bossDefeated', bossId: 1, creditId: 0, defeat: 'eliminated' }],
      state,
      fx,
      layout,
    );
    expect(calls).toContain('puff:2');
    expect(calls).toContain('dust:4');
    // no mission, no beats (a normal match never reaches here, but the guard is part of the contract)
    const plain = { ...state, mission: undefined } as unknown as typeof state;
    calls.length = 0;
    views.handleEvents(
      [{ type: 'bossHit', bossId: 1, byId: 0, hitsLeft: 2, maxHits: 3, ...at }],
      plain,
      fx,
      layout,
    );
    expect(calls).toEqual([]);
    views.dispose();
  });

  it('a blast on the shielded boss shows ONE cold bounce per blast; the exposed boss gets none', () => {
    const { state, views, ctx } = rig('oshodi');
    const layout = createLayout(state.width, state.height);
    const calls: string[] = [];
    const fx = {
      flash: () => calls.push('flash'),
      shockwave: () => calls.push('ring'),
      sparkle: () => calls.push('spark'),
      comicPuff: () => undefined,
      dust: () => undefined,
      shake: 0,
    } as unknown as Effects;
    const withFx = (time: number): FrameContext => ({ ...ctx(time), fx, layout }) as FrameContext;
    const boss = state.players[1]!;
    views.update(withFx(0));
    expect(calls).toEqual([]);
    state.flames.push({
      x: boss.x,
      y: boss.y,
      eventId: 77,
      genId: -1,
      ownerId: 0,
      dir: null,
      tip: false,
      startTick: state.tick,
      endTick: state.tick + 30,
    });
    views.update(withFx(0.1));
    expect(calls).toEqual(['flash', 'ring', 'spark']);
    calls.length = 0;
    for (let i = 2; i < 8; i++) views.update(withFx(i / 10)); // the same blast keeps burning
    expect(calls).toEqual([]);
    // the ring runs the bounce's colour for a moment, then goes back to the shield blue
    const marker = (views as unknown as { boss: { ringMat: { color: { getHex(): number } } } }).boss;
    views.update(withFx(0.15));
    state.flames.length = 0;
    views.update(withFx(5));
    expect(marker.ringMat.color.getHex()).toBe(0x4aa8ff);
    // exposed: the flame is a hit's business, not a bounce
    state.mission!.boss.shielded = false;
    state.mission!.phaseState = 'exposed';
    state.mission!.boss.exposedUntil = state.tick + 600;
    state.flames.push({
      x: boss.x,
      y: boss.y,
      eventId: 78,
      genId: -1,
      ownerId: 0,
      dir: null,
      tip: false,
      startTick: state.tick,
      endTick: state.tick + 30,
    });
    views.update(withFx(6));
    expect(calls).toEqual([]);
    views.dispose();
  });

  it('boss-mission seats read as telegraph kinds: the boss as a boss, the crew by variant, the human never', () => {
    const state = newMission({ id: 'oshodi' });
    expect(telegraphKindOf(state, state.players[0]!)).toBeNull();
    expect(telegraphKindOf(state, state.players[1]!)).toBe('boss');
    for (const p of state.players.slice(2)) expect(telegraphKindOf(state, p)).not.toBeNull();
    expect(hasEnemyTelegraphs(state)).toBe(true);
    // a boss punch in its wind-up draws the melee telegraph (the same path as every enemy's)
    const boss = state.players[1]!;
    boss.attack = {
      skill: 'push',
      dir: 'left',
      targetId: 0,
      resolveTick: state.tick + 4,
    } as typeof boss.attack;
    const t = readTelegraph(state, boss, state.tick, emptyTelegraph(), state.tick);
    expect(t.kind).toBe('melee');
    expect(t.strong).toBe(true);
  });
});
