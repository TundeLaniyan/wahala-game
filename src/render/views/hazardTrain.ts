/**
 * The commuter railcar that runs the Oshodi track lanes (stage hazard style `train`). Presentation only. Built
 * procedurally in the same frame as the other sweep vehicles (faces +X, wheels spun about Z, drawn at
 * `VEHICLE_SCALE`) so the sweep view can drive it exactly like a Danfo or the Apapa truck: one 1.9 m car with a
 * blunt cab at each end, a dark window band, a yellow warning nose and a livery colour picked by the event id.
 * It is deliberately a single short car: the sim's lethal footprint is the tile it occupies (and the one it is
 * leaving), so the picture never claims more length than the hazard has.
 */
import { Group, Mesh } from 'three';
import { box, cyl, mat, sphere } from '../assets/helpers';
import type { VehicleModel } from '../assets/vehicles';

const LIVERY = [0x2e5a86, 0x8a3a2a, 0x3a6a52, 0x5a5e66];

function bogie(x: number, z: number): Group {
  const g = new Group();
  g.position.set(x, 0.1, z);
  const wheel = cyl(0.1, 0.1, 0.06, mat(0x3a3c3e, { roughness: 0.5, metalness: 0.7 }), 0, 0, 0, 10);
  wheel.rotation.x = Math.PI / 2;
  g.add(wheel);
  return g;
}

/** A railcar, livery picked by `seed` (the stage event id). */
export function createHazardTrain(seed: number): VehicleModel {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const wheels: Group[] = [];
  const paint = mat(LIVERY[seed % LIVERY.length]!, { roughness: 0.45, metalness: 0.3 });
  const cream = mat(0xd8d4c4, { roughness: 0.6 });
  const dark = mat(0x161c22, { roughness: 0.25, metalness: 0.5 });
  const steel = mat(0x4a4c50, { roughness: 0.5, metalness: 0.6 });
  const yellow = mat(0xe0b020, { roughness: 0.5 });
  const lamp = mat(0xfff2c0, { emissive: 0xffe39a, emissiveIntensity: 1.3 });
  const tail = mat(0xff3030, { emissive: 0xff1010, emissiveIntensity: 0.8 });
  body.add(box(1.9, 0.12, 0.62, steel, 0, 0.2, 0)); // underframe
  body.add(box(1.9, 0.62, 0.78, paint, 0, 0.62, 0)); // the car
  body.add(box(1.92, 0.07, 0.8, cream, 0, 0.97, 0)); // roof
  body.add(box(0.8, 0.07, 0.4, steel, -0.1, 1.04, 0)); // roof gear
  body.add(box(1.7, 0.26, 0.8, dark, 0, 0.74, 0)); // window band, both sides
  for (let i = 0; i < 6; i++)
    for (const z of [-0.395, 0.395]) body.add(box(0.03, 0.26, 0.02, cream, -0.78 + i * 0.31, 0.74, z));
  body.add(box(0.05, 0.4, 0.62, dark, 0.96, 0.7, 0)); // cab windscreen
  body.add(box(0.06, 0.22, 0.78, yellow, 0.95, 0.42, 0)); // yellow warning nose
  body.add(sphere(0.045, lamp, 0.97, 0.48, 0.24, 6), sphere(0.045, lamp, 0.97, 0.48, -0.24, 6));
  body.add(box(0.03, 0.07, 0.12, tail, -0.96, 0.4, 0.28), box(0.03, 0.07, 0.12, tail, -0.96, 0.4, -0.28));
  for (const [x, z] of [
    [0.55, 0.36],
    [0.55, -0.36],
    [-0.55, 0.36],
    [-0.55, -0.36],
  ] as const) {
    const b = bogie(x, z);
    wheels.push(b);
    body.add(b);
  }
  root.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = true;
  });
  // `kind` drives exhaust timing only; the railcar is never a Danfo for the voices (see stagePresentation)
  return { root, body, wheels, kind: 'taxi' };
}
