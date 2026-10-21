/**
 * Occlusion silhouettes: where a character is hidden behind a pillar, wall or prop, a flat
 * slot-coloured silhouette is drawn instead, so taller 3D scenery never hides who is where.
 *
 * Visible character pixels write stencil 1; the silhouette pass draws only where the depth test
 * FAILS against the scene (GreaterDepth) and the stencil is not 1, so a character's own limbs
 * never tint it. Requires a renderer created with `stencil: true`.
 */
import {
  AlwaysStencilFunc,
  Color,
  GreaterDepth,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  SkinnedMesh,
} from 'three';
import type { Material, Object3D } from 'three';

const STENCIL = 1;

function markVisible(m: Material): void {
  m.stencilWrite = true;
  m.stencilRef = STENCIL;
  m.stencilFunc = AlwaysStencilFunc;
  m.stencilZPass = ReplaceStencilOp;
}

/** Adds silhouette twins (sharing geometry and skeleton) to every skinned mesh under `body`. */
export function addXray(body: Object3D, color: number): void {
  const material = new MeshBasicMaterial({
    color: new Color(color).multiplyScalar(0.9),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    depthFunc: GreaterDepth,
    stencilWrite: true,
    stencilRef: STENCIL,
    stencilFunc: NotEqualStencilFunc,
  });
  const skinned: SkinnedMesh[] = [];
  body.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
  });
  for (const mesh of skinned) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) markVisible(m);
    const twin = new SkinnedMesh(mesh.geometry, material);
    twin.bind(mesh.skeleton, mesh.bindMatrix);
    twin.position.copy(mesh.position);
    twin.quaternion.copy(mesh.quaternion);
    twin.scale.copy(mesh.scale);
    twin.renderOrder = 40;
    twin.frustumCulled = false;
    twin.castShadow = false;
    mesh.parent?.add(twin);
  }
}
