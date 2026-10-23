/**
 * Shared toolkit for the per-arena street sets (presentation only). An arena set receives a
 * `SetContext` and dresses everything OUTSIDE the playable grid: buildings, vehicles, stalls,
 * machinery, street life and atmosphere. Rules every set follows:
 *
 * - nothing stands on the board (|x| <= W/2, |z| <= H/2) or on the perimeter walls;
 * - the fixed camera looks north from the south, so tall things live north and on the far sides;
 *   the south (camera) side stays low (under ~1 m within 2.5 m of the wall) so no tile is hidden;
 * - modelled GLB assets are instanced (one draw call per part); procedural pieces go into
 *   `statics`, which is baked into a few merged meshes;
 * - vehicles always use the detailed GLB models at the gameplay scale (`VEHICLE_SCALE`).
 */
import { Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { Material, Group } from 'three';
import type { QualityProfile } from '../quality';
import type { AmbientFx } from '../fx/Ambient';
import type { StreetLife } from '../life/StreetLife';
import { assets } from '../assets/library';

/** World scale of every vehicle model, playable or parked (VehicleViews draws the playable ones at this). */
export const VEHICLE_SCALE = 1.32;
/** The street around the raised arena slab sits this far below the arena floor. */
export const STREET = -0.3;

export interface Placement {
  x: number;
  y?: number;
  z: number;
  ry: number;
  /** tilt about the model's X / Z axes (wrecks, a bus on a flat tyre) */
  rx?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export type VehicleKind = 'danfo' | 'taxi' | 'keke' | 'okada';

export interface SetContext {
  W: number;
  H: number;
  /** Instanced / animated scenery. */
  root: Group;
  /** Static procedural scenery: baked into merged meshes after the set is built. */
  statics: Group;
  rng: () => number;
  quality: QualityProfile;
  life: StreetLife;
  ambient: AmbientFx;
  /** Instances every part of a modelled asset (`env_kiosk`, `prop_soft_crates`, ...). */
  instance(id: string, placements: Placement[]): void;
  /**
   * Parked / background vehicles from the detailed GLB models at gameplay scale. `idle` adds
   * tailpipe exhaust. The quality profile thins large fleets.
   */
  vehicles(kind: VehicleKind, placements: Placement[], opts?: { idle?: boolean }): void;
  /** A burnt-out vehicle: the same model with charred materials, flames, embers and black smoke. */
  wreck(kind: VehicleKind, p: Placement, opts?: { burning?: boolean }): void;
  /** Disposed with the backdrop. */
  own(d: { dispose(): void }): void;
}

export interface ArenaSet {
  /** Builds the arena's surroundings. */
  build(ctx: SetContext): void;
  /** Spectator crowd size multiplier (1 = the quality profile's crowd). */
  crowd: number;
  /** Which edges get spectators: north, east, west, south. */
  crowdEdges: { north: boolean; east: boolean; west: boolean; south: boolean };
}

const VEHICLE_ID: Record<VehicleKind, string> = {
  danfo: 'veh_danfo',
  taxi: 'veh_taxi',
  keke: 'veh_keke',
  okada: 'veh_okada',
};

export function instanceParts(
  root: Group,
  out: InstancedMesh[],
  id: string,
  placements: Placement[],
  scale = 1,
  materialFor?: (m: Material) => Material,
): void {
  if (placements.length === 0) return;
  const m4 = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  for (const part of assets.parts(id)) {
    const material = materialFor ? materialFor(part.material) : part.material;
    const im = new InstancedMesh(part.geometry, material, placements.length);
    if (id.startsWith('veh_')) im.userData.grit = 'vehicle';
    im.castShadow = true;
    im.receiveShadow = true;
    placements.forEach((pl, n) => {
      q.setFromEuler(e.set(pl.rx ?? 0, pl.ry, pl.rz ?? 0, 'YXZ'));
      m4.compose(
        p.set(pl.x, pl.y ?? 0, pl.z),
        q,
        s.set((pl.sx ?? 1) * scale, (pl.sy ?? 1) * scale, (pl.sz ?? 1) * scale),
      );
      im.setMatrixAt(n, m4);
    });
    out.push(im);
    root.add(im);
  }
}

/** Builds the SetContext the arena sets work with. */
export function createSetContext(o: {
  W: number;
  H: number;
  root: Group;
  statics: Group;
  rng: () => number;
  quality: QualityProfile;
  life: StreetLife;
  ambient: AmbientFx;
  instanced: InstancedMesh[];
  disposables: { dispose(): void }[];
}): SetContext {
  const { root, instanced, disposables, quality, ambient } = o;
  const charred = new Map<Material, Material>();
  const char = (m: Material): Material => {
    let c = charred.get(m);
    if (!c) {
      const s = m as MeshStandardMaterial;
      const burnt = new MeshStandardMaterial({
        color: 0x2a2420,
        map: s.map ?? null,
        roughness: 1,
        metalness: 0.25,
        flatShading: s.flatShading,
      });
      burnt.color.multiplyScalar(0.55);
      burnt.userData.gritPatched = false;
      charred.set(m, burnt);
      disposables.push(burnt);
      c = burnt;
    }
    return c;
  };
  return {
    W: o.W,
    H: o.H,
    root,
    statics: o.statics,
    rng: o.rng,
    quality,
    life: o.life,
    ambient,
    instance: (id, placements) => instanceParts(root, instanced, id, placements),
    vehicles(kind, placements, opts = {}) {
      // thin big fleets on weaker devices: keep an evenly spread subset
      const keep = Math.max(1, Math.round(placements.length * quality.parkedBuses));
      const shown = placements.filter(
        (_, n) =>
          Math.floor((n * keep) / placements.length) !== Math.floor(((n - 1) * keep) / placements.length) ||
          n === 0,
      );
      instanceParts(root, instanced, VEHICLE_ID[kind], shown, VEHICLE_SCALE);
      if (opts.idle) {
        for (const p of shown) {
          // models face +Z; the tailpipe sits at the back, low on the kerb side
          const back = kind === 'danfo' ? 2.35 : kind === 'taxi' ? 1.9 : 1.1;
          const bx = p.x - Math.sin(p.ry) * back;
          const bz = p.z - Math.cos(p.ry) * back;
          ambient.exhaust(bx, (p.y ?? 0) + 0.3, bz, -Math.sin(p.ry), -Math.cos(p.ry));
        }
      }
    },
    wreck(kind, p, opts = {}) {
      instanceParts(root, instanced, VEHICLE_ID[kind], [p], VEHICLE_SCALE, char);
      if (opts.burning !== false) {
        const size = kind === 'danfo' ? 1.25 : kind === 'taxi' ? 1.0 : 0.7;
        ambient.fire(p.x, (p.y ?? 0) + 0.55, p.z, size);
      }
    },
    own: (d) => disposables.push(d),
  };
}
