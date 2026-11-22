/**
 * The local player's identification marker (decision PI1, docs/PLAYER_MARKER.md): the style switch, local-human-only,
 * prominence with nearby rivals, hidden when down, drawn over bodies, and `original` unchanged. Driven headlessly with
 * a fake canvas; nothing here needs WebGL.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Group, Mesh, Sprite } from 'three';
import { createLayout } from '../../src/render/coords';
import { QUALITY } from '../../src/render/quality';
import { Effects } from '../../src/render/fx/Effects';
import {
  DEFAULT_PLAYER_MARKER,
  easeProminence,
  markerProminence,
  playerMarkerMode,
  rivalProximity,
  setPlayerMarkerMode,
  tagOpacity,
  tagScale,
} from '../../src/render/playerMarker';
import { PlayerViews } from '../../src/render/views/PlayerViews';
import { GROUND_OPACITY, GROUND_SCALE, YOU_RENDER_ORDER } from '../../src/render/views/youMarker';
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
afterEach(() => setPlayerMarkerMode(DEFAULT_PLAYER_MARKER));

/** Four fighters on the sandbox: the human (id 0) in the middle, rivals placed by the test. */
function rig(localPlayerId = 0) {
  const state = sandbox({ players: 4 });
  const layout = createLayout(state.width, state.height);
  const fx = new Effects(layout, QUALITY.medium);
  const views = new PlayerViews();
  put(state, 0, 7, 5);
  put(state, 1, 13, 1);
  put(state, 2, 1, 9);
  put(state, 3, 13, 9);
  const ctx = (time = 0, dt = 1 / 60): FrameContext =>
    ({
      state,
      alpha: 0,
      time,
      dt,
      info: { localPlayerId, excitement: 0, entryOverlay: null },
      layout,
      fx,
    }) as unknown as FrameContext;
  /** Runs `seconds` of frames so the eased prominence settles. */
  const settle = (seconds = 2): void => {
    for (let i = 0; i < seconds * 60; i++) views.update(ctx(i / 60));
  };
  const group = views.group as Group;
  const sprites = (): Sprite[] => group.children.filter((c): c is Sprite => (c as Sprite).isSprite);
  const tag = (): Sprite => {
    const t = sprites().find((s) => s.renderOrder === YOU_RENDER_ORDER);
    if (!t) throw new Error('no YOU tag');
    return t;
  };
  const tags = (): Sprite[] => sprites().filter((s) => s.renderOrder === YOU_RENDER_ORDER);
  const chevrons = (): Sprite[] => sprites().filter((s) => s.renderOrder === 32);
  const names = (): Sprite[] => sprites().filter((s) => s.renderOrder === 31);
  const meshes = (): Mesh[] => group.children.filter((c): c is Mesh => (c as Mesh).isMesh);
  return { state, views, ctx, settle, tag, tags, chevrons, names, meshes };
}

