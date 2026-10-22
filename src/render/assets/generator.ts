import { AdditiveBlending, CylinderGeometry, Group, Sprite, SpriteMaterial } from 'three';
import type { Mesh, MeshStandardMaterial } from 'three';
import { glowTexture } from '../textures';
import { box, cyl, mat, mesh, pivot, sphere, torus, uniqueMat } from './helpers';
import { assets } from './library';
import { bakeDirect } from './merge';

export interface GeneratorModel {
  root: Group;
  /** Body that shakes as the fuse runs down. */
  body: Group;
  lamp: Mesh;
  lampMaterial: MeshStandardMaterial;
  glow: Sprite;
  antenna: Group;
  casingMaterial: MeshStandardMaterial;
}

/**
 * A Nigerian "I-pass-my-neighbour" portable petrol generator: red casing, tube frame, fuel tank,
 * pull-start and exhaust. Unmistakable at a glance so every flame has an obvious source.
 */
export function createGeneratorModel(): GeneratorModel {
  return createGlbGenerator() ?? createProceduralGenerator();
}

function glowSprite(): Sprite {
  const glow = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: 0xff4020,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  glow.scale.set(0.9, 0.9, 1);
  glow.position.set(0, 0.35, 0);
  glow.material.opacity = 0;
  return glow;
}

/**
 * The modelled generator (`gen_generator.glb`): a node `lamp` (emissive indicator), a node `antenna`
 * (remote aerial) and a material named `casing` which the views recolour per generator mode.
 */
function createGlbGenerator(): GeneratorModel | null {
  const inst = assets.instance('gen_generator');
  if (!inst) return null;
  const root = new Group();
  const body = new Group();
  body.add(inst);
  root.add(body);
  let casingMaterial: MeshStandardMaterial | null = null;
  let lamp: Mesh | null = null;
  inst.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as MeshStandardMaterial;
    if (mat.name === 'casing') {
      casingMaterial ??= mat.clone();
      m.material = casingMaterial;
    }
  });
  const lampNode = inst.getObjectByName('lamp');
  lampNode?.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && !lamp) lamp = m;
  });
  const antenna = inst.getObjectByName('antenna') ?? new Group();
  antenna.visible = false;
  if (!casingMaterial || !lamp) return null;
  const lampMesh: Mesh = lamp;
  const lampMaterial = (lampMesh.material as MeshStandardMaterial).clone();
  lampMesh.material = lampMaterial;
  lampMesh.castShadow = false;
  const glow = glowSprite();
  root.add(glow);
  return { root, body, lamp: lampMesh, lampMaterial, glow, antenna: antenna as Group, casingMaterial };
}

function createProceduralGenerator(): GeneratorModel {
  const root = new Group();
  const body = new Group();
  root.add(body);

  const casingMaterial = uniqueMat(0xffc61a, { roughness: 0.42, metalness: 0.15 });
  const dark = mat(0x1c1e22, { roughness: 0.55, metalness: 0.35 });
  const metal = mat(0x1e2024, { roughness: 0.45, metalness: 0.7 });

  body.add(box(0.62, 0.07, 0.5, dark, 0, 0.04, 0));
  body.add(box(0.5, 0.3, 0.38, casingMaterial, -0.03, 0.24, 0));
  body.add(box(0.12, 0.26, 0.34, dark, 0.26, 0.22, 0)); // alternator end
  const tank = cyl(0.12, 0.12, 0.34, mat(0xf2b01c, { roughness: 0.4 }), -0.05, 0.47, 0, 12);
  tank.rotation.z = Math.PI / 2;
  body.add(tank);
  body.add(cyl(0.04, 0.04, 0.06, dark, 0.08, 0.6, 0, 8));
  // tube frame
  for (const [x, z] of [
    [-0.3, -0.24],
    [-0.3, 0.24],
    [0.3, -0.24],
    [0.3, 0.24],
  ] as const) {
    body.add(box(0.035, 0.52, 0.035, metal, x, 0.3, z));
  }
  body.add(box(0.66, 0.035, 0.035, metal, 0, 0.56, -0.24));
  body.add(box(0.66, 0.035, 0.035, metal, 0, 0.56, 0.24));
  body.add(box(0.035, 0.035, 0.5, metal, -0.3, 0.56, 0));
  body.add(box(0.035, 0.035, 0.5, metal, 0.3, 0.56, 0));
  // control panel + pull handle + exhaust
  body.add(box(0.2, 0.12, 0.02, mat(0x101418), -0.03, 0.27, 0.2));
  body.add(
    box(0.06, 0.05, 0.005, mat(0x40e0ff, { emissive: 0x2090c0, emissiveIntensity: 0.8 }), -0.08, 0.28, 0.212),
  );
  body.add(torus(0.05, 0.012, dark, -0.3, 0.3, 0));
  const exhaust = cyl(0.035, 0.035, 0.22, metal, 0.3, 0.14, -0.2, 8);
  body.add(exhaust);
  // brand-less decal stripe
  body.add(box(0.5, 0.05, 0.385, mat(0xffffff), -0.03, 0.3, 0));

  // Static casing parts become a few merged meshes; the casing material stays unique so it can recolour per mode.
  bakeDirect(body);

  const lampMaterial = uniqueMat(0xff2200, { emissive: 0xff2200, emissiveIntensity: 1.5 });
  const lamp = mesh(new CylinderGeometry(0.04, 0.04, 0.05, 10), lampMaterial, 0.1, 0.43, 0.18);
  lamp.castShadow = false;
  body.add(lamp);

  const antenna = pivot(0.24, 0.5, 0.16);
  const stalk = box(0.015, 0.34, 0.015, mat(0x333333), 0, 0.17, 0);
  const ball = sphere(0.035, mat(0xff3c8c, { emissive: 0xff3c8c, emissiveIntensity: 1.2 }), 0, 0.36, 0, 8);
  antenna.add(stalk, ball);
  antenna.visible = false;
  body.add(antenna);

  const glow = glowSprite();
  root.add(glow);

  return { root, body, lamp, lampMaterial, glow, antenna, casingMaterial };
}
