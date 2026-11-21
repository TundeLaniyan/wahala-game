/**
 * Readable enemy attacks (docs/CAMPAIGN_SECTOR_AI.md "Enemy telegraphs and looks", decisions SV1-SV3): the telegraph
 * is read from the REAL simulation (a guard's punch wind-up, a thrower's cue, the planted window after it), never from
 * hard-coded durations; the view draws it for every match with campaign enemies, on every quality rung, and never for
 * multiplayer. Headless (no WebGL).
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { BufferAttribute } from 'three';
import { DIRS, tick } from '../../src/sim';
import type { GameState, Intents, SimEvent } from '../../src/sim';
import { enemyScene } from '../../scripts/lib/enemyScene';
import { createLayout } from '../../src/render/coords';
import type { Effects } from '../../src/render/fx/Effects';
import { emptyTelegraph, readTelegraph, spanProgress } from '../../src/render/views/enemyTelegraph';
import { EnemyTelegraphViews, dirYaw, hasEnemyTelegraphs } from '../../src/render/views/EnemyTelegraphViews';
import type { TelegraphAnimator } from '../../src/render/views/EnemyTelegraphViews';
import { GLYPHS } from '../../src/render/views/telegraphShapes';
import type { FrameContext } from '../../src/render/views/types';
import { eventsOf, run, sandbox } from '../helpers';

const B: Intents = { 1: { special: true } };

/** A guard right of the human on the open row 2 of the Danfo Bus Park, facing it. */
function duel(kind: 'guard' | 'heavy' | 'agbero' = 'guard'): GameState {
  const s = enemyScene({ human: { x: 4, y: 2, hp: 5 }, enemies: [{ kind, x: 5, y: 2, hp: 3 }] });
  s.players[1]!.facing = 'left';
  return s;
}

/** A thrower four tiles right of the human on row 2. */
function line(): GameState {
  const s = enemyScene({ human: { x: 4, y: 2, hp: 5 }, enemies: [{ kind: 'thrower', x: 8, y: 2 }] });
  s.players[1]!.facing = 'left';
  return s;
}

/** Ticks B for the enemy until it starts something (its first press may be held by a free window / cooldown). */
function pressUntil(s: GameState, what: 'attackStarted' | 'projectileLaunched'): SimEvent[] {
  for (let i = 0; i < 120; i++) {
    const ev = tick(s, B);
    if (eventsOf(ev, what).length > 0) return ev;
  }
  throw new Error(`no ${what}`);
}