describe('style switch', () => {
  it('defaults to the indicator and switches live', () => {
    expect(DEFAULT_PLAYER_MARKER).toBe('indicator');
    expect(playerMarkerMode()).toBe('indicator');
    setPlayerMarkerMode('indicatorGround');
    expect(playerMarkerMode()).toBe('indicatorGround');
    setPlayerMarkerMode('original');
    expect(playerMarkerMode()).toBe('original');
  });

  it('shows the tag in the indicator modes and the chevron + name tag only in original, switching frame to frame', () => {
    const r = rig();
    r.settle(1);
    expect(r.tag().visible).toBe(true);
    expect(r.chevrons().every((c) => !c.visible)).toBe(true);
    setPlayerMarkerMode('original');
    r.views.update(r.ctx(2));
    expect(r.tag().visible).toBe(false);
    expect(r.chevrons().filter((c) => c.visible)).toHaveLength(1);
    // all four name tags are drawn, as before
    expect(r.names().filter((n) => n.visible)).toHaveLength(4);
    setPlayerMarkerMode('indicator');
    r.views.update(r.ctx(3));
    expect(r.tag().visible).toBe(true);
    expect(r.chevrons().every((c) => !c.visible)).toBe(true);
    // the tag stands in for the local "You" name tag; rivals keep theirs
    expect(r.names().filter((n) => n.visible)).toHaveLength(3);
  });

  it('original draws what the game drew before: the chevron at its old height and size, the name tag, no tag or floor mark', () => {
    setPlayerMarkerMode('original');
    const r = rig();
    r.settle(1);
    const chev = r.chevrons().find((c) => c.visible)!;
    expect(chev.scale.x).toBeCloseTo(0.48);
    expect(chev.position.y).toBeGreaterThan(2.4);
    expect(chev.position.y).toBeLessThan(2.62);
    expect(r.tag().visible).toBe(false);
    expect(r.names().every((n) => n.visible)).toBe(true);
    expect(r.meshes().filter((m) => m.renderOrder === 3 && m.visible && m.rotation.x !== 0).length).toBe(4); // shadows only
  });

  it('indicatorGround adds a floor mark under the player; indicator does not', () => {
    const r = rig();
    // the floor decals the marker adds: flat meshes at the marker's height (the rings and shadows sit at other heights)
    const floorMarks = () => r.meshes().filter((m) => m.visible && m.position.y === 0.025 && m.scale.x > 1.5);
    r.settle(1);
    expect(floorMarks()).toHaveLength(0);
    setPlayerMarkerMode('indicatorGround');
    r.settle(1);
    expect(floorMarks()).toHaveLength(1);
    // decision TL8: it must be seen at the fixed camera (the first version, 0.34-0.54 over a 30 % tint, was not) and still
    // stay a restrained decal: clearly below the ring's 0.98, wider than the fighter's ring (0.96)
    const mark = floorMarks()[0]!;
    const opacity = (mark.material as { opacity: number }).opacity;
    expect(opacity).toBeGreaterThanOrEqual(GROUND_OPACITY - 0.1);
    expect(opacity).toBeLessThan(0.95);
    expect(mark.scale.x).toBeGreaterThanOrEqual(GROUND_SCALE);
    expect(mark.scale.x).toBeGreaterThan(0.96 * 1.5);
  });

  it('the three styles are three different pictures: original = chevron + name tag, indicator = tag, ground = tag + floor mark', () => {
    const r = rig();
    const look = (): string => {
      const chev = r.chevrons().some((c) => c.visible);
      const names = r.names().filter((n) => n.visible).length;
      const tag = r.tags().some((t) => t.visible);
      const ground = r.meshes().some((m) => m.visible && m.position.y === 0.025 && m.scale.x >= GROUND_SCALE);
      return JSON.stringify({ chev, names, tag, ground });
    };
    const seen: Record<string, string> = {};
    for (const mode of ['original', 'indicator', 'indicatorGround'] as const) {
      setPlayerMarkerMode(mode);
      r.settle(1);
      seen[mode] = look();
    }
    expect(seen.original).toBe('{"chev":true,"names":4,"tag":false,"ground":false}');
    expect(seen.indicator).toBe('{"chev":false,"names":3,"tag":true,"ground":false}');
    expect(seen.indicatorGround).toBe('{"chev":false,"names":3,"tag":true,"ground":true}');
    expect(new Set(Object.values(seen)).size).toBe(3);
  });
});

describe('who gets it', () => {
  it('only the local human has a tag; a bot-only match (no local id) has none', () => {
    const r = rig(0);
    r.settle(1);
    expect(r.tags()).toHaveLength(1);
    const none = rig(-1);
    none.settle(1);
    expect(none.tags()).toHaveLength(0);
  });

  it('follows the local id, not slot 0', () => {
    const r = rig(2);
    r.settle(1);
    const t = r.tag();
    const p = r.state.players[2]!;
    // the tag stands over that fighter, not the first seat
    const wx = (r.ctx().layout.wx as (x: number) => number)(p.x);
    expect(t.position.x).toBeCloseTo(wx, 1);
  });
});

