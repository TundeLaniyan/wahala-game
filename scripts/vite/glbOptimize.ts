import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import type { Document, Node, Primitive } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

/**
 * Geometry / animation compression for the shipped glTF models (docs/MOBILE_PERFORMANCE.md, "Model compression").
 * LOSSLESS EXT_meshopt_compression (vertex reordering + meshopt's byte-exact vertex / index codecs; no quantisation, so
 * vertices stay Float32 in their original space and no KHR_mesh_quantization node transform is added) is decoded by
 * three's MeshoptDecoder at load. A first version quantised positions (-46 % on characters instead of -33 %) and was
 * REJECTED: game code bakes node matrices into raw vertex arrays (`AssetLibrary.parts()`), which silently broke the
 * instanced props; the render A/B (scripts/perf/visual-capture.mjs) caught it. Embedded JPEG textures are left byte-for-byte alone (re-encoding them saved
 * only 11 % at q85 and is a visible-quality decision, not a safe default). The source `.glb` files are never touched:
 * this runs on the bytes the build emits.
 *
 * It is a SAFE transform: the result is decoded again and compared with the original (`verifyEquivalent`); any
 * difference beyond the tolerances below, or a file that does not get smaller, keeps the original bytes.
 */
export const GLB_OPTIMIZER_VERSION = 3;

/** World-space vertex error allowed, as a fraction of the model's bounding-box diagonal: lossless, so float round-off only. */
export const MAX_POSITION_ERROR = 1e-6;
/** The same for skinned meshes (positions are checked through the weighted joint matrices). */
export const MAX_SKINNED_POSITION_ERROR = 1e-5;
/** Largest animation sample difference allowed (translation m / quaternion component / scale). */
export const MAX_ANIMATION_ERROR = 0.002;

let ready: Promise<NodeIO> | null = null;
async function io(): Promise<NodeIO> {
  ready ??= (async () => {
    await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
    return new NodeIO()
      .registerExtensions(KHRONOS_EXTENSIONS)
      .registerExtensions([EXTMeshoptCompression])
      .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  })();
  return ready;
}

export interface OptimizeReport {
  before: number;
  after: number;
  used: boolean;
  /** Why the original was kept (when `used` is false). */
  reason?: string;
  /** Measured fidelity of the compressed file. */
  maxPositionError?: number;
  maxAnimationError?: number;
}

type V3 = [number, number, number];

/** 4x4 column-major product a * b. */
function mul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = sum;
    }
  return o;
}

const apply = (m: ArrayLike<number>, v: ArrayLike<number>): V3 => [
  m[0]! * v[0]! + m[4]! * v[1]! + m[8]! * v[2]! + m[12]!,
  m[1]! * v[0]! + m[5]! * v[1]! + m[9]! * v[2]! + m[13]!,
  m[2]! * v[0]! + m[6]! * v[1]! + m[10]! * v[2]! + m[14]!,
];

/**
 * World-space bind-pose vertex positions of every primitive, one cloud per mesh node primitive (dequantised through
 * getElement). Static meshes use the node's world matrix; skinned meshes use the weighted joint matrices
 * (jointWorld x inverseBind), which is where quantisation of a skinned mesh is baked.
 */