describe('readTelegraph (from the sim state)', () => {
  it('is null for a seat without enemyKind (multiplayer fighters and the human)', () => {
    const s = sandbox({ players: 2 });
    expect(readTelegraph(s, s.players[1]!, s.tick, emptyTelegraph()).kind).toBeNull();
    const d = duel();
    expect(readTelegraph(d, d.players[0]!, d.tick, emptyTelegraph()).kind).toBeNull();
  });

  it('a punch wind-up: fills from 0 at the press to 1 at the live resolve tick, aimed at the faced tile', () => {
    const s = duel();
    const ev = pressUntil(s, 'attackStarted');
    const started = eventsOf(ev, 'attackStarted')[0]!;
    const p = s.players[1]!;
    expect(p.attack).not.toBeNull();
    const t = readTelegraph(s, p, s.tick, emptyTelegraph(), s.tick);
    expect(t.kind).toBe('melee');
    expect(t.dir).toBe('left');
    expect(t.progress).toBeLessThan(0.1);
    expect(t.aim.slice(0, t.aimCount)).toEqual([{ x: 4, y: 2 }]);
    // the rest of its reach: the other open neighbours, never the aimed tile, never a wall
    const zone = t.zone.slice(0, t.zoneCount);
    expect(zone).not.toContainEqual({ x: 4, y: 2 });
    for (const z of zone) expect(s.tiles[z.y * s.width + z.x]).toBe(0);
    // halfway and at the end, read from the LIVE resolve tick (a longer or shorter wind-up reads the same)
    const start = s.tick;
    const end = p.attack!.resolveTick;
    expect(end).toBe(started.resolveTick);
    const mid = readTelegraph(s, p, (start + end) / 2, emptyTelegraph(), start);
    expect(mid.progress).toBeCloseTo(0.5, 1);
    p.attack!.resolveTick += 30; // the AI tuning lengthens the wind-up: the same mark simply fills more slowly
    const later = readTelegraph(s, p, (start + end) / 2, emptyTelegraph(), start);
    expect(later.progress).toBeLessThan(mid.progress);
    p.attack!.resolveTick -= 30;
    expect(readTelegraph(s, p, end, emptyTelegraph(), start).progress).toBe(1);
  });

  it('a Classic raid punch is committed (decision CR4): the warning marks only the aimed tile, no other reach', () => {
    const s = duel();
    s.config.enemyAttacks.committedMelee = true;
    pressUntil(s, 'attackStarted');
    const t = readTelegraph(s, s.players[1]!, s.tick, emptyTelegraph(), s.tick);
    expect(t.kind).toBe('melee');
    expect(t.aim.slice(0, t.aimCount)).toEqual([{ x: 4, y: 2 }]);
    expect(t.zoneCount, 'no brackets on tiles the punch cannot hit').toBe(0);
  });

  it('joins a wind-up late without the event: the kind catalogue wind-up stands in', () => {
    const s = duel();
    pressUntil(s, 'attackStarted');
    const t = readTelegraph(s, s.players[1]!, s.tick, emptyTelegraph());
    expect(t.kind).toBe('melee');
    expect(t.progress).toBeGreaterThanOrEqual(0);
    expect(t.progress).toBeLessThan(0.2);
  });

  it('after the swing resolves: the open (planted) window, closing to nothing', () => {
    const s = duel();
    pressUntil(s, 'attackStarted');
    const p = s.players[1]!;
    run(s, p.attack!.resolveTick - s.tick);
    expect(p.attack).toBeNull();
    expect(s.tick).toBeLessThan(p.rootedUntil);
    const open = readTelegraph(s, p, s.tick, emptyTelegraph(), undefined, s.tick);
    expect(open.kind).toBe('open');
    expect(open.progress).toBeGreaterThan(0.9);
    run(s, p.rootedUntil - s.tick);
    expect(readTelegraph(s, p, s.tick, emptyTelegraph()).kind).toBeNull();
  });

  it('a throw cue: the path tiles (walls excluded), filling over warnTicks; then the open window', () => {
    const s = line();
    const ev = pressUntil(s, 'projectileLaunched');
    const launch = eventsOf(ev, 'projectileLaunched')[0]!;
    const p = s.players[1]!;
    const t = readTelegraph(s, p, s.tick, emptyTelegraph());
    expect(t.kind).toBe('ranged');
    expect(t.dir).toBe('left');
    const tiles = t.aim.slice(0, t.aimCount);
    expect(tiles[0]).toEqual({ x: 7, y: 2 });
    expect(tiles).toContainEqual({ x: 4, y: 2 }); // the human's tile is on the line
    for (const a of tiles) expect(s.tiles[a.y * s.width + a.x]).toBe(0);
    const half = readTelegraph(s, p, launch.launchTick + launch.warnTicks / 2, emptyTelegraph());
    expect(half.progress).toBeCloseTo(0.5, 1);
    run(s, launch.launchTick + launch.warnTicks - s.tick);
    const after = readTelegraph(s, p, s.tick, emptyTelegraph(), undefined, s.tick);
    expect(after.kind).toBe('open');
  });

  it('spanProgress clamps and treats an empty span as done', () => {
    expect(spanProgress(10, 20, 5)).toBe(0);
    expect(spanProgress(10, 20, 15)).toBe(0.5);
    expect(spanProgress(10, 20, 25)).toBe(1);
    expect(spanProgress(10, 10, 10)).toBe(1);
  });
});

describe('glyphs', () => {
  it('turn their +X toward each grid direction (+y on the grid is +z in the world)', () => {
    for (const d of DIRS) {
      const v = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), dirYaw(d));
      const want = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d];
      expect(v.x).toBeCloseTo(want[0]!, 5);
      expect(v.z).toBeCloseTo(want[1]!, 5);
    }
  });

  it('every glyph is flat, outlined (dark) under a white body the instance colour tints', () => {
    for (const [id, make] of Object.entries(GLYPHS)) {
      const g = make();
      const pos = g.getAttribute('position') as BufferAttribute;
      const col = g.getAttribute('color') as BufferAttribute;
      for (let i = 0; i < pos.count; i++) expect(pos.getY(i), id).toBe(0);
      const shades = new Set<number>();
      for (let i = 0; i < col.count; i++) shades.add(col.getX(i));
      expect(shades.has(1), id).toBe(true);
      if (id !== 'disc' && id !== 'square') expect(shades.has(0), `${id} outline`).toBe(true);
      g.dispose();
    }
  });
});