describe('prominence', () => {
  it('is quiet alone and rises smoothly with rivals within about two tiles', () => {
    const r = rig();
    r.settle(2);
    const alone = r.tag();
    const aloneScale = alone.scale.x;
    const aloneOpacity = (alone.material as { opacity: number }).opacity;
    expect(aloneScale).toBeCloseTo(1.3 * tagScale(0), 2);
    // three rivals close in
    put(r.state, 1, 8, 5);
    put(r.state, 2, 6, 5);
    put(r.state, 3, 7, 6);
    // no popping: the first frame moves only a part of the way
    r.views.update(r.ctx(10));
    const first = r.tag().scale.x;
    expect(first).toBeGreaterThan(aloneScale);
    expect(first).toBeLessThan(1.3 * tagScale(1) - 0.01);
    r.settle(2);
    const crowded = r.tag();
    expect(crowded.scale.x).toBeGreaterThan(aloneScale * 1.3);
    expect((crowded.material as { opacity: number }).opacity).toBeGreaterThan(aloneOpacity);
    // and relaxes again
    put(r.state, 1, 13, 1);
    put(r.state, 2, 1, 9);
    put(r.state, 3, 13, 9);
    r.settle(3);
    expect(r.tag().scale.x).toBeCloseTo(aloneScale, 2);
  });

  it('counts only living rivals', () => {
    const r = rig();
    for (const id of [1, 2, 3]) r.state.players[id]!.alive = false;
    put(r.state, 1, 8, 5);
    r.settle(2);
    expect(r.tag().scale.x).toBeCloseTo(1.3 * tagScale(0), 2);
  });

  it('pure curve: more rivals and nearer rivals raise it; far rivals do nothing; screen overlap counts', () => {
    expect(rivalProximity(0, 0.8)).toBe(1);
    expect(rivalProximity(2.5, 0)).toBe(0);
    expect(rivalProximity(1.8, 0)).toBeGreaterThan(0);
    expect(rivalProximity(1.8, 0)).toBeLessThan(rivalProximity(1.4, 0));
    // a rival a little in front of or behind in the same column overlaps the player on screen
    expect(rivalProximity(0.3, 2)).toBe(1);
    expect(rivalProximity(2.0, 2)).toBe(0);
    expect(markerProminence(0)).toBe(0);
    expect(markerProminence(1)).toBeGreaterThan(markerProminence(0.5));
    expect(markerProminence(3)).toBe(1);
    expect(tagScale(1)).toBeGreaterThan(tagScale(0));
    expect(tagOpacity(1)).toBe(1);
    expect(tagOpacity(0)).toBeGreaterThan(0.4); // subtle, never invisible
    const up = easeProminence(0, 1, 1 / 60);
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(0.3);
    expect(easeProminence(1, 0, 1 / 60)).toBeLessThan(1);
    expect(easeProminence(0.4, 0.4, 1)).toBeCloseTo(0.4);
  });
});

describe('down and respawn', () => {
  it('is hidden while the player is dead and back when they return', () => {
    const r = rig();
    r.settle(1);
    expect(r.tag().visible).toBe(true);
    r.state.players[0]!.alive = false;
    r.views.update(r.ctx(5));
    expect(r.tag().visible).toBe(false);
    setPlayerMarkerMode('indicatorGround');
    r.views.update(r.ctx(5.1));
    expect(r.tag().visible).toBe(false);
    expect(
      r
        .meshes()
        .filter(
          (m) => m.visible && m.position.y === 0.025 && (m.material as { opacity: number }).opacity < 0.6,
        ),
    ).toHaveLength(0);
    r.state.players[0]!.alive = true;
    r.views.update(r.ctx(8));
    expect(r.tag().visible).toBe(true);
  });
});

describe('drawn on top', () => {
  it('has no depth test or depth write and sorts above every other sprite of the figures', () => {
    const r = rig();
    r.settle(1);
    const t = r.tag();
    const m = t.material as { depthTest: boolean; depthWrite: boolean; transparent: boolean; fog: boolean };
    expect(m.depthTest).toBe(false);
    expect(m.depthWrite).toBe(false);
    expect(m.transparent).toBe(true);
    expect(m.fog).toBe(false); // night fog never greys it out
    for (const s of r.views.group.children) {
      if ((s as Sprite).isSprite && s !== t) expect(t.renderOrder).toBeGreaterThan(s.renderOrder);
    }
  });
});
