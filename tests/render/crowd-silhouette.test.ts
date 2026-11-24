/**
 * The local fighter's crowd silhouette (decision PIV2): the pure rule, the materials that implement it, and the quality
 * ladder field that switches it. Render-only: nothing here touches the simulation, the AI or the input.
 */
import {
  AlwaysStencilFunc,
  Bone,
  BoxGeometry,
  EqualStencilFunc,
  Float32BufferAttribute,
  GreaterDepth,
  Group,
  MeshStandardMaterial,
  ReplaceStencilOp,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three';
import type { Material, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import {
  CROWD_OPACITY,
  STENCIL_LOCAL,
  STENCIL_NONE,
  STENCIL_REQUIRED,
  STENCIL_RIVAL,
  crowdSilhouetteColor,
  silhouetteShows,
} from '../../src/render/crowdSilhouette';
import { addXray } from '../../src/render/assets/xray';
import { MAX_RUNG, profileFor, rungOfPreset } from '../../src/render/quality';

/** A one-bone skinned box, the shape of a character body: its material is shared with other copies, as in the library. */
function body(material: Material): { root: Group; mesh: SkinnedMesh } {
  const geo = new BoxGeometry(1, 1, 1);
  const n = geo.getAttribute('position').count;
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
  geo.setAttribute(
    'skinWeight',
    new Float32BufferAttribute(
      new Array(n).fill(0).flatMap(() => [1, 0, 0, 0]),
      4,
    ),
  );
  const mesh = new SkinnedMesh(geo, material);
  const bone = new Bone();
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  const root = new Group();
  root.add(mesh);
  return { root, mesh };
}

/** What the renderer does for one draw: object.onBeforeRender, then the stencil state read from the material. */
function stencilWrittenBy(mesh: SkinnedMesh, material: Material): number {
  mesh.onBeforeRender({} as never, {} as never, {} as never, {} as never, material, {} as never);
  const ref = material.stencilWrite ? material.stencilRef : -1;
  mesh.onAfterRender({} as never, {} as never, {} as never, {} as never, material, {} as never);
  return ref;
}

describe('the pixel rule', () => {
  const behind = { fighterDepth: 0.6, bufferDepth: 0.4 };
  const free = { fighterDepth: 0.4, bufferDepth: 0.4 };

  it('a rival in front of the local fighter shows the crowd silhouette', () => {
    expect(silhouetteShows('crowd', { stencil: STENCIL_RIVAL, ...behind })).toBe(true);
  });

  it('a wall, building, crate or prop in front never does (stencil 0 there)', () => {
    expect(silhouetteShows('crowd', { stencil: STENCIL_NONE, ...behind })).toBe(false);
  });

  it("the fighter's own body never tints itself, and nothing in front means nothing to show", () => {
    expect(silhouetteShows('crowd', { stencil: STENCIL_LOCAL, ...behind })).toBe(false);
    expect(silhouetteShows('crowd', { stencil: STENCIL_RIVAL, ...free })).toBe(false);
    expect(silhouetteShows('crowd', { stencil: STENCIL_RIVAL, fighterDepth: 0.3, bufferDepth: 0.4 })).toBe(
      false,
    );
  });

  it('the older wall silhouette stays exactly where it was: behind scenery, never over any fighter', () => {
    expect(silhouetteShows('wall', { stencil: STENCIL_NONE, ...behind })).toBe(true);
    expect(silhouetteShows('wall', { stencil: STENCIL_RIVAL, ...behind })).toBe(false);
    expect(silhouetteShows('wall', { stencil: STENCIL_LOCAL, ...behind })).toBe(false);
  });

  it('the three stencil values are distinct and 0 is the neutral one a cleared buffer holds', () => {
    expect(new Set([STENCIL_NONE, STENCIL_RIVAL, STENCIL_LOCAL]).size).toBe(3);
    expect(STENCIL_NONE).toBe(0);
  });

  it("the crowd colour is the fighter's colour, lighter", () => {
    expect(crowdSilhouetteColor(0x000000)).toBeGreaterThan(0);
    const c = crowdSilhouetteColor(0x2a8c4a);
    expect((c >> 16) & 255).toBeGreaterThan(0x2a);
    expect((c >> 8) & 255).toBeGreaterThan(0x8c);
    expect(c & 255).toBeGreaterThan(0x4a);
    expect(crowdSilhouetteColor(0xffffff)).toBe(0xffffff);
  });
});

describe('the materials implement the rule (render/assets/xray.ts)', () => {
  const shared = new MeshStandardMaterial();

  it('a rival gets the wall twin only; the local fighter also gets hidden crowd twins', () => {
    const rival = body(shared);
    const rivalHandle = addXray(rival.root, 0xff0000);
    expect(rivalHandle.crowd).toHaveLength(0);
    const local = body(shared);
    const handle = addXray(local.root, 0x00ff00, { local: true });
    expect(handle.crowd).toHaveLength(1);
    expect(handle.crowd.every((c) => !c.visible)).toBe(true);
    handle.setCrowd(true);
    expect(handle.crowd.every((c) => c.visible)).toBe(true);
    handle.setCrowd(false);
    expect(handle.crowd.every((c) => !c.visible)).toBe(true);
  });

  it('the crowd twin draws only where something is in front, and only a rival counts; it never writes depth or stencil', () => {
    const { root } = body(new MeshStandardMaterial());
    const { crowd } = addXray(root, 0x00ff00, { local: true });
    const m = crowd[0]!.material as MeshBasicMaterial;
    expect(m.depthFunc).toBe(GreaterDepth);
    expect(m.depthWrite).toBe(false);
    expect(m.stencilFunc).toBe(EqualStencilFunc);
    expect(m.stencilRef).toBe(STENCIL_REQUIRED.crowd);
    expect(m.stencilRef).toBe(STENCIL_RIVAL);
    expect(m.stencilZPass).not.toBe(ReplaceStencilOp); // a twin leaves the stencil as it found it
    expect(m.opacity).toBe(CROWD_OPACITY);
    expect(m.transparent).toBe(true);
    expect(crowd[0]!.skeleton).toBeDefined();
  });

  it('the wall twin now requires stencil 0 (no fighter at the pixel); rivals and the local fighter are both excluded', () => {
    const { root } = body(new MeshStandardMaterial());
    addXray(root, 0xff0000);
    const twin = root.children.find((c) => c !== root.children[0])! as SkinnedMesh;
    const m = twin.material as MeshBasicMaterial;
    expect(m.stencilFunc).toBe(EqualStencilFunc);
    expect(m.stencilRef).toBe(STENCIL_NONE);
    expect(m.depthFunc).toBe(GreaterDepth);
  });

  it('each fighter mesh writes its own stencil value though the body material is shared, and restores the neutral one', () => {
    const rival = body(shared);
    const local = body(shared);
    addXray(rival.root, 0xff0000);
    addXray(local.root, 0x00ff00, { local: true });
    expect(shared.stencilWrite).toBe(true);
    expect(shared.stencilFunc).toBe(AlwaysStencilFunc);
    // interleaved draws, as the renderer sorts them
    expect(stencilWrittenBy(rival.mesh, shared)).toBe(STENCIL_RIVAL);
    expect(stencilWrittenBy(local.mesh, shared)).toBe(STENCIL_LOCAL);
    expect(stencilWrittenBy(rival.mesh, shared)).toBe(STENCIL_RIVAL);
    // a copy that sets nothing (a background person on the same material) writes the neutral value
    expect(shared.stencilRef).toBe(STENCIL_NONE);
  });
});

describe('the quality ladder field `crowdSilhouette`', () => {
  it('is off on the two Very Low rungs and on from Low up', () => {
    expect(profileFor(0).crowdSilhouette).toBe(false);
    expect(profileFor(1).crowdSilhouette).toBe(false);
    expect(profileFor(rungOfPreset('low')).crowdSilhouette).toBe(true);
    expect(profileFor(MAX_RUNG).crowdSilhouette).toBe(true);
  });

  it('never gets more expensive going down: non-decreasing up the ladder', () => {
    for (let r = 1; r <= MAX_RUNG; r++)
      expect(Number(profileFor(r).crowdSilhouette), `rung ${r}`).toBeGreaterThanOrEqual(
        Number(profileFor(r - 1).crowdSilhouette),
      );
  });
});
