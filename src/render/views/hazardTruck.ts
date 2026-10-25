/**
 * The articulated container truck that drives the Apapa port roads (stage hazard style `truck`).
 * Presentation only. Built procedurally in the same frame as the procedural vehicles of
 * `render/assets/vehicles.ts` (faces +X, wheels spun about Z, drawn at `VEHICLE_SCALE`) so the sweep
 * view can drive it exactly like a Danfo: a prime mover with a high cab and a short flatbed carrying a
 * ribbed container in a faded colour.
 */
import { CanvasTexture, Group, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Material } from 'three';
import { box, cyl, mat, sphere } from '../assets/helpers';
import type { VehicleModel } from '../assets/vehicles';

const CONTAINER = [0x8a3a26, 0x2e5a7a, 0x3e6a48, 0x9a8a5e, 0x6a6e72];
const CAB = [0xc8c4b8, 0x2e5a7a, 0x8a2a20, 0xb8902a];

let ribs: CanvasTexture | null = null;
function ribMap(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (!ribs) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 16;
    const g = c.getContext('2d')!;
    for (let x = 0; x < 64; x += 8) {
      g.fillStyle = '#ffffff';
      g.fillRect(x, 0, 5, 16);
      g.fillStyle = '#9a9a9a';
      g.fillRect(x + 5, 0, 3, 16);
    }
    ribs = new CanvasTexture(c);
    ribs.wrapS = ribs.wrapT = RepeatWrapping;
    ribs.repeat.set(5, 1);
    ribs.colorSpace = SRGBColorSpace;
  }
  return ribs;
}

const containerMats = new Map<number, Material>();
function containerMat(color: number): Material {
  let m = containerMats.get(color);
  if (!m) {
    m = new MeshStandardMaterial({ color, map: ribMap(), roughness: 0.7, metalness: 0.35 });
    containerMats.set(color, m);
  }
  return m;
}

function wheel(x: number, z: number, r: number): Group {
  const g = new Group();
  g.position.set(x, r, z);
  const tyre = cyl(r, r, 0.12, mat(0x151515, { roughness: 0.9 }), 0, 0, 0, 12);
  tyre.rotation.x = Math.PI / 2;
  const hub = cyl(r * 0.5, r * 0.5, 0.13, mat(0x8a8c88, { metalness: 0.6, roughness: 0.4 }), 0, 0, 0, 8);
  hub.rotation.x = Math.PI / 2;
  g.add(tyre, hub);
  return g;
}

/** A container truck, colours picked by `seed` (the stage event id). */
export function createHazardTruck(seed: number): VehicleModel {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const wheels: Group[] = [];
  const cab = mat(CAB[seed % CAB.length]!, { roughness: 0.5, metalness: 0.2 });
  const black = mat(0x1a1a1a, { roughness: 0.7, metalness: 0.3 });
  const steel = mat(0x5a5c58, { roughness: 0.55, metalness: 0.6 });
  const glass = mat(0x1d2a3a, { roughness: 0.15, metalness: 0.4 });
  const light = mat(0xfff2b8, { emissive: 0xffe39a, emissiveIntensity: 1.2 });
  const tail = mat(0xff3030, { emissive: 0xff1010, emissiveIntensity: 0.8 });
  // the prime mover at the front (+X): chassis, high cab, grille, windscreen, exhaust stack
  body.add(box(2.45, 0.14, 0.5, black, -0.15, 0.3, 0)); // chassis rails under everything
  body.add(box(0.58, 0.62, 0.76, cab, 0.82, 0.72, 0));
  body.add(box(0.06, 0.3, 0.6, steel, 1.12, 0.56, 0)); // grille
  body.add(box(0.03, 0.26, 0.66, glass, 1.1, 0.88, 0)); // windscreen
  for (const z of [-0.385, 0.385]) body.add(box(0.3, 0.2, 0.02, glass, 0.86, 0.88, z));
  body.add(box(0.5, 0.06, 0.78, black, 0.82, 1.05, 0)); // roof visor
  const stack = cyl(0.03, 0.03, 0.55, steel, 0.5, 1.0, 0.33, 6);
  body.add(stack);
  body.add(sphere(0.05, light, 1.13, 0.42, 0.28, 6), sphere(0.05, light, 1.13, 0.42, -0.28, 6));
  // the flatbed trailer with its container, a black band and door bars at the back
  body.add(box(1.85, 0.08, 0.78, steel, -0.5, 0.42, 0));
  body.add(box(1.76, 0.74, 0.76, containerMat(CONTAINER[seed % CONTAINER.length]!), -0.5, 0.84, 0));
  for (let k = 0; k < 4; k++) body.add(box(0.02, 0.66, 0.025, steel, -1.39, 0.84, -0.27 + k * 0.18));
  body.add(box(0.03, 0.07, 0.12, tail, -1.42, 0.38, 0.3), box(0.03, 0.07, 0.12, tail, -1.42, 0.38, -0.3));
  for (const [x, z] of [
    [0.9, 0.38],
    [0.9, -0.38],
    [0.25, 0.38],
    [0.25, -0.38],
    [-1.0, 0.38],
    [-1.0, -0.38],
    [-1.25, 0.38],
    [-1.25, -0.38],
  ] as const) {
    const w = wheel(x, z, 0.17);
    wheels.push(w);
    body.add(w);
  }
  root.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = true;
  });
  // `kind` drives exhaust timing only; the truck is never a Danfo for the voices (see stagePresentation)
  return { root, body, wheels, kind: 'taxi' };
}
