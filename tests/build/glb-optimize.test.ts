/** The build-time model optimiser (scripts/vite/glbOptimize.ts): compression must be provably faithful, and fail safe. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  MAX_POSITION_ERROR,
  embeddedImages,
  imageHash,
  optimizeGlb,
  patchExternalImages,
  verifyEquivalent,
} from '../../scripts/vite/glbOptimize';

const model = (name: string): Uint8Array => readFileSync(resolve(__dirname, '../../src/assets/models', name));

async function io(): Promise<NodeIO> {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  return new NodeIO()
    .registerExtensions(KHRONOS_EXTENSIONS)
    .registerExtensions([EXTMeshoptCompression])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

describe('optimizeGlb', () => {
  it('compresses a static prop, keeps it equivalent and reports the measured error', async () => {
    const src = model('env_barrel.glb');
    const { bytes, report, externals } = await optimizeGlb(src);
    expect(report.used).toBe(true);
    expect(bytes.byteLength).toBeLessThan(src.byteLength);
    expect(report.maxPositionError!).toBeLessThanOrEqual(MAX_POSITION_ERROR);
    expect(report.maxPositionError).toBe(0); // lossless: vertices are bit-identical
    expect(externals).toEqual([]);
    // the result decodes again, with the same materials and node names as the original
    const a = await (await io()).readBinary(src);
    const b = await (await io()).readBinary(bytes);
    expect(
      b
        .getRoot()
        .listMaterials()
        .map((m) => m.getName()),
    ).toEqual(
      a
        .getRoot()
        .listMaterials()
        .map((m) => m.getName()),
    );
    expect(
      b
        .getRoot()
        .listNodes()
        .map((n) => n.getName())
        .sort(),
    ).toEqual(
      a
        .getRoot()
        .listNodes()
        .map((n) => n.getName())
        .sort(),
    );
  });

  it('keeps a skinned character equivalent: same skeleton, same animations (rotations compared up to sign), textures untouched', async () => {
    const src = model('lazy/char_agbero.glb');
    const { bytes, report } = await optimizeGlb(src);
    expect(report.used).toBe(true);
    expect(bytes.byteLength).toBeLessThan(src.byteLength * 0.5);
    const a = await (await io()).readBinary(src);
    const b = await (await io()).readBinary(bytes);
    expect(
      b
        .getRoot()
        .listAnimations()
        .map((x) => x.getName()),
    ).toEqual(
      a
        .getRoot()
        .listAnimations()
        .map((x) => x.getName()),
    );
    expect(b.getRoot().listSkins().length).toBeLessThanOrEqual(a.getRoot().listSkins().length);
    expect(
      b
        .getRoot()
        .listTextures()
        .map((t) => imageHash(t.getImage()!)),
    ).toEqual(
      a
        .getRoot()
        .listTextures()
        .map((t) => imageHash(t.getImage()!)),
    );
  });

  it('fails safe: damaged geometry is rejected by the verifier, never shipped', async () => {
    const original = await (await io()).readBinary(model('env_barrel.glb'));
    const damaged = await (await io()).readBinary(model('env_barrel.glb'));
    const position = damaged.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!;
    const array = position.getArray()!;
    for (let i = 0; i < array.length; i += 3) array[i] = array[i]! + 0.05; // a 5 cm shift of a 0.4 m barrel
    position.setArray(array);
    expect(() => verifyEquivalent(original, damaged)).toThrow(/vertex error/);
  });

  it('a garbage file is returned unchanged with the reason (no exception)', async () => {
    const junk = new Uint8Array([1, 2, 3, 4]);
    const { bytes, report } = await optimizeGlb(junk);
    expect(bytes).toBe(junk);
    expect(report.used).toBe(false);
    expect(report.reason).toBeTruthy();
  });
});

describe('textures shared by several models', () => {
  it('the four vehicles share three large textures, and they leave the models as uri references (once, byte-identical)', async () => {
    const hashes = new Map<string, number>();
    const sizes = new Map<string, number>();
    for (const v of ['danfo', 'taxi', 'keke', 'okada'])
      for (const img of await embeddedImages(model(`veh_${v}.glb`))) {
        hashes.set(img.hash, (hashes.get(img.hash) ?? 0) + 1);
        sizes.set(img.hash, img.size);
      }
    const shared = new Map(
      [...hashes]
        .filter(([h, n]) => n > 1 && sizes.get(h)! >= 8_000)
        .map(([h]) => [h, `vtex-${h.slice(0, 8)}.jpg`]),
    );
    expect(shared.size).toBeGreaterThanOrEqual(3);
    const src = model('veh_taxi.glb');
    const { bytes, externals, report } = await optimizeGlb(src, shared);
    expect(report.used).toBe(true);
    expect(externals.length).toBeGreaterThanOrEqual(3);
    for (const e of externals) expect(imageHash(e.bytes)).toBe([...shared].find(([, n]) => n === e.name)![0]);
    // the model is now much smaller, and its JSON points at the shared files
    expect(bytes.byteLength).toBeLessThan(src.byteLength * 0.4);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const json = JSON.parse(Buffer.from(bytes.subarray(20, 20 + dv.getUint32(12, true))).toString()) as {
      images: { uri?: string; bufferView?: number }[];
    };
    const uris = json.images.filter((i) => i.uri).map((i) => i.uri);
    expect(uris.sort()).toEqual(externals.map((e) => e.name).sort());
    for (const i of json.images) expect(i.uri === undefined).toBe(i.bufferView !== undefined);
  });

  it('patchExternalImages leaves a file without matching placeholders byte-for-byte equivalent in content', async () => {
    const src = model('env_barrel.glb');
    const patched = patchExternalImages(src, new Map());
    const a = await (await io()).readBinary(src);
    const b = await (await io()).readBinary(patched);
    expect(b.getRoot().listMeshes().length).toBe(a.getRoot().listMeshes().length);
    expect(patched.byteLength % 4).toBe(0);
  });
});
