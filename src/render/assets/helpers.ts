import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { BufferGeometry, Material, Texture } from 'three';

const materials = new Map<string, MeshStandardMaterial>();

export interface MatOptions {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  map?: Texture;
  flat?: boolean;
}

/** Shared standard material (cached by its parameters). Do not mutate; use `uniqueMat` for animated ones. */
export function mat(color: number, o: MatOptions = {}): MeshStandardMaterial {
  const key = `${color}|${o.roughness}|${o.metalness}|${o.emissive}|${o.emissiveIntensity}|${o.map?.uuid}|${o.flat}`;
  let m = materials.get(key);
  if (!m) {
    m = uniqueMat(color, o);
    materials.set(key, m);
  }
  return m;
}

export function uniqueMat(color: number, o: MatOptions = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.78,
    metalness: o.metalness ?? 0.05,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    map: o.map ?? null,
    flatShading: o.flat ?? true,
  });
}

export const basic = (color: number, opacity = 1): MeshBasicMaterial =>
  new MeshBasicMaterial({ color, transparent: opacity < 1, opacity });

export function disposeSharedMaterials(): void {
  for (const m of materials.values()) m.dispose();
  materials.clear();
}

export function mesh(geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const box = (w: number, h: number, d: number, material: Material, x = 0, y = 0, z = 0): Mesh =>
  mesh(new BoxGeometry(w, h, d), material, x, y, z);

export const cyl = (
  rt: number,
  rb: number,
  h: number,
  material: Material,
  x = 0,
  y = 0,
  z = 0,
  seg = 10,
): Mesh => mesh(new CylinderGeometry(rt, rb, h, seg), material, x, y, z);

export const sphere = (r: number, material: Material, x = 0, y = 0, z = 0, seg = 10): Mesh =>
  mesh(new SphereGeometry(r, seg, Math.max(6, seg - 2)), material, x, y, z);

export const torus = (r: number, tube: number, material: Material, x = 0, y = 0, z = 0): Mesh =>
  mesh(new TorusGeometry(r, tube, 8, 14), material, x, y, z);

/** A pivot group positioned at (x,y,z) so children swing around the joint. */
export function pivot(x: number, y: number, z: number, ...children: Mesh[]): Group {
  const g = new Group();
  g.position.set(x, y, z);
  for (const c of children) g.add(c);
  return g;
}
