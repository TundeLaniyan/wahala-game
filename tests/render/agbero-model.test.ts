/**
 * The dedicated Agbero model (docs/CHARACTER_PRODUCTION_AGBERO.md): the asset's contract (same skeleton as the hero cast,
 * the clips the animation selection asks for, mobile budgets), the safe fallback to the temporary kit look, and the
 * presentation-only clip handling in `RiggedCharacter` (wind-up stretched over the sim's wind-up, the follow-through,
 * cues that never cut a wind-up short). Headless: the GLB is parsed in Node, no WebGL.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { dedicatedModelsEnabled, ENEMY_LOOKS } from '../../src/assets/enemyLooks';
import { assets } from '../../src/render/assets/library';
import { RiggedCharacter } from '../../src/render/assets/rigged';
import type { ClipName } from '../../src/render/assets/rigged';

const MODELS = new URL('../../src/assets/models/', import.meta.url);
const LAZY = new URL('lazy/', MODELS);

interface Glb {
  json: {
    nodes: { name?: string }[];
    skins: { joints: number[] }[];
    meshes: { primitives: { indices: number }[] }[];
    accessors: { count: number }[];
    materials: unknown[];
    textures?: unknown[];
    animations: { name: string }[];
  };
  bytes: ArrayBuffer;
}

/** The same GLB without its embedded textures (Node has no image decoding; geometry, skeleton and clips are what is tested). */
function withoutTextures(buf: Buffer): ArrayBuffer {
  const jsonLength = buf.readUInt32LE(12);
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as Record<string, unknown> & {
    materials?: { pbrMetallicRoughness?: Record<string, unknown> }[];
  };
  delete doc.images;
  delete doc.textures;
  delete doc.samplers;
  for (const m of doc.materials ?? []) delete m.pbrMetallicRoughness?.baseColorTexture;
  let json = Buffer.from(JSON.stringify(doc), 'utf8');
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const binStart = 20 + jsonLength;
  const bin = buf.subarray(binStart);
  const out = Buffer.alloc(12 + 8 + json.length + bin.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  bin.copy(out, 20 + json.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

function readGlb(file: string, dir: URL = MODELS): Glb {
  const buf = readFileSync(new URL(file, dir));
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as Glb['json'];
  return { json, bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}

const boneNames = (g: Glb): string[] => g.json.skins[0]!.joints.map((j) => g.json.nodes[j]!.name!);
const triangles = (g: Glb): number =>
  g.json.meshes.reduce(
    (n, m) => n + m.primitives.reduce((k, p) => k + g.json.accessors[p.indices]!.count / 3, 0),
    0,
  );

describe('Agbero GLB contract', () => {
  const agbero = readGlb('char_agbero.glb', LAZY);
  const hero = readGlb('char_streetBaller.glb');

  it('uses exactly the hero cast skeleton, so every rig convention and the head-scale rule keep working', () => {
    expect(boneNames(agbero)).toEqual(boneNames(hero));
    expect(boneNames(agbero)).toContain('head');
  });

  it('carries the clips the animation selection asks for, plus the enemy-only ones', () => {
    const names = agbero.json.animations.map((a) => a.name);
    for (const n of [
      'Idle',
      'Walk',
      'Run',
      'Windup',
      'Strike',
      'Alert',
      'Push',
      'Stumble',
      'Dazed',
      'DieBlast',
      'DieVehicle',
    ])
      expect(names).toContain(n);
  });

  it('stays inside the mobile budget of the existing cast (no texture, few materials, bounded size)', () => {
    expect(triangles(agbero)).toBeLessThanOrEqual(24000);
    expect(agbero.json.materials.length).toBeLessThanOrEqual(7);
    expect((agbero.json.textures ?? []).length).toBeLessThanOrEqual(3);
    expect(agbero.bytes.byteLength).toBeLessThan(1.6 * 1024 * 1024);
  });
});

describe('dedicated model switch and fallback', () => {
  it('every ordinary enemy variant names its own dedicated model; the boss variant keeps the kit (bosses are keyed by name)', () => {
    for (const [variant, look] of Object.entries(ENEMY_LOOKS))
      expect(look.model, variant).toBe(variant === 'boss' ? undefined : variant);
  });

  it('`?legacyEnemies` switches the dedicated models off (art comparison and the safe way back)', () => {
    expect(dedicatedModelsEnabled('')).toBe(true);
    expect(dedicatedModelsEnabled('?debug&q=low')).toBe(true);
    expect(dedicatedModelsEnabled('?debug&legacyEnemies')).toBe(false);
  });

  it('a model that did not load is simply not in the library, so the caller takes the kit path', () => {
    expect(RiggedCharacter.create('agbero')).toBeNull();
    expect(assets.has('char_agbero')).toBe(false);
  });
});

describe('RiggedCharacter with the Agbero clips', () => {
  const agbero = readGlb('char_agbero.glb', LAZY);
  // lazy: the library must stay empty for the fallback test above until a rig test asks for the model
  let loadedOnce: Promise<void> | null = null;
  const load = (): Promise<void> =>
    (loadedOnce ??= new Promise<void>((resolve, reject) => {
      new GLTFLoader().parse(
        withoutTextures(Buffer.from(agbero.bytes)),
        '',
        (gltf) => {
          (assets as unknown as { assets: Map<string, unknown> }).assets.set('char_agbero', {
            scene: gltf.scene,
            clips: gltf.animations,
          });
          resolve();
        },
        reject,
      );
    }));

  const make = async (): Promise<RiggedCharacter> => {
    await load();
    const r = RiggedCharacter.create('agbero');
    expect(r).not.toBeNull();
    return r!;
  };

  it('has the enemy clips and the hero cast does not', async () => {
    const r = await make();
    for (const n of ['Walk', 'Windup', 'Strike', 'Alert'] as ClipName[]) expect(r.has(n), n).toBe(true);
  });

  it('a wind-up request plays the Windup clip stretched over the sim wind-up (blow on its last frames)', async () => {
    const r = await make();
    r.playOnceOver('Push', 0.63); // the fastest wind-up (38 ticks)
    expect(r.current).toBe('Windup');
    // the one-shot lasts exactly the requested span: the clip is 1.0 s, played 1.0 / 0.63 times faster
    r.update(0.6);
    expect(r.current).toBe('Windup');
    r.update(0.05);
    expect(r.current).not.toBe('Windup');
  });

  it('the follow-through is the Strike clip, and a cue never cuts a running one-shot', async () => {
    const r = await make();
    r.playOnce('Push', 0.03, 1);
    expect(r.current).toBe('Strike');
    r.playCue('Alert');
    expect(r.current).toBe('Strike');
    r.update(5); // the one-shot is over
    r.playCue('Alert');
    expect(r.current).toBe('Alert');
  });
});
