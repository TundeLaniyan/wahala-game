import { Group } from 'three';
import type { Object3D } from 'three';
import type { CharacterId } from '../../sim';
import { LOOKS } from '../../assets/looks';
import { box, cyl, mat, pivot, sphere } from './helpers';
import { bakeDirect } from './merge';
import { assets } from './library';
import { RiggedCharacter } from './rigged';
import { addRim } from './rim';

/** The Okada is drawn larger than true scale against the stylised riders so wheels and front end stay visible. */
export const OKADA_SCALE = 1.55;

export interface PlayerModel {
  root: Group;
  /** Everything that bobs/leans as one (so the Okada rider can be raised). */
  rig: Group;
  legL: Group;
  legR: Group;
  armL: Group;
  armR: Group;
  head: Group;
  torso: Group;
  bike: Group;
  /** Set when the glTF character is available; limb groups above are then unused placeholders. */
  rigged: RiggedCharacter | null;
  /** Okada wheels (spun while riding) when the modelled bike is loaded. */
  bikeWheels: Object3D[];
}

/** Procedural fallback character, used only when the glTF cast is not loaded. */
export function createPlayerModel(id: CharacterId): PlayerModel {
  const look = LOOKS[id];
  const skin = mat(look.skin, { roughness: 0.7 });
  const hair = mat(look.hair, { roughness: 0.9 });
  const top = mat(look.top, { roughness: 0.65 });
  const accent = mat(look.topAccent, { roughness: 0.6 });
  const shorts = mat(look.shorts, { roughness: 0.7 });
  const shoes = mat(look.shoes, { roughness: 0.5 });

  const root = new Group();
  const rig = new Group();
  root.add(rig);

  const legL = pivot(
    -0.08,
    0.3,
    0,
    box(0.1, 0.3, 0.11, shorts, 0, -0.06, 0),
    box(0.095, 0.12, 0.095, skin, 0, -0.2, 0),
    box(0.12, 0.06, 0.16, shoes, 0, -0.27, 0.025),
  );
  const legR = pivot(
    0.08,
    0.3,
    0,
    box(0.1, 0.3, 0.11, shorts, 0, -0.06, 0),
    box(0.095, 0.12, 0.095, skin, 0, -0.2, 0),
    box(0.12, 0.06, 0.16, shoes, 0, -0.27, 0.025),
  );
  const torso = pivot(
    0,
    0.3,
    0,
    box(0.32, 0.34, 0.2, top, 0, 0.18, 0),
    box(0.33, 0.06, 0.205, accent, 0, 0.12, 0),
  );
  const armL = pivot(
    -0.2,
    0.46,
    0,
    box(0.09, 0.26, 0.09, id === 'lekkiBoy' ? top : skin, 0, -0.1, 0),
    box(0.08, 0.07, 0.08, skin, 0, -0.25, 0),
  );
  const armR = pivot(
    0.2,
    0.46,
    0,
    box(0.09, 0.26, 0.09, id === 'lekkiBoy' ? top : skin, 0, -0.1, 0),
    box(0.08, 0.07, 0.08, skin, 0, -0.25, 0),
  );
  const head = pivot(0, 0.68, 0, sphere(0.15, skin, 0, 0.1, 0, 12));
  const eyeMat = mat(0x111111);
  head.add(sphere(0.025, eyeMat, -0.06, 0.12, 0.13, 6), sphere(0.025, eyeMat, 0.06, 0.12, 0.13, 6));
  head.add(box(0.07, 0.015, 0.02, mat(0x3a1a12), 0, 0.04, 0.145));

  if (id === 'streetBaller') {
    head.add(sphere(0.158, hair, 0, 0.16, -0.02, 10)); // short twists
    for (let i = 0; i < 5; i++) head.add(sphere(0.045, hair, -0.1 + i * 0.05, 0.27, 0.02, 6));
    torso.add(box(0.05, 0.3, 0.205, accent, 0, 0.18, 0)); // jersey stripe
  } else if (id === 'lekkiBoy') {
    head.add(sphere(0.155, hair, 0, 0.15, -0.015, 10)); // fade
    head.add(box(0.28, 0.06, 0.05, mat(0x0a0a0a, { roughness: 0.2 }), 0, 0.13, 0.145)); // shades
    torso.add(box(0.26, 0.1, 0.1, top, 0, 0.3, -0.12)); // hood
  } else {
    head.add(sphere(0.158, hair, 0, 0.16, -0.02, 10));
    head.add(sphere(0.07, hair, -0.12, 0.27, -0.02, 8), sphere(0.07, hair, 0.12, 0.27, -0.02, 8)); // hair puffs
    head.add(box(0.3, 0.03, 0.04, accent, 0, 0.22, 0.04)); // headband
  }
  for (const part of [legL, legR, armL, armR, head, torso]) bakeDirect(part);
  torso.add(head);
  rig.add(legL, legR, torso, armL, armR);

  const bike = createOkada();
  root.add(bike);
  return { root, rig, legL, legR, armL, armR, head, torso, bike, rigged: null, bikeWheels: [] };
}

