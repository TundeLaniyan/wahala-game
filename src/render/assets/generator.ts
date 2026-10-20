import { AdditiveBlending, CylinderGeometry, Group, Sprite, SpriteMaterial } from 'three';
import type { Mesh, MeshStandardMaterial } from 'three';
import { glowTexture } from '../textures';
import { box, cyl, mat, mesh, pivot, sphere, torus, uniqueMat } from './helpers';

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
  const root = new Group();
  const body = new Group();
  root.add(body);

  const casingMaterial = uniqueMat(0xd8301f, { roughness: 0.55, metalness: 0.2 });
  const dark = mat(0x23201d, { roughness: 0.6, metalness: 0.3 });
  const metal = mat(0xb9bdc4, { roughness: 0.35, metalness: 0.7 });

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
  root.add(glow);

  return { root, body, lamp, lampMaterial, glow, antenna, casingMaterial };
}