function worldPositions(doc: Document): { name: string; prim: number; skinned: boolean; points: V3[] }[] {
  const out: { name: string; prim: number; skinned: boolean; points: V3[] }[] = [];
  const visit = (node: Node): void => {
    const mesh = node.getMesh();
    if (mesh) {
      const skin = node.getSkin();
      const joints = skin?.listJoints() ?? [];
      const ibm = skin?.getInverseBindMatrices();
      const jointMats = joints.map((j, i) => {
        const inv: number[] = new Array(16).fill(0);
        ibm?.getElement(i, inv);
        return mul(j.getWorldMatrix(), inv);
      });
      const world = node.getWorldMatrix();
      mesh.listPrimitives().forEach((p: Primitive, prim) => {
        const acc = p.getAttribute('POSITION');
        const ja = p.getAttribute('JOINTS_0');
        const wa = p.getAttribute('WEIGHTS_0');
        const points: V3[] = [];
        if (acc) {
          const v: number[] = [0, 0, 0];
          const jj: number[] = [0, 0, 0, 0];
          const ww: number[] = [0, 0, 0, 0];
          // only vertices some triangle uses count: the optimiser drops unreferenced ones, which are never drawn
          const indices = p.getIndices()?.getArray();
          const used = indices ? new Set<number>(Array.from(indices)) : null;
          for (let i = 0; i < acc.getCount(); i++) {
            if (used && !used.has(i)) continue;
            acc.getElement(i, v);
            if (skin && ja && wa) {
              ja.getElement(i, jj);
              wa.getElement(i, ww);
              const sum = [0, 0, 0];
              let total = 0;
              for (let k = 0; k < 4; k++) {
                if (ww[k]! <= 0) continue;
                const q = apply(jointMats[jj[k]!]!, v);
                sum[0]! += q[0] * ww[k]!;
                sum[1]! += q[1] * ww[k]!;
                sum[2]! += q[2] * ww[k]!;
                total += ww[k]!;
              }
              points.push([sum[0]! / (total || 1), sum[1]! / (total || 1), sum[2]! / (total || 1)]);
            } else points.push(apply(world, v));
          }
        }
        out.push({ name: node.getName(), prim, skinned: !!skin, points });
      });
    }
    node.listChildren().forEach(visit);
  };
  doc
    .getRoot()
    .listScenes()
    .forEach((s) => s.listChildren().forEach(visit));
  return out;
}

/** Symmetric Hausdorff distance between two point clouds (vertices are reordered and welded by meshopt), via a grid. */
function hausdorff(a: V3[], b: V3[], cell: number): number {
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const grid = (pts: V3[]): Map<string, V3[]> => {
    const g = new Map<string, V3[]>();
    for (const p of pts) {
      const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell));
      const list = g.get(k);
      if (list) list.push(p);
      else g.set(k, [p]);
    }
    return g;
  };
  const oneWay = (from: V3[], to: Map<string, V3[]>): number => {
    let worst = 0;
    for (const p of from) {
      const cx = Math.floor(p[0] / cell);
      const cy = Math.floor(p[1] / cell);
      const cz = Math.floor(p[2] / cell);
      let best = Infinity;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const q of to.get(key(cx + dx, cy + dy, cz + dz)) ?? [])
              best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      worst = Math.max(worst, best);
    }
    return worst;
  };
  return Math.max(oneWay(a, grid(b)), oneWay(b, grid(a)));
}

