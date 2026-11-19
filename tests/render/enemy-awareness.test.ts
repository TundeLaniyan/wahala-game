/**
 * Awareness marks and the armour cue (docs/CAMPAIGN_SECTOR_AI.md "Awareness markers and armour cue", decisions
 * SV6 and SV8): the "!" / "?" / fade-out marks come from the REAL territorial layer (its `enemyCue` events and its
 * state changes), are brief, never sit on the wind-up clock, and cost no allocation per frame; the armour shield reads
 * `enemyHealthView(...).blastOnly / punchFloor`. Headless (no WebGL).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BufferAttribute } from 'three';
import { enemyHealthView, tick } from '../../src/sim';
import type { GameState, SimEvent } from '../../src/sim';
import { createLayout } from '../../src/render/coords';
import type { Effects } from '../../src/render/fx/Effects';
import {
  AWARENESS_TIMING,
  awarenessLook,
  awarenessOfCue,
  awarenessOfMind,
  awarenessSpan,
  emptyLook,
} from '../../src/render/views/enemyAwareness';
import { EnemyTelegraphViews } from '../../src/render/views/EnemyTelegraphViews';
import { DamageViews } from '../../src/render/views/DamageViews';
import { armourCue } from '../../src/render/views/damageModel';
import { BILLBOARDS } from '../../src/render/views/telegraphShapes';
import type { GlyphBatch } from '../../src/render/views/telegraphShapes';
import type { FrameContext } from '../../src/render/views/types';
import { tacticsScene } from '../../scripts/lib/sectorDrill';

// the pips' canvas texture: a stand-in 2D context is enough headless
beforeAll(() => {
  const ctx2d = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', {
    createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d }),
  });
});
afterAll(() => vi.unstubAllGlobals());

const FX = { dust: () => undefined } as unknown as Effects;
const frame = (s: GameState, alpha = 0): FrameContext =>
  ({
    state: s,
    alpha,
    time: s.tick / 60,
    dt: 1 / 60,
    info: { localPlayerId: 0 },
    layout: createLayout(s.width, s.height),
    fx: FX,
  }) as unknown as FrameContext;

const put = (s: GameState, id: number, x: number, y: number): void => {
  const p = s.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
};

/** A watcher at (4, 6) facing a human at (8, 6) on the open bus park row: it notices him within the second (decision RC4: a calm enemy notices within 5 tiles). */
function watcher(): GameState {
  const { s } = tacticsScene({
    level: 'normal',
    seed: 1,
    human: [8, 6],
    enemies: [{ variant: 'agbero', at: [4, 6], territory: { radius: 2 } }],
  });
  s.players[1]!.facing = 'right';
  return s;
}

/** Sim ticks with the renderer's order each frame: events first, then the frame. */
function play(s: GameState, view: EnemyTelegraphViews, n: number, each?: () => void): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const ev = tick(s, {});
    all.push(...ev);
    view.handleEvents(ev, s, FX);
    view.update(frame(s));
    each?.();
  }
  return all;
}

const batch = (view: EnemyTelegraphViews, key: 'alertSign' | 'querySign' | 'lostSign'): GlyphBatch =>
  (view as unknown as { b: Record<string, GlyphBatch> }).b[key]!;

describe('which mark a beat starts', () => {
  it('alert / investigate / lost cues and state changes start their mark; telegraph beats and calm states none', () => {
    expect(awarenessOfCue('alert')).toBe('alert');
    expect(awarenessOfCue('investigate')).toBe('investigate');
    expect(awarenessOfCue('lost')).toBe('lost');
    for (const c of ['windup', 'recovery', 'stagger'] as const) expect(awarenessOfCue(c)).toBeNull();
    expect(awarenessOfMind('alert', 'patrol')).toBe('alert');
    expect(awarenessOfMind('investigate', 'pursue')).toBe('investigate'); // sight lost in a chase: no event
    expect(awarenessOfMind('return', 'investigate')).toBe('lost'); // a search that found nothing: no event
    expect(awarenessOfMind('pursue', 'alert')).toBeNull();
    expect(awarenessOfMind('patrol', 'return')).toBeNull();
    expect(awarenessOfMind('alert', 'alert')).toBeNull();
    expect(awarenessOfMind('alert', undefined)).toBeNull(); // first sight of the seat: nothing to announce
  });
});

