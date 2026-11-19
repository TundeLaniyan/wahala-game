/**
 * Campaign enemy looks by variant (decision SV4): every variant has its own readable kit, a seat without a variant is
 * drawn as its kind's default, multiplayer fighters keep their identity kit, the Ring crews wear the invented
 * plum-and-lime palette, and the kit stays cheap (one shared material, one merged mesh per dressed bone, cached).
 */
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { ENEMY_KIND_IDS, ENEMY_VARIANT_IDS, DEFAULT_VARIANT_OF_KIND } from '../../src/sim';
import {
  ENEMY_LOOKS,
  RING_LIME,
  RING_PLUM,
  enemyLookOf,
  enemyScaleOf,
  enemyVariantOf,
} from '../../src/assets/enemyLooks';
import { applyEnemyKit, kitGeometries, paletteGeometry } from '../../src/render/assets/enemyKit';

describe('enemy looks (data)', () => {
  it('dresses every variant, and a seat without a variant as its kind default', () => {
    for (const v of ENEMY_VARIANT_IDS) expect(ENEMY_LOOKS[v].variant).toBe(v);
    for (const k of ENEMY_KIND_IDS) {
      expect(enemyVariantOf({ enemyKind: k })).toBe(DEFAULT_VARIANT_OF_KIND[k]);
      expect(enemyLookOf({ enemyKind: k })).toBe(ENEMY_LOOKS[DEFAULT_VARIANT_OF_KIND[k]]);
    }
    expect(enemyLookOf({ enemyKind: 'guard', enemyVariant: 'ringSecurity' })!.variant).toBe('ringSecurity');
  });

  it('never dresses a multiplayer fighter or the human (no enemyKind, no variant)', () => {
    expect(enemyLookOf({})).toBeNull();
    expect(enemyScaleOf({})).toBe(1);
    // a boss mission's generator-bot boss may name a look without a kind: the Ojuelegba finale's enforcer (FN8)
    expect(enemyLookOf({ enemyVariant: 'boss' })?.variant).toBe('boss');
  });

  it('reads apart: no two variants share headwear, and no two share a clothing colour', () => {
    const looks = Object.values(ENEMY_LOOKS);
    expect(new Set(looks.map((l) => l.headwear)).size).toBe(looks.length);
    expect(new Set(looks.map((l) => l.palette.primary)).size).toBe(looks.length);
  });

  it('makes leaders and heavies bigger, the area boy slighter, and marks leaders', () => {
    expect(ENEMY_LOOKS.heavyEnforcer.scale).toBeGreaterThan(1.1);
    expect(ENEMY_LOOKS.boss.scale).toBeGreaterThan(ENEMY_LOOKS.lieutenant.scale);
    expect(ENEMY_LOOKS.lieutenant.scale).toBeGreaterThan(1);
    expect(ENEMY_LOOKS.areaBoy.scale).toBeLessThan(1);
    const leaders = Object.values(ENEMY_LOOKS)
      .filter((l) => l.leader)
      .map((l) => l.variant);
    expect(leaders.sort()).toEqual(['boss', 'lieutenant']);
  });

  it('dresses the fictional Ring crews in the invented plum-and-lime palette', () => {
    expect(ENEMY_LOOKS.routeMarshal.palette.primary).toBe(RING_PLUM);
    expect(ENEMY_LOOKS.routeMarshal.accent).toBe(RING_LIME);
    expect(ENEMY_LOOKS.ringSecurity.accent).toBe(RING_LIME);
    expect(ENEMY_LOOKS.ringSecurity.props).toContain('vest');
  });

  it('gives each role its equipment', () => {
    expect(ENEMY_LOOKS.bottleThrower.props).toEqual(expect.arrayContaining(['bottle', 'crate']));
    expect(ENEMY_LOOKS.routeMarshal.props).toContain('baton');
    expect(ENEMY_LOOKS.ringSecurity.props).toEqual(expect.arrayContaining(['radio', 'earpiece']));
    expect(ENEMY_LOOKS.marketEnforcer.props).toEqual(expect.arrayContaining(['apron', 'sack']));
    expect(ENEMY_LOOKS.heavyEnforcer.props).toContain('bulkyVest');
  });
});

describe('enemy kit (render)', () => {
  /** A stand-in cast body: the named bones and one cloth skinless mesh. */
  function fakeBody(): Group {
    const body = new Group();
    for (const name of ['hips', 'spine', 'chest', 'neck', 'head', 'hand_R', 'hand_L']) {
      const b = new Object3D();
      b.name = name;
      body.add(b);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
    // a saturated green, a near-black and an off-white trim (the cast's cloth clusters)
    g.setAttribute(
      'color',
      new Float32BufferAttribute([0, 0.22, 0.05, 0.01, 0.01, 0.02, 0.91, 0.89, 0.82, 0, 0.11, 0.025], 3),
    );
    const cloth = new MeshStandardMaterial({ vertexColors: true });
    cloth.name = 'cloth';
    body.add(new Mesh(g, cloth));
    return body;
  }

  it('adds one merged mesh per dressed bone, all on one shared material', () => {
    for (const look of Object.values(ENEMY_LOOKS)) {
      const body = fakeBody();
      const meshes = applyEnemyKit(body, 'streetBaller', look);
      expect(meshes.length, look.variant).toBeGreaterThanOrEqual(1);
      expect(meshes.length, look.variant).toBeLessThanOrEqual(3);
      expect(new Set(meshes.map((m) => m.material)).size).toBe(1);
      expect(meshes.every((m) => m.parent?.name)).toBe(true);
    }
  });

  it('caches the merged kit per variant and rig (ten enemies share their buffers)', () => {
    const a = kitGeometries(ENEMY_LOOKS.ringSecurity, 'lekkiBoy');
    const b = kitGeometries(ENEMY_LOOKS.ringSecurity, 'lekkiBoy');
    for (const [bone, g] of a) expect(b.get(bone)).toBe(g);
  });

  it('recolours the cloth two-tone: saturated -> primary, dark -> secondary, light trim -> trim', () => {
    const body = fakeBody();
    const cloth = body.children.find((c) => (c as Mesh).isMesh) as Mesh;
    const source = cloth.geometry;
    const look = ENEMY_LOOKS.routeMarshal;
    const g = paletteGeometry(source, look.palette);
    expect(paletteGeometry(source, look.palette)).toBe(g); // cached
    const col = g.getAttribute('color');
    const hue = (i: number) => [col.getX(i), col.getY(i), col.getZ(i)];
    const [r0, g0, b0] = hue(0); // plum: red and blue over green
    expect(r0).toBeGreaterThan(g0);
    expect(b0).toBeGreaterThan(g0);
    const [r1, g1, b1] = hue(1); // near-black stays dark
    expect(Math.max(r1, g1, b1)).toBeLessThan(0.1);
    // the darker saturated vertex keeps its shading relative to the brighter one
    expect(hue(3)[0]).toBeLessThan(r0);
  });
});