/** Okada (a rideable motorcycle, NOT an attack vehicle). Forward axis is rotated to character +Z. */
export function createOkada(): Group {
  const bike = new Group();
  const frame = mat(0xffd21a, { roughness: 0.5, metalness: 0.2 });
  const black = mat(0x1a1a1a, { roughness: 0.7 });
  const chrome = mat(0xc9ced6, { roughness: 0.3, metalness: 0.7 });
  bike.add(box(0.7, 0.12, 0.2, frame, 0, 0.3, 0));
  bike.add(box(0.28, 0.1, 0.2, black, -0.05, 0.38, 0)); // seat
  bike.add(box(0.16, 0.2, 0.14, frame, 0.22, 0.4, 0)); // tank
  for (const x of [-0.3, 0.3]) {
    const wheel = cyl(0.16, 0.16, 0.08, black, x, 0.16, 0, 14);
    wheel.rotation.x = Math.PI / 2;
    bike.add(wheel);
    const hub = cyl(0.07, 0.07, 0.09, chrome, x, 0.16, 0, 8);
    hub.rotation.x = Math.PI / 2;
    bike.add(hub);
  }
  bike.add(box(0.04, 0.26, 0.04, chrome, 0.32, 0.4, 0.06), box(0.04, 0.26, 0.04, chrome, 0.32, 0.4, -0.06));
  bike.add(box(0.05, 0.05, 0.34, chrome, 0.34, 0.54, 0)); // handlebar
  bike.add(sphere(0.045, mat(0xfff6c0, { emissive: 0xffe9a0, emissiveIntensity: 1 }), 0.4, 0.46, 0, 8));
  bike.add(box(0.2, 0.04, 0.22, black, -0.38, 0.38, 0)); // rack
  bakeDirect(bike);
  bike.visible = false;
  // The bike's forward axis is +X; characters face +Z, so rotate the bike to match.
  bike.rotation.y = -Math.PI / 2;
  return bike;
}

/** The rigged glTF character wrapped in the same shape as the procedural one; null if not loaded. */
export function createRiggedPlayerModel(id: CharacterId | string, phase = 0): PlayerModel | null {
  const rigged = RiggedCharacter.create(id, phase);
  if (!rigged) return null;
  const root = new Group();
  root.add(rigged.holder);
  const glbBike = assets.instance('veh_okada');
  let bike: Group;
  let bikeWheels: Object3D[] = [];
  if (glbBike) {
    // Modelled in game units, so it sits beside (not inside) the model-metre holder.
    bike = new Group();
    glbBike.scale.setScalar(OKADA_SCALE);
    addRim(glbBike, 0xffe08a, 0.34, 2.4); // golden edge: the bike itself signals the one-hit shield
    bike.add(glbBike);
    bike.visible = false;
    root.add(bike);
    bikeWheels = ['wheel_F', 'wheel_R']
      .map((n) => glbBike.getObjectByName(n))
      .filter((w): w is Object3D => !!w);
  } else {
    bike = createOkada();
    bike.scale.setScalar(1.5);
    rigged.holder.add(bike);
  }
  const none = (): Group => new Group();
  return {
    root,
    rig: rigged.holder,
    legL: none(),
    legR: none(),
    armL: none(),
    armR: none(),
    head: none(),
    torso: none(),
    bike,
    rigged,
    bikeWheels,
  };
}