describe('awarenessLook (brief: pops, holds, fades)', () => {
  it('an alert pops with an overshoot, holds through the beat (clamped readable), then fades out', () => {
    const T = AWARENESS_TIMING;
    const L = emptyLook();
    expect(awarenessLook('alert', 0, 12, false, L).scale).toBeLessThan(0.2);
    const scales = [3, 5, 7, 9].map((a) => awarenessLook('alert', a, 12, false, L).scale);
    expect(Math.max(...scales)).toBeGreaterThan(1.05); // the pop overshoots
    expect(awarenessLook('alert', T.pop + 10, 12, false, L)).toMatchObject({
      visible: true,
      scale: 1,
      alpha: 1,
    });
    // a 12-tick alert beat still holds at least alertHoldMin; a 200-tick one at most alertHoldMax
    expect(awarenessSpan('alert', 12)).toBe(T.pop + T.alertHoldMin + T.fade);
    expect(awarenessSpan('alert', 200)).toBe(T.pop + T.alertHoldMax + T.fade);
    const span = awarenessSpan('alert', 12);
    const a1 = awarenessLook('alert', span - T.fade + 4, 12, false, L).alpha;
    const a2 = awarenessLook('alert', span - 2, 12, false, L).alpha;
    expect(a1).toBeLessThan(1);
    expect(a2).toBeLessThan(a1);
    expect(awarenessLook('alert', span, 12, false, L).visible).toBe(false);
    expect(span / 60).toBeLessThan(1.8); // brief: never a permanent badge
  });

  it('a lost mark sinks and fades the whole time; investigate sways; reduced motion keeps only the fade', () => {
    const L = emptyLook();
    const span = awarenessSpan('lost', 0);
    const alphas = [10, 20, 30, 40, 50].map((a) => awarenessLook('lost', a, 0, false, L).alpha);
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]!).toBeLessThan(alphas[i - 1]!);
    expect(awarenessLook('lost', 40, 0, false, L).lift).toBeLessThan(0);
    expect(awarenessLook('lost', span, 0, false, L).visible).toBe(false);
    const rolls = [20, 30, 40].map((a) => awarenessLook('investigate', a, 0, false, L).roll);
    expect(rolls.some((r) => Math.abs(r) > 0.05)).toBe(true);
    for (const k of ['alert', 'investigate', 'lost'] as const)
      for (const a of [0, 4, 20, 40]) {
        const r = awarenessLook(k, a, 12, true, L);
        expect(r.roll, k).toBe(0);
        expect(r.lift, k).toBe(0);
        expect(r.scale, k).toBeLessThanOrEqual(1);
      }
  });
});

describe('awareness marks in EnemyTelegraphViews (from the real territorial layer)', () => {
  it('the watcher spots the human: ONE "!" (its event and its state change fold together), then it fades away', () => {
    const s = watcher();
    const view = new EnemyTelegraphViews(null, false);
    view.update(frame(s));
    let alertSeen = 0;
    const ev = play(s, view, 40, () => {
      alertSeen = Math.max(alertSeen, view.stats().alert);
    });
    const cue = ev.find((e) => e.type === 'enemyCue' && e.cue === 'alert');
    expect(cue).toBeDefined();
    expect(alertSeen).toBe(1);
    expect(view.stats().marksStarted.alert).toBe(1);
    // it fades on its own (the enemy keeps pursuing: no permanent badge)
    const alphaAt: number[] = [];
    play(s, view, 90, () => {
      if (view.stats().alert) alphaAt.push(batch(view, 'alertSign').alphaAt(0));
    });
    expect(view.stats().alert).toBe(0);
    expect(alphaAt.at(-1)!).toBeLessThan(0.5);
    expect(s.territory!.minds[1]!.state).toBe('pursue');
    view.dispose();
  });

  it('sight lost in a chase shows "?" from the state change alone; a search that finds nothing fades out', () => {
    const s = watcher();
    const view = new EnemyTelegraphViews(null, false);
    view.update(frame(s));
    play(s, view, 60);
    expect(s.territory!.minds[1]!.state).toBe('pursue');
    // the human slips behind the crates north of the row: out of sight but within its leash
    put(s, 0, 9, 1);
    let query = 0;
    let lost = 0;
    const ev = play(s, view, 1200, () => {
      query = Math.max(query, view.stats().investigate);
      lost = Math.max(lost, view.stats().lost);
    });
    expect(view.stats().marksStarted.investigate).toBe(1);
    expect(query).toBe(1);
    // the search that finds nothing has no event of its own (the mark came from the mind); decision RC3: a chase that breaks off (the
    // human out of reach for a second) emits the existing `lost` cue, and the mark folds the cue and the state change into one
    expect(ev.some((e) => e.type === 'enemyCue' && e.cue !== 'windup' && e.cue !== 'lost')).toBe(false);
    expect(['watch', 'patrol']).toContain(s.territory!.minds[1]!.state);
    // two "sinking ?" in this episode: the break-off's own cue (decision RC3) and the walk back after the search
    expect(view.stats().marksStarted.lost).toBe(2);
    expect(lost).toBe(1);
    view.dispose();
  });

  it('never draws a mark where the wind-up clock is; a mark of a defeated enemy goes with it', () => {
    const s = watcher();
    const view = new EnemyTelegraphViews(null, false);
    view.update(frame(s));
    play(s, view, 22);
    expect(view.stats().alert).toBe(1);
    // a wind-up starts while the "!" is up: the clock takes the spot
    const p = s.players[1]!;
    p.attack = { skill: 'push', dir: 'right', targetId: 0, resolveTick: s.tick + 40 } as never;
    view.update(frame(s));
    expect(view.stats().melee).toBe(1);
    expect(view.stats().alert).toBe(0);
    p.attack = null;
    view.update(frame(s));
    expect(view.stats().alert).toBe(1);
    p.alive = false;
    view.update(frame(s));
    expect(view.stats().alert).toBe(0);
    p.alive = true;
    view.update(frame(s));
    expect(view.stats().alert).toBe(0);
    view.dispose();
  });

  it('allocates nothing per frame once built: the same meshes, three marks one draw each', () => {
    const s = watcher();
    const view = new EnemyTelegraphViews(null, false);
    const meshes = [...view.group.children];
    play(s, view, 30);
    expect(view.group.children).toEqual(meshes);
    const drawn = view.group.children.filter((m) => m.visible);
    expect(drawn).toHaveLength(1); // only the "!" batch draws
    view.dispose();
  });
});

