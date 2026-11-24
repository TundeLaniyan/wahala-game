/**
 * Occlusion silhouettes: where a character is hidden behind a pillar, wall or prop, a flat
 * slot-coloured silhouette is drawn instead, so taller 3D scenery never hides who is where.
 *
 * Every fighter's visible body pixels write a stencil value (render/crowdSilhouette.ts: 1 for a rival, 2 for the local
 * fighter); the silhouette pass draws only where the depth test FAILS against the scene (GreaterDepth) and the stencil
 * is 0, so a character's own limbs and other characters never tint it. The LOCAL fighter additionally gets a second
 * twin (decision PIV2) that draws where the depth test fails and a RIVAL is what is in front, so being overlapped by
 * other fighters never hides you, while walls and props still never trigger it. Requires a renderer created with
 * `stencil: true`.
 */
import {
  AlwaysStencilFunc,
  Color,
  EqualStencilFunc,
  GreaterDepth,
  MeshBasicMaterial,
  ReplaceStencilOp,
  SkinnedMesh,
} from 'three';
import type { Material, Object3D } from 'three';
import {
  CROWD_OPACITY,
  STENCIL_NONE,
  STENCIL_LOCAL,
  STENCIL_REQUIRED,
  STENCIL_RIVAL,
  crowdSilhouetteColor,
} from '../crowdSilhouette';

/**
 * The materials of a character are the library's and shared by every copy (rivals, the local fighter, background
 * people), so the stencil value cannot live on the material: each fighter mesh sets it just before its own draw (the
 * renderer reads it right after `onBeforeRender`) and puts the neutral value back after, so a copy that does not
 * set one (a background person) writes 0.
 */
function markVisible(mesh: SkinnedMesh, ref: number): void {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    m.stencilWrite = true;
    m.stencilRef = STENCIL_NONE;
    m.stencilFunc = AlwaysStencilFunc;
    m.stencilZPass = ReplaceStencilOp;
  }
  mesh.onBeforeRender = (_r, _s, _c, _g, material: Material) => {
    if (material.stencilWrite) material.stencilRef = ref;
  };
  mesh.onAfterRender = (_r, _s, _c, _g, material: Material) => {
    if (material.stencilWrite) material.stencilRef = STENCIL_NONE;
  };
}

export interface XrayHandle {
  /** The local fighter's crowd twins (empty for a rival). */
  crowd: SkinnedMesh[];
  /** Shows or hides the crowd twins (the quality ladder's live switch). */
  setCrowd(on: boolean): void;
}

/**
 * Adds silhouette twins (sharing geometry and skeleton) to every skinned mesh under `body`. `local`: this is the
 * fighter the person controls: its pixels write the local stencil value and it gets the crowd twin (hidden until
 * `setCrowd(true)`).
 */
export function addXray(body: Object3D, color: number, opts: { local?: boolean } = {}): XrayHandle {
  const local = opts.local === true;
  const material = new MeshBasicMaterial({
    color: new Color(color).multiplyScalar(0.9),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    depthFunc: GreaterDepth,
    stencilWrite: true,
    stencilRef: STENCIL_REQUIRED.wall,
    stencilFunc: EqualStencilFunc,
  });
  const crowdMaterial = local
    ? new MeshBasicMaterial({
        color: crowdSilhouetteColor(color),
        transparent: true,
        opacity: CROWD_OPACITY,
        depthWrite: false,
        depthFunc: GreaterDepth,
        fog: false,
        toneMapped: false,
        stencilWrite: true,
        stencilRef: STENCIL_REQUIRED.crowd,
        stencilFunc: EqualStencilFunc,
      })
    : null;
  const skinned: SkinnedMesh[] = [];
  body.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
  });
  const crowd: SkinnedMesh[] = [];
  for (const mesh of skinned) {
    markVisible(mesh, local ? STENCIL_LOCAL : STENCIL_RIVAL);
    const twin = new SkinnedMesh(mesh.geometry, material);
    twin.bind(mesh.skeleton, mesh.bindMatrix);
    twin.position.copy(mesh.position);
    twin.quaternion.copy(mesh.quaternion);
    twin.scale.copy(mesh.scale);
    twin.renderOrder = 40;
    twin.frustumCulled = false;
    twin.castShadow = false;
    mesh.parent?.add(twin);
    if (crowdMaterial) {
      const c = new SkinnedMesh(mesh.geometry, crowdMaterial);
      c.bind(mesh.skeleton, mesh.bindMatrix);
      c.position.copy(mesh.position);
      c.quaternion.copy(mesh.quaternion);
      c.scale.copy(mesh.scale);
      c.renderOrder = 39; // under the YOU tag (40), over the name tags and marks (31-33)
      c.frustumCulled = false;
      c.castShadow = false;
      c.visible = false;
      c.name = 'crowdSilhouette';
      mesh.parent?.add(c);
      crowd.push(c);
    }
  }
  return {
    crowd,
    setCrowd(on: boolean): void {
      for (const c of crowd) c.visible = on;
    },
  };
}
