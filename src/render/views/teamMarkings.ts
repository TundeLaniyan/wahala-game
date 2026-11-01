/**
 * Team Rumble team kit (presentation only): a team-coloured jersey band round the chest and an armband
 * on each upper arm, attached to the rig's bones so they move with every animation, on top of the
 * character's own look (characters stay recognisable). The procedural fallback character gets the
 * same band round its torso. Spawn protection shows as a blinking ring plus a blinking body.
 */
import {
  BackSide,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import type { Object3D } from 'three';
import { TEAM_COLORS, TEAM_OUTLINE } from '../../assets/palette';
import type { PlayerModel } from '../assets/characters';

/** The team's colour (0 Green, 1 White ...). */
export function teamColor(team: number): number {
  return TEAM_COLORS[((team % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length]!;
}

/** Reference shoulder offset (streetBaller's `upperarm_L` x in model metres) the kit is sized for. */
const REF_SHOULDER = 0.1805;

const jerseyGeo = new CylinderGeometry(0.168, 0.15, 0.24, 18, 1, true);
const bandGeo = new CylinderGeometry(0.058, 0.054, 0.075, 12, 1, true);
const UP = new Vector3(0, 1, 0);

function kitMaterial(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, side: DoubleSide });
}

/** The dark outline every team kit wears (so the white team reads on a pale floor), drawn as a larger back-face shell. */
const outlineMaterial = new MeshBasicMaterial({ color: TEAM_OUTLINE, side: BackSide });
function outlineOf(mesh: Mesh): Mesh {
  const o = new Mesh(mesh.geometry, outlineMaterial);
  o.name = `${mesh.name}_outline`;
  o.position.copy(mesh.position);
  o.quaternion.copy(mesh.quaternion);
  o.scale.copy(mesh.scale).multiplyScalar(1.12);
  return o;
}

/**
 * Adds the team kit to a character model. Returns the added meshes (empty when the rig has no bones
 * with the expected names: the ring and name tag still carry the team).
 */
export function addTeamKit(model: PlayerModel, team: number): Object3D[] {
  const color = teamColor(team);
  const mat = kitMaterial(color);
  const added: Object3D[] = [];
  const body = model.rigged?.body;
  if (body) {
    const chest = body.getObjectByName('chest');
    const armL = body.getObjectByName('upperarm_L');
    const armR = body.getObjectByName('upperarm_R');
    const shoulder = Math.abs(armL?.position.x ?? REF_SHOULDER) || REF_SHOULDER;
    const k = shoulder / REF_SHOULDER;
    if (chest) {
      const jersey = new Mesh(jerseyGeo, mat);
      jersey.name = 'team_jersey';
      jersey.position.set(0, 0.07, 0.005);
      jersey.scale.set(k, 1, 0.82 * Math.max(0.9, k));
      chest.add(jersey);
      const jo = outlineOf(jersey);
      chest.add(jo);
      added.push(jersey, jo);
    }
    for (const arm of [armL, armR]) {
      if (!arm) continue;
      // the band sits a third of the way down the upper arm, along the bone towards the forearm
      const fore = arm.children.find((c) => c.name.startsWith('forearm'));
      const dir = fore ? fore.position.clone().normalize() : new Vector3(0, -1, 0);
      const len = fore ? fore.position.length() : 0.28;
      const band = new Mesh(bandGeo, mat);
      band.name = 'team_armband';
      band.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir));
      band.position.copy(dir).multiplyScalar(len * 0.32);
      band.scale.setScalar(Math.max(0.85, k));
      arm.add(band);
      const bo = outlineOf(band);
      arm.add(bo);
      added.push(band, bo);
    }
    return added;
  }
  // procedural fallback: a band round the torso group
  const band = new Mesh(jerseyGeo, mat);
  band.name = 'team_jersey';
  band.scale.set(0.62, 0.55, 0.55);
  band.position.set(0, 0.52, 0);
  model.torso.add(band);
  const bo = outlineOf(band);
  model.torso.add(bo);
  added.push(band, bo);
  return added;
}

const protectGeo = new RingGeometry(0.5, 0.62, 40);

/** A flat ring at the feet that blinks while spawn protection lasts. */
export function createProtectionRing(): Mesh {
  const ring = new Mesh(
    protectGeo,
    new MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  ring.visible = false;
  return ring;
}

/**
 * Spawn-protection blink: true on the "shown" half of an 8 Hz cycle. The body blinks (classic arcade
 * read) while the ring pulses, so a protected fighter is obvious from anywhere on screen.
 */
export function protectionBlink(time: number): boolean {
  return Math.floor(time * 8) % 2 === 0;
}