/** Throws a descriptive Error when `b` is not an equivalent of `a`; returns the measured worst errors otherwise. */
export function verifyEquivalent(
  a: Document,
  b: Document,
): { maxPositionError: number; maxAnimationError: number } {
  const ra = a.getRoot();
  const rb = b.getRoot();
  const names = (d: Document): string[] =>
    d
      .getRoot()
      .listNodes()
      .map((n) => n.getName())
      .sort();
  if (JSON.stringify(names(a)) !== JSON.stringify(names(b))) throw new Error('node names differ');
  const usedSkins = (d: Document): number[] =>
    d
      .getRoot()
      .listNodes()
      .filter((n) => n.getSkin())
      .map((n) => n.getSkin()!.listJoints().length)
      .sort((x, y) => x - y);
  if (JSON.stringify(usedSkins(a)) !== JSON.stringify(usedSkins(b)))
    throw new Error('skinned nodes / joint counts differ');
  if (ra.listMaterials().length !== rb.listMaterials().length) throw new Error('material count differs');
  if (ra.listTextures().length !== rb.listTextures().length) throw new Error('texture count differs');
  const pa = worldPositions(a);
  const pb = worldPositions(b);
  if (pa.length !== pb.length) throw new Error('primitive count differs');
  let maxPositionError = 0;
  pa.forEach((p, i) => {
    const q = pb[i]!;
    if (p.name !== q.name || p.prim !== q.prim || q.points.length === 0 || q.points.length > p.points.length)
      throw new Error('primitive layout differs');
    const lo: V3 = [1e30, 1e30, 1e30];
    const hi: V3 = [-1e30, -1e30, -1e30];
    for (const v of p.points)
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k]!, v[k]!);
        hi[k] = Math.max(hi[k]!, v[k]!);
      }
    const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    // cells twice the tolerance wide: a true match is always in the same or a neighbouring cell
    const tolerance = p.skinned ? MAX_SKINNED_POSITION_ERROR : MAX_POSITION_ERROR;
    const err = hausdorff(p.points, q.points, diag * tolerance * 2) / diag;
    // NaN / Infinity (a vertex with no counterpart) must fail too: compare with `!(err <= tolerance)`
    if (!(err <= tolerance))
      throw new Error(
        `${p.skinned ? 'skinned ' : ''}vertex error ${(err * 100).toFixed(3)} % of the bounding box`,
      );
    maxPositionError = Math.max(maxPositionError, err);
  });
  const aa = ra.listAnimations();
  const ab = rb.listAnimations();
  if (aa.length !== ab.length) throw new Error('animation count differs');
  let maxAnimationError = 0;
  aa.forEach((an, i) => {
    const bn = ab[i]!;
    if (an.getName() !== bn.getName() || an.listChannels().length !== bn.listChannels().length)
      throw new Error(`animation ${an.getName()} differs`);
    an.listSamplers().forEach((s, k) => {
      const t = bn.listSamplers()[k]!;
      const xa = s.getOutput()!;
      const xb = t.getOutput()!;
      if (xa.getCount() !== xb.getCount() || s.getInput()!.getCount() !== t.getInput()!.getCount())
        throw new Error(`animation ${an.getName()} sample count differs`);
      const ea: number[] = new Array(xa.getElementSize()).fill(0);
      const eb: number[] = new Array(xa.getElementSize()).fill(0);
      // a quaternion and its negation are the same rotation (the rotation filter may flip the sign): compare up to sign
      const rotation = an
        .listChannels()
        .some((ch) => ch.getSampler() === s && ch.getTargetPath() === 'rotation');
      for (let n = 0; n < xa.getCount(); n++) {
        xa.getElement(n, ea);
        xb.getElement(n, eb);
        let sign = 1;
        if (rotation) {
          let dot = 0;
          for (let c = 0; c < ea.length; c++) dot += ea[c]! * eb[c]!;
          sign = dot < 0 ? -1 : 1;
        }
        for (let c = 0; c < ea.length; c++)
          maxAnimationError = Math.max(maxAnimationError, Math.abs(ea[c]! - sign * eb[c]!));
      }
    });
  });
  if (maxAnimationError > MAX_ANIMATION_ERROR)
    throw new Error(`animation error ${maxAnimationError.toFixed(5)}`);
  return { maxPositionError, maxAnimationError };
}

/** md5 of an image's bytes: the identity of a texture that several models embed. */
export const imageHash = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');

/** Textures this small are not worth a request of their own. */
export const MIN_SHARED_BYTES = 8_000;

/** A shared texture carried out of the model: written once as `assets/<name>` and referenced by `uri`. */
export interface ExternalImage {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** A valid 1x1 JPEG; every shared texture gets it plus its own hash after the end-of-image marker (decoders ignore it). */
const PIXEL: Uint8Array = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  ),
);
const placeholderFor = (hash: string): Uint8Array => Uint8Array.from([...PIXEL, ...Buffer.from(`;${hash};`)]);

