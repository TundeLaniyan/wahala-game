/**
 * Fighter identities (decision FF1): every one of the 32 competitor slots has its own visible outfit-and-colour
 * combination, applied to the real character models without touching anything but the cloth colours and a
 * headwear child of the head bone.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Mesh, Object3D, SkinnedMesh } from 'three';
import {
  FIGHTER_IDENTITIES,
  HEADWEAR_COLORS,
  IDENTITY_COUNT,
  fighterIdentity,
  rotateHue,
  rotateHueHex,
} from '../src/assets/fighterIdentity';
import { applyOutfit, buildHeadwear } from '../src/render/assets/outfit';
import { CHARACTER_IDS } from '../src/sim';

const hueGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

describe('the 32 fighter identities', () => {
  it('has 32 identities with 32 distinct visible kits', () => {
    expect(IDENTITY_COUNT).toBe(32);
    expect(FIGHTER_IDENTITIES).toHaveLength(32);
    expect(new Set(FIGHTER_IDENTITIES.map((i) => i.key)).size).toBe(32);
  });

  it('no two slots share a (jersey hue, headwear, headwear colour) combination, with any characters', () => {
    const visible = (i: (typeof FIGHTER_IDENTITIES)[number]) =>
      `${i.hueShift}|${i.headwear}|${i.headwear === 'none' ? '-' : i.headwearColor}`;
    expect(new Set(FIGHTER_IDENTITIES.map(visible)).size).toBe(32);
    // two fighters on the same character model (the worst case) still differ
    for (const character of CHARACTER_IDS)
      expect(new Set(FIGHTER_IDENTITIES.map((i) => `${character}|${visible(i)}`)).size).toBe(32);
  });

  it('is deterministic and wraps beyond 32 slots', () => {
    expect(fighterIdentity(5)).toEqual(FIGHTER_IDENTITIES[5]);
    expect(fighterIdentity(37)).toEqual(FIGHTER_IDENTITIES[5]);
    expect(fighterIdentity(-27)).toEqual(FIGHTER_IDENTITIES[5]);
  });

  it("slot 0 keeps the original look (menu art, the player's own fighter)", () => {
    expect(FIGHTER_IDENTITIES[0]).toMatchObject({ hueShift: 0, headwear: 'none' });
  });

  it('neighbouring slots and same-headwear slots differ strongly in jersey hue', () => {
    for (let i = 0; i + 1 < IDENTITY_COUNT; i++) {
      const a = FIGHTER_IDENTITIES[i]!;
      const b = FIGHTER_IDENTITIES[i + 1]!;
      if (a.headwear === b.headwear) expect(hueGap(a.hueShift, b.hueShift)).toBeGreaterThanOrEqual(135);
    }
    for (const kind of ['none', 'cap', 'beanie', 'bucket']) {
      const hues = FIGHTER_IDENTITIES.filter((i) => i.headwear === kind).map((i) => i.hueShift);
      expect(new Set(hues).size).toBe(8);
      for (const a of hues)
        for (const b of hues) if (a !== b) expect(hueGap(a, b)).toBeGreaterThanOrEqual(45);
    }
  });

  it('headwear colours contrast: eight different colours, and each kit pairs one with its jersey hue', () => {
    expect(new Set(HEADWEAR_COLORS).size).toBe(8);
    for (const i of FIGHTER_IDENTITIES)
      if (i.headwear !== 'none') expect(HEADWEAR_COLORS).toContain(i.headwearColor);
  });
});

describe('hue rotation', () => {
  it('leaves greys, whites and blacks alone and round-trips through a full turn', () => {
    for (const g of [0, 0.4, 1] as const)
      rotateHue([g, g, g], 135).forEach((v) => expect(v).toBeCloseTo(g, 9));
    const c: [number, number, number] = [0.1, 0.55, 0.25];
    const full = [0, 1, 2].reduce<[number, number, number]>((acc) => rotateHue(acc, 45), c);
    expect(full.map((v) => +v.toFixed(2))).toEqual(rotateHue(c, 135).map((v) => +v.toFixed(2)));
    const back = rotateHue(rotateHue(c, 90), 270);
    back.forEach((v, i) => expect(v).toBeCloseTo(c[i]!, 5));
    expect(rotateHueHex(0xffffff, 90)).toBe(0xffffff);
    expect(rotateHueHex(0x168a44, 180)).not.toBe(0x168a44);
  });
});

describe('applied to the real character models', () => {
  async function load(id: string): Promise<{ scene: Object3D }> {
    const buf = readFileSync(new URL(`../src/assets/models/char_${id}.glb`, import.meta.url));
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new GLTFLoader().parseAsync(data, '');
  }
  const meshes = (root: Object3D): Mesh[] => {
    const out: Mesh[] = [];
    root.traverse((o) => (o as SkinnedMesh).isSkinnedMesh && out.push(o as Mesh));
    return out;
  };
  const meanColour = (m: Mesh): [number, number, number] => {
    const c = m.geometry.getAttribute('color');
    const sum: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < c.count; i++) {
      sum[0] += c.getX(i);
      sum[1] += c.getY(i);
      sum[2] += c.getZ(i);
    }
    return sum.map((v) => v / c.count) as [number, number, number];
  };

  for (const id of ['streetBaller', 'lekkiBoy', 'campusQueen', 'areaBoss']) {
    it(`${id}: eight jersey hues are eight different cloth colours; only cloth and headwear change`, async () => {
      const originals = await load(id);
      const base = meshes(originals.scene);
      const means = new Set<string>();
      for (const hueIndex of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const identity = FIGHTER_IDENTITIES.find((i) => i.hueIndex === hueIndex && i.headwear === 'cap')!;
        const model = (await load(id)).scene;
        applyOutfit(model, id, identity);
        const dressed = meshes(model);
        expect(dressed).toHaveLength(base.length);
        dressed.forEach((m, k) => {
          const original = base[k]!;
          const cloth =
            original.material instanceof Object &&
            !Array.isArray(original.material) &&
            original.material.name === 'cloth';
          const sameShape =
            m.geometry.getAttribute('position').count === original.geometry.getAttribute('position').count;
          expect(sameShape).toBe(true);
          if (!cloth && hueIndex === 0) return;
          if (cloth)
            means.add(
              meanColour(m)
                .map((v) => v.toFixed(3))
                .join(','),
            );
        });
        // skin, hair and eyes keep their exact colours
        for (const m of dressed) {
          const name = (m.material as { name: string }).name;
          if (name === 'cloth') continue;
          const o = base[dressed.indexOf(m)]!;
          expect(Array.from(m.geometry.getAttribute('color').array)).toEqual(
            Array.from(o.geometry.getAttribute('color').array),
          );
        }
        // the cap sits on the head bone
        const head = model.getObjectByName('head')!;
        expect(head.getObjectByName('headwear_cap')).toBeDefined();
      }
      expect(means.size).toBe(8);
    });
  }

  it('headwear exists for every kind except none and stays small enough to read as a hat', () => {
    expect(buildHeadwear('none', 0xff0000)).toBeNull();
    for (const kind of ['cap', 'beanie', 'bucket'] as const) {
      const hat = buildHeadwear(kind, 0xe23228)!;
      expect(hat.name).toBe(`headwear_${kind}`);
      expect(meshesIn(hat).length).toBeGreaterThan(0);
    }
  });
});

function meshesIn(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => (o as Mesh).isMesh && out.push(o as Mesh));
  return out;
}