describe('EnemyTelegraphViews', () => {
  const dust: number[] = [];
  const FX = { dust: (x: number) => void dust.push(x) } as unknown as Effects;
  const frame = (s: GameState, time = 0, alpha = 0): FrameContext =>
    ({
      state: s,
      alpha,
      time,
      dt: 1 / 60,
      info: { localPlayerId: 0 },
      layout: createLayout(s.width, s.height),
      fx: FX,
    }) as unknown as FrameContext;

  it('is built for campaign enemies only (never for a multiplayer match)', () => {
    expect(hasEnemyTelegraphs(sandbox({ players: 4 }))).toBe(false);
    expect(hasEnemyTelegraphs(duel())).toBe(true);
  });

  it('draws the wind-up (ring, fill, arrow, aimed tile) and stretches the swing over it; a miss stumbles', () => {
    const s = duel();
    const calls: [number, string, number][] = [];
    const animator: TelegraphAnimator = { playOver: (id, clip, sec) => void calls.push([id, clip, sec]) };
    const view = new EnemyTelegraphViews(animator, false);
    const ctx = frame(s);
    view.update(ctx);
    expect(view.stats().instances).toBe(0);
    expect(view.group.children.every((m) => !m.visible)).toBe(true); // nothing drawn = no draw calls
    const ev = pressUntil(s, 'attackStarted');
    view.handleEvents(ev, s, ctx.fx);
    const resolve = s.players[1]!.attack!.resolveTick;
    expect(calls[0]![0]).toBe(1);
    expect(calls[0]![1]).toBe('Push');
    expect(calls[0]![2]).toBeCloseTo((resolve - s.tick) / 60, 5);
    view.update(frame(s, 0.1));
    expect(view.stats().melee).toBe(1);
    // ring + fill + arrow + aimed frame + its fill + brackets on the other open neighbours
    expect(view.stats().instances).toBeGreaterThanOrEqual(5);
    // the human steps away: the punch resolves at the air, the enemy stumbles and is open
    s.players[0]!.x = s.players[0]!.stepFromX = 1;
    const out: SimEvent[] = run(s, resolve - s.tick);
    const resolved = eventsOf(out, 'attackResolved')[0]!;
    expect(resolved.hit).toBe(false);
    view.handleEvents(out, s, ctx.fx);
    expect(calls.some(([id, clip]) => id === 1 && clip === 'Stumble')).toBe(true);
    expect(dust.length).toBeGreaterThan(0);
    view.update(frame(s, 0.2));
    expect(view.stats().open).toBe(1);
    view.dispose();
  });

  it('draws a throw cue as a sight and a line of chevrons ending in an X', () => {
    const s = line();
    const view = new EnemyTelegraphViews(null, false);
    pressUntil(s, 'projectileLaunched');
    view.update(frame(s));
    const st = view.stats();
    expect(st.ranged).toBe(1);
    const t = readTelegraph(s, s.players[1]!, s.tick, emptyTelegraph());
    // fill + sight + one glyph per path tile + the over-the-head clock (its face and its first wedge)
    expect(st.instances).toBe(2 + t.aimCount + 2);
    view.dispose();
  });

  it('the over-the-head clock fills clockwise with the wind-up: one wedge at the press, all twelve at the blow', () => {
    const s = duel();
    const view = new EnemyTelegraphViews(null, false);
    const ev = pressUntil(s, 'attackStarted');
    view.handleEvents(ev, s, FX);
    const wedges = (): number => {
      const mesh = view.group.children.find(
        (m) => (m as { renderOrder: number }).renderOrder === 37,
      ) as unknown as {
        count: number;
      };
      return mesh.count;
    };
    view.update(frame(s));
    expect(wedges()).toBe(1);
    const end = s.players[1]!.attack!.resolveTick;
    const start = s.tick;
    view.update(frame(s, 0.1, 0));
    run(s, Math.floor((end - start) / 2));
    view.update(frame(s, 0.3));
    expect(wedges()).toBeGreaterThanOrEqual(5);
    expect(wedges()).toBeLessThanOrEqual(7);
    run(s, end - s.tick - 1);
    view.update(frame(s, 0.6, 0.99));
    expect(wedges()).toBe(12);
    view.dispose();
  });

  it('allocates its batches once: many frames of many wind-ups keep the same meshes', () => {
    const s = duel();
    const view = new EnemyTelegraphViews(null, false);
    pressUntil(s, 'attackStarted');
    const meshes = [...view.group.children];
    for (let i = 0; i < 30; i++) view.update(frame(s, i / 60, i / 30));
    expect(view.group.children).toEqual(meshes);
    view.dispose();
  });
});