/** Rewrites a GLB's JSON so images whose bytes are `placeholderFor(hash)` become `uri` references (the bytes stay as dead weight of ~100 B). */
export function patchExternalImages(glb: Uint8Array, uriByHash: ReadonlyMap<string, string>): Uint8Array {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(Buffer.from(glb.subarray(20, 20 + jsonLength)).toString('utf8')) as {
    images?: { bufferView?: number; uri?: string; mimeType?: string }[];
    bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[];
  };
  const binStart = 20 + jsonLength + 8;
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined) continue;
    const bv = json.bufferViews[image.bufferView]!;
    const bytes = Buffer.from(
      glb.subarray(binStart + (bv.byteOffset ?? 0), binStart + (bv.byteOffset ?? 0) + bv.byteLength),
    );
    const marker = /;([0-9a-f]{32});$/.exec(
      bytes.subarray(Math.max(0, bytes.length - 36)).toString('latin1'),
    );
    const uri = marker && uriByHash.get(marker[1]!);
    if (uri) {
      delete image.bufferView;
      image.uri = uri;
    }
  }
  let text = JSON.stringify(json);
  while (Buffer.byteLength(text) % 4 !== 0) text += ' ';
  const jsonBytes = Buffer.from(text);
  const rest = glb.subarray(20 + jsonLength);
  const out = Buffer.alloc(20 + jsonBytes.length + rest.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonBytes.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(out, 20);
  Buffer.from(rest).copy(out, 20 + jsonBytes.length);
  return out;
}

/** Image hashes (with size and type) embedded by this GLB; used to find the textures that several models share. */
export async function embeddedImages(
  source: Uint8Array,
): Promise<{ hash: string; size: number; mimeType: string }[]> {
  const doc = await (await io()).readBinary(source);
  return doc
    .getRoot()
    .listTextures()
    .map((t) => ({
      hash: imageHash(t.getImage()!),
      size: t.getImage()!.byteLength,
      mimeType: t.getMimeType(),
    }));
}

/** Compressed bytes (verified equivalent), or the input unchanged with the reason. Never throws. */
export async function optimizeGlb(
  source: Uint8Array,
  /** md5 -> file name of textures shared by several models: they leave the model and are referenced by uri. */
  shared: ReadonlyMap<string, string> = new Map(),
): Promise<{ bytes: Uint8Array; report: OptimizeReport; externals: ExternalImage[] }> {
  const keep = (
    reason: string,
  ): { bytes: Uint8Array; report: OptimizeReport; externals: ExternalImage[] } => ({
    bytes: source,
    report: { before: source.byteLength, after: source.byteLength, used: false, reason },
    externals: [],
  });
  try {
    const nodeIo = await io();
    const original = await nodeIo.readBinary(source);
    const doc = await nodeIo.readBinary(source);
    // shared textures leave the model: a unique placeholder keeps `dedup` from merging different ones
    const externals = new Map<string, ExternalImage>();
    for (const t of doc.getRoot().listTextures()) {
      const bytes = t.getImage()!;
      const hash = imageHash(bytes);
      const name = shared.get(hash);
      if (!name || bytes.byteLength < MIN_SHARED_BYTES) continue;
      externals.set(hash, { name, mimeType: t.getMimeType(), bytes: Uint8Array.from(bytes) });
      t.setImage(placeholderFor(hash));
    }
    // LOSSLESS: vertices stay Float32 in their original space (no quantisation, so no node transform is added and game code
    // that bakes node matrices into raw vertex arrays - AssetLibrary.parts() - sees exactly what it always saw)
    await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
    doc
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    let out: Uint8Array = await nodeIo.writeBinary(doc);
    const check = verifyEquivalent(original, await nodeIo.readBinary(out));
    if (externals.size > 0)
      out = patchExternalImages(out, new Map([...externals].map(([hash, e]) => [hash, e.name])));
    if (out.byteLength >= source.byteLength && externals.size === 0) return keep('not smaller');
    return {
      bytes: out,
      report: { before: source.byteLength, after: out.byteLength, used: true, ...check },
      externals: [...externals.values()],
    };
  } catch (error) {
    return keep(error instanceof Error ? error.message : String(error));
  }
}
