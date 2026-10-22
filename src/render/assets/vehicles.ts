import { Group, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { Object3D } from 'three';
import type { VehicleKind } from '../../sim';
import { labelTexture } from '../textures';
import { box, cyl, mat, mesh, sphere } from './helpers';
import { assets } from './library';
import { bakeDirect } from './merge';

export interface VehicleModel {
  root: Group;
  /** Wheel nodes; spin them with `spinWheel`. */
  wheels: Object3D[];
  /** Everything that tilts/bounces together. */
  body: Group;
  kind: VehicleKind;
  glb?: boolean;
}

function wheel(x: number, z: number, r: number, width: number): Group {
  const g = new Group();
  g.position.set(x, r, z);
  const tyre = cyl(r, r, width, mat(0x151515, { roughness: 0.9 }), 0, 0, 0, 12);
  tyre.rotation.x = Math.PI / 2;
  const hub = cyl(
    r * 0.55,
    r * 0.55,
    width + 0.01,
    mat(0xc9ced6, { metalness: 0.6, roughness: 0.4 }),
    0,
    0,
    0,
    8,
  );
  hub.rotation.x = Math.PI / 2;
  g.add(tyre, hub);
  return g;
}

function sign(text: string, w: number, h: number, color = '#1a1208', bg = 0xffffff): Group {
  const g = new Group();
  g.add(box(w, h, 0.05, mat(bg, { roughness: 0.4 }), 0, 0, 0));
  const front = mesh(
    new PlaneGeometry(w * 0.95, h * 0.85),
    new MeshBasicMaterial({
      map: labelTexture(text, color, 'bold 52px system-ui, sans-serif', 'rgba(0,0,0,0)'),
      transparent: true,
    }),
    0,
    0,
    0.03,
  );
  front.castShadow = false;
  g.add(front);
  return g;
}

const GLB_WHEELS: Record<VehicleKind, string[]> = {
  danfo: ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'],
  taxi: ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'],
  keke: ['wheel_F', 'wheel_RL', 'wheel_RR'],
};

/** Modelled vehicles face +Z with wheel axles along X; the game's convention is +X forward. */
function createGlbVehicle(kind: VehicleKind): VehicleModel | null {
  const inst = assets.instance(`veh_${kind}`);
  if (!inst) return null;
  const root = new Group();
  const body = new Group();
  inst.rotation.y = Math.PI / 2;
  body.add(inst);
  root.add(body);
  const wheels = GLB_WHEELS[kind].map((n) => inst.getObjectByName(n)).filter((w): w is Object3D => !!w);
  return { root, wheels, body, kind };
}

/** Rolls a wheel forward by `angle` radians (GLB wheels spin about their local X axis, procedural ones about Z). */
export function spinWheel(model: VehicleModel, wheel: Object3D, angle: number): void {
  if (model.glb) wheel.rotation.x += angle;
  else wheel.rotation.z -= angle;
}

/** Models face +X; the view rotates them to the travel direction. */
export function createVehicleModel(kind: VehicleKind): VehicleModel {
  const glb = createGlbVehicle(kind);
  if (glb) return { ...glb, glb: true };
  const root = new Group();
  const body = new Group();
  root.add(body);
  const wheels: Group[] = [];
  const glass = mat(0x1d2a3a, { roughness: 0.15, metalness: 0.4 });
  const light = mat(0xfff2b8, { emissive: 0xffe39a, emissiveIntensity: 1.2 });
  const tail = mat(0xff3030, { emissive: 0xff1010, emissiveIntensity: 0.8 });

  if (kind === 'danfo') {
    const yellow = mat(0xffc21a, { roughness: 0.45, metalness: 0.15 });
    const black = mat(0x1a1a1a, { roughness: 0.6 });
    body.add(box(1.5, 0.52, 0.78, yellow, 0, 0.5, 0));
    body.add(box(1.2, 0.34, 0.74, yellow, -0.1, 0.9, 0)); // upper cabin
    body.add(box(1.52, 0.12, 0.8, black, 0, 0.5, 0)); // the famous black band
    body.add(box(0.1, 0.4, 0.74, yellow, 0.72, 0.62, 0)); // nose
    for (const z of [-0.375, 0.375]) {
      for (let i = 0; i < 4; i++) body.add(box(0.22, 0.2, 0.02, glass, -0.5 + i * 0.3, 0.92, z));
    }
    body.add(box(0.03, 0.22, 0.6, glass, 0.52, 0.9, 0)); // windscreen
    body.add(box(1.0, 0.04, 0.5, black, -0.1, 1.09, 0)); // roof rack
    body.add(box(0.9, 0.12, 0.42, mat(0x8a5a2a), -0.1, 1.16, 0)); // luggage
    body.add(sphere(0.06, light, 0.77, 0.58, 0.25, 6), sphere(0.06, light, 0.77, 0.58, -0.25, 6));
    body.add(box(0.03, 0.08, 0.14, tail, -0.76, 0.56, 0.25), box(0.03, 0.08, 0.14, tail, -0.76, 0.56, -0.25));
    const s = sign('DANFO', 0.5, 0.14, '#ffc21a', 0x1a1a1a);
    s.position.set(0.5, 1.12, 0);
    s.rotation.y = Math.PI / 2;
    body.add(s);
    for (const [x, z] of [
      [0.5, 0.4],
      [0.5, -0.4],
      [-0.5, 0.4],
      [-0.5, -0.4],
    ] as const) {
      const w = wheel(x, z, 0.19, 0.12);
      wheels.push(w);
      body.add(w);
    }
  } else if (kind === 'taxi') {
    const cyan = mat(0x00a6e6, { roughness: 0.4, metalness: 0.2 });
    const white = mat(0xf4f7fa, { roughness: 0.35, metalness: 0.15 });
    const black = mat(0x15181e);
    body.add(box(1.2, 0.3, 0.7, cyan, 0, 0.36, 0));
    body.add(box(0.76, 0.28, 0.64, white, -0.06, 0.62, 0));
    for (const z of [-0.325, 0.325]) body.add(box(0.6, 0.2, 0.02, glass, -0.06, 0.64, z));
    body.add(box(0.03, 0.2, 0.52, glass, 0.32, 0.63, 0));
    body.add(box(0.03, 0.2, 0.52, glass, -0.44, 0.63, 0));
    body.add(box(1.22, 0.06, 0.72, black, 0, 0.22, 0));
    const roof = sign('TAXI', 0.3, 0.1, '#101216', 0xffd018);
    roof.position.set(-0.04, 0.84, 0);
    roof.rotation.y = Math.PI / 2;
    body.add(roof);
    body.add(sphere(0.055, light, 0.6, 0.4, 0.24, 6), sphere(0.055, light, 0.6, 0.4, -0.24, 6));
    body.add(box(0.03, 0.07, 0.14, tail, -0.6, 0.4, 0.24), box(0.03, 0.07, 0.14, tail, -0.6, 0.4, -0.24));
    for (const [x, z] of [
      [0.38, 0.36],
      [0.38, -0.36],
      [-0.38, 0.36],
      [-0.38, -0.36],
    ] as const) {
      const w = wheel(x, z, 0.15, 0.1);
      wheels.push(w);
      body.add(w);
    }
  } else {
    const yellow = mat(0xf8c612, { roughness: 0.45, metalness: 0.15 });
    const blackTrim = mat(0x181a1e, { roughness: 0.5 });
    const blackTop = mat(0x22252b, { roughness: 0.75 });
    body.add(box(0.82, 0.26, 0.62, yellow, -0.05, 0.36, 0));
    body.add(box(0.34, 0.3, 0.46, yellow, 0.36, 0.42, 0)); // nose / cab
    body.add(box(0.84, 0.05, 0.64, blackTrim, -0.05, 0.32, 0));
    body.add(box(0.58, 0.07, 0.66, blackTop, -0.15, 0.92, 0)); // dark charcoal canvas canopy
    for (const z of [-0.29, 0.29]) {
      body.add(
        box(0.04, 0.4, 0.04, mat(0x22252b), 0.1, 0.72, z),
        box(0.04, 0.4, 0.04, mat(0x22252b), -0.4, 0.72, z),
      );
    }
    body.add(box(0.5, 0.18, 0.5, mat(0x24262b, { roughness: 0.85 }), -0.15, 0.64, 0)); // bench
    body.add(sphere(0.055, light, 0.55, 0.45, 0, 6));
    body.add(box(0.03, 0.07, 0.14, tail, -0.47, 0.42, 0));
    const front = wheel(0.42, 0, 0.14, 0.09);
    const rl = wheel(-0.3, 0.33, 0.14, 0.09);
    const rr = wheel(-0.3, -0.33, 0.14, 0.09);
    wheels.push(front, rl, rr);
    body.add(front, rl, rr);
    const s = sign('KEKE', 0.3, 0.09, '#f8c612', 0x181a1e);
    s.position.set(0.0, 1.0, 0.0);
    s.rotation.y = Math.PI / 2;
    body.add(s);
  }
  bakeDirect(body);
  return { root, wheels, body, kind };
}
