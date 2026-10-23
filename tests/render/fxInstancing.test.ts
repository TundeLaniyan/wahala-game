import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Matrix4, MeshBasicMaterial, Texture } from 'three';
import type { InstancedMesh } from 'three';
import { BillboardSet, ColorInstances } from '../../src/render/fx/Billboards';
import { DecalPool } from '../../src/render/fx/Decals';
import { DebrisField } from '../../src/render/fx/Debris';

/** Long flame lines (a blast covering a whole row and column) must stay one draw call per layer. */
describe('instanced fire and decals', () => {
  it('a billboard layer grows to any number of flames and stays a single mesh', () => {
    const group = new Group();
    const set = new BillboardSet(new Texture(), { additive: true, renderOrder: 1, capacity: 8 }, (m, old) => {
      group.remove(old);
      group.add(m);
    });
    group.add(set.mesh);
    set.begin();
    for (let i = 0; i < 41 * 31; i++) set.push(i % 41, 0.5, Math.floor(i / 41), 2, 2, 1, 0.5, 0.1, 1);
    set.end();
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toBe(set.mesh);
    expect(set.mesh.count).toBe(41 * 31);
    // fully faded flames are skipped
    set.begin();
    set.push(0, 0, 0, 1, 1, 1, 1, 1, 0);
    set.end();
    expect(set.mesh.count).toBe(0);
  });

  it('coloured instances keep earlier matrices when they grow', () => {
    let mesh: InstancedMesh | null = null;
    const ci = new ColorInstances(new BoxGeometry(), new MeshBasicMaterial(), 1, (m) => (mesh = m), 4);
    ci.begin();
    for (let i = 0; i < 30; i++) ci.push(new Matrix4().makeTranslation(i, 0, 0), 1, 1, 1);
    ci.end();
    expect(mesh).toBe(ci.mesh);
    const m = new Matrix4();
    ci.mesh.getMatrixAt(3, m);
    expect(m.elements[12]).toBe(3);
    expect(ci.mesh.count).toBe(30);
  });

  it('decal pools recycle the oldest mark and fade marks out', () => {
    const pool = new DecalPool(new Texture(), 4, { y: 0.01, renderOrder: 2, hold: 1, fadeOut: 1 });
    for (let i = 0; i < 6; i++) pool.add(i, 0, 1, 1, 0, 0.7);
    pool.update(0.5);
    expect(pool.mesh.count).toBe(4);
    expect(pool.active).toBe(4);
    pool.update(2);
    expect(pool.active).toBe(0);
  });

  it('debris settles on the floor and disappears at the end of its life', () => {
    const group = new Group();
    const field = new DebrisField(group, 8);
    field.emit('plank', {
      x: 0,
      y: 0.5,
      z: 0,
      vx: 1,
      vy: 3,
      vz: 0,
      size: 1,
      color: [0.6, 0.4, 0.2],
      life: 2,
    });
    expect(field.active).toBe(1);
    for (let i = 0; i < 60; i++) field.update(1 / 60);
    expect(field.active).toBe(1);
    for (let i = 0; i < 90; i++) field.update(1 / 60);
    expect(field.active).toBe(0);
  });
});
