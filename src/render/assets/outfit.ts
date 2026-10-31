/**
 * Fighter outfits (decision FF1): recolours a rigged character's cloth and adds headwear so the 32 competitor
 * identities (assets/fighterIdentity.ts) read apart at a glance. A controlled variant, not a new asset:
 * the cloth vertex colours are hue-rotated (greys, whites and blacks stay, so trims and shorts keep their
 * detail), the recoloured geometry is cached per character mesh and hue, and the headwear is a few primitives
 * parented to the head bone. Skin, hair, eyes, skeleton, animation and scale are untouched.
 */
import {
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { rotateHue } from '../../assets/fighterIdentity';
import type { FighterIdentity, Headwear } from '../../assets/fighterIdentity';

const recoloured = new Map<string, BufferGeometry>();

/** A copy of `source` whose colour attribute has every colour rotated by `degrees` (neutrals unchanged). */
export function recolourGeometry(source: BufferGeometry, degrees: number): BufferGeometry {
  const key = `${source.uuid}:${degrees}`;
  const hit = recoloured.get(key);
  if (hit) return hit;
  const geometry = source.clone();
  const color = source.getAttribute('color');
  if (color) {
    const size = color.itemSize;
    const out = new Float32Array(color.count * size);
    for (let i = 0; i < color.count; i++) {
      const [r, g, b] = rotateHue([color.getX(i), color.getY(i), color.getZ(i)], degrees);
      out[i * size] = r;
      out[i * size + 1] = g;
      out[i * size + 2] = b;
      if (size > 3) out[i * size + 3] = color.getW(i);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(out, size));
  }
  recoloured.set(key, geometry);
  return geometry;
}

const isCloth = (m: Material | Material[]): boolean => !Array.isArray(m) && m.name === 'cloth';

/** Head geometry in the head bone's local metres, per character model (measured from the glTF files). */
interface HeadFit {
  /** Height of the head's centre above the bone. */
  centre: number;
  /** Radius the headwear has to clear (hair included). */
  radius: number;
}
const HEAD_FIT: Record<string, HeadFit> = {
  streetBaller: { centre: 0.17, radius: 0.205 },
  lekkiBoy: { centre: 0.15, radius: 0.19 },
  campusQueen: { centre: 0.15, radius: 0.2 },
  areaBoss: { centre: 0.16, radius: 0.2 },
};
const DEFAULT_FIT: HeadFit = HEAD_FIT.streetBaller!;

const materials = new Map<number, MeshStandardMaterial>();
function headwearMaterial(color: number): MeshStandardMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02 });
    materials.set(color, m);
  }
  return m;
}

const part = (geometry: BufferGeometry, material: Material, y = 0, z = 0): Mesh => {
  const m = new Mesh(geometry, material);
  m.position.set(0, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/**
 * Headwear for a head of centre `fit.centre` / radius `fit.radius`, built around the origin (the head bone).
 * Shapes differ in silhouette from above and in front: a dome with a forward peak (cap), a taller knit dome
 * with a cuff and pompom (beanie), a dome with a wide all-round brim (bucket hat).
 */
export function buildHeadwear(kind: Headwear, color: number, fit: HeadFit = DEFAULT_FIT): Group | null {
  if (kind === 'none') return null;
  const g = new Group();
  g.name = `headwear_${kind}`;
  const m = headwearMaterial(color);
  const { centre, radius } = fit;
  if (kind === 'cap') {
    const r = radius * 1.02;
    g.add(part(new SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), m, centre + 0.03));
    const peak = new CylinderGeometry(r * 1.15, r * 1.15, 0.02, 16, 1, false, -Math.PI / 2, Math.PI);
    g.add(part(peak, m, centre + 0.03 + r * 0.05, r * 0.2));
  } else if (kind === 'beanie') {
    const r = radius * 1.05;
    g.add(part(new SphereGeometry(r, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), m, centre + 0.035));
    const cuff = new TorusGeometry(r * 0.94, 0.03, 8, 20);
    cuff.rotateX(Math.PI / 2);
    g.add(part(cuff, headwearMaterial(color ^ 0x303030), centre + 0.035 - r * 0.3));
    g.add(part(new SphereGeometry(0.05, 8, 6), headwearMaterial(color ^ 0x303030), centre + 0.035 + r));
  } else {
    const r = radius * 1.0;
    g.add(part(new SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m, centre + 0.04));
    g.add(part(new CylinderGeometry(r * 1.55, r * 1.3, 0.03, 20), m, centre + 0.04 - 0.005));
  }
  return g;
}

/** Applies `identity` to a freshly instanced rigged character (call once, before it is added to the scene). */
export function applyOutfit(body: Object3D, characterId: string, identity: FighterIdentity): void {
  if (identity.hueShift !== 0) {
    body.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && isCloth(mesh.material))
        mesh.geometry = recolourGeometry(mesh.geometry, identity.hueShift);
    });
  }
  const head = body.getObjectByName('head');
  if (!head) return;
  const wear = buildHeadwear(identity.headwear, identity.headwearColor, HEAD_FIT[characterId]);
  if (wear) head.add(wear);
}