describe('mark and armour billboards', () => {
  it('stand in the screen plane, each an outlined (dark) plate with a tinted body and a dark mark', () => {
    for (const id of ['alertSign', 'querySign', 'lostSign', 'shield', 'burst'] as const) {
      const g = BILLBOARDS[id]();
      const pos = g.getAttribute('position') as BufferAttribute;
      const col = g.getAttribute('color') as BufferAttribute;
      for (let i = 0; i < pos.count; i++) expect(pos.getZ(i), id).toBe(0);
      const shades = new Set<number>();
      for (let i = 0; i < col.count; i++) shades.add(col.getX(i));
      expect([...shades].sort(), id).toEqual([0, 1]);
      g.dispose();
    }
  });
});

describe('armour cue (SV8: only a blast finishes)', () => {
  const view = (
    hp: number,
    kind: string,
    o: { blastOnly?: boolean; punchFloor?: number; hurt?: boolean },
  ) => ({
    hp,
    kind,
    recentlyHurt: !!o.hurt,
    blastOnly: o.blastOnly,
    punchFloor: o.punchFloor,
  });

  it('a shield beside the pips of an armoured enemy; "needs a blast" at its punch floor; nothing for the rest', () => {
    expect(armourCue(view(4, 'heavy', { blastOnly: true, punchFloor: 1 }), true, true)).toBe('armoured');
    expect(armourCue(view(1, 'heavy', { blastOnly: true, punchFloor: 1 }), true, true)).toBe('needsBlast');
    expect(armourCue(view(1, 'heavy', { blastOnly: true, punchFloor: 1 }), true, false)).toBeNull(); // no pips
    expect(armourCue(view(2, 'guard', { blastOnly: false, punchFloor: 0 }), true, true)).toBeNull();
    expect(armourCue(view(2, 'guard', {}), true, true)).toBeNull(); // outside the tactics layer
    expect(armourCue(view(1, 'heavy', { blastOnly: true, punchFloor: 1 }), false, true)).toBeNull();
    // a boss has no world pips (its bar is the rail's): the shield only when it matters
    expect(armourCue(view(14, 'boss', { blastOnly: true, punchFloor: 7 }), true, false)).toBeNull();
    expect(armourCue(view(12, 'boss', { blastOnly: true, punchFloor: 7, hurt: true }), true, false)).toBe(
      'armoured',
    );
    expect(armourCue(view(7, 'boss', { blastOnly: true, punchFloor: 7 }), true, false)).toBe('needsBlast');
  });

  it('DamageViews draws it from enemyHealthView: a heavy beside the human, then punched down to its floor', () => {
    const { s } = tacticsScene({
      level: 'normal',
      seed: 1,
      human: [6, 6],
      enemies: [{ variant: 'heavyEnforcer', at: [7, 6] }],
    });
    s.players[0]!.facing = 'right';
    const h = enemyHealthView(s, 1)!;
    expect(h.blastOnly).toBe(true);
    expect(h.punchFloor).toBeGreaterThanOrEqual(1);
    const damage = new DamageViews(null, false);
    damage.update(frame(s));
    expect(damage.pipEnemies).toBe(1);
    expect(damage.armourShown).toEqual({ shields: 1, needsBlast: 0 });
    s.players[1]!.vitals!.hp = h.punchFloor!;
    damage.update(frame(s));
    expect(damage.armourShown).toEqual({ shields: 1, needsBlast: 1 });
    // an ordinary enemy never gets the shield
    s.players[1]!.enemyVariant = 'agbero';
    s.players[1]!.enemyKind = 'agbero';
    damage.update(frame(s));
    expect(damage.armourShown).toEqual({ shields: 0, needsBlast: 0 });
    expect(damage.pipEnemies).toBe(1);
    damage.dispose();
  });
});
