/**
 * Simple 3D icons of the campaign objectives, one merged vertex-coloured geometry each (one draw call per marker):
 * a radio mast (relays), a tyre stack with a crate (parts), a toll barrier (junctions), a ledger folder and a
 * printing press (evidence and its drop), an electrical switch cabinet (contingency) and a rail switch lever
 * (dispatch windows). Y-up, footprint inside one tile, about 1 unit tall so they read from the follow camera.
 * Procedural by design (the game has no mission models yet; see docs/MISSION_PRESENTATION.md).
 */
import type { BufferGeometry } from 'three';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ObjectiveKind } from '../../sim';

export type IconKind = 'relay' | 'parts' | 'barrier' | 'ledger' | 'press' | 'cabinet' | 'lever';

/** Which icon a node of this objective wears (`nodeId` tells the press drop from a ledger). */
export function iconFor(objective: ObjectiveKind, nodeId: string): IconKind {
  switch (objective) {
    case 'dispatchRelays':
      return 'relay';
    case 'supplyRoutes':
      return 'parts';
    case 'junctionAccess':
      return 'barrier';
    case 'evidenceRun':
      return nodeId === 'press' ? 'press' : 'ledger';
    case 'contingencyGrid':
      return 'cabinet';
    case 'dispatchWindows':
      return 'lever';
    case 'fieldRoute':
      return 'barrier'; // section field missions: markers and doors (the presentation pass owns the real icons)
  }
}

interface Part {
  geo: BufferGeometry;
  color: number;
  at: [number, number, number];
  rot?: [number, number, number];
}

function paint(p: Part): BufferGeometry {
  const g = p.geo;
  if (p.rot) {
    g.rotateX(p.rot[0]);
    g.rotateY(p.rot[1]);
    g.rotateZ(p.rot[2]);
  }
  g.translate(...p.at);
  const c = new Color(p.color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  // merged geometries must agree on their attributes
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

const box = (w: number, h: number, d: number): BufferGeometry => new BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10): BufferGeometry =>
  new CylinderGeometry(rt, rb, h, seg);

function parts(kind: IconKind): Part[] {
  switch (kind) {
    case 'relay':
      return [
        { geo: box(0.5, 0.1, 0.5), color: 0x3a3d44, at: [0, 0.05, 0] },
        { geo: box(0.28, 0.3, 0.2), color: 0xe0701a, at: [0.12, 0.25, 0.1] },
        { geo: cyl(0.035, 0.05, 1.15), color: 0xc9ced6, at: [-0.08, 0.68, -0.06] },
        { geo: box(0.46, 0.04, 0.04), color: 0xc9ced6, at: [-0.08, 0.95, -0.06] },
        { geo: box(0.32, 0.04, 0.04), color: 0xc9ced6, at: [-0.08, 0.78, -0.06] },
        { geo: new SphereGeometry(0.075, 10, 8), color: 0xff3b1f, at: [-0.08, 1.28, -0.06] },
        {
          geo: new SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          color: 0xe7eaee,
          at: [-0.08, 0.55, 0.12],
          rot: [-1.0, 0, 0],
        },
      ];
    case 'parts':
      return [
        {
          geo: new TorusGeometry(0.22, 0.1, 8, 14),
          color: 0x23252a,
          at: [0, 0.1, 0],
          rot: [Math.PI / 2, 0, 0],
        },
        {
          geo: new TorusGeometry(0.22, 0.1, 8, 14),
          color: 0x2c2e34,
          at: [0.02, 0.29, 0.01],
          rot: [Math.PI / 2, 0, 0],
        },
        {
          geo: new TorusGeometry(0.22, 0.1, 8, 14),
          color: 0x23252a,
          at: [-0.02, 0.48, 0],
          rot: [Math.PI / 2, 0, 0],
        },
        { geo: box(0.3, 0.3, 0.3), color: 0xb9854a, at: [0.34, 0.15, 0.2], rot: [0, 0.4, 0] },
        { geo: box(0.06, 0.5, 0.06), color: 0xff7a1a, at: [-0.3, 0.45, -0.22], rot: [0, 0, 0.3] },
        { geo: box(0.2, 0.06, 0.06), color: 0xc9ced6, at: [-0.26, 0.74, -0.22], rot: [0, 0, 0.3] },
      ];
    case 'barrier':
      return [
        { geo: cyl(0.07, 0.09, 0.9), color: 0xe9e4d8, at: [-0.5, 0.45, 0] },
        { geo: cyl(0.07, 0.09, 0.9), color: 0xe9e4d8, at: [0.5, 0.45, 0] },
        { geo: box(0.36, 0.1, 0.1), color: 0xd62b1a, at: [-0.3, 0.78, 0] },
        { geo: box(0.36, 0.1, 0.1), color: 0xf4efe4, at: [0.0, 0.78, 0] },
        { geo: box(0.36, 0.1, 0.1), color: 0xd62b1a, at: [0.3, 0.78, 0] },
        { geo: new ConeGeometry(0.14, 0.32, 10), color: 0xff7a1a, at: [0, 0.16, 0.3] },
      ];
    case 'ledger':
      return [
        { geo: box(0.56, 0.06, 0.42), color: 0xd9b45a, at: [0, 0.03, 0] },
        { geo: box(0.22, 0.06, 0.08), color: 0xd9b45a, at: [-0.15, 0.03, -0.25] },
        { geo: box(0.5, 0.04, 0.36), color: 0xf3efe2, at: [0.02, 0.08, 0.02], rot: [0, 0.12, 0] },
        { geo: box(0.5, 0.04, 0.36), color: 0xf3efe2, at: [-0.02, 0.12, -0.01], rot: [0, -0.1, 0] },
        { geo: box(0.08, 0.06, 0.4), color: 0xb02a2a, at: [0.18, 0.16, 0] },
      ];
    case 'press':
      return [
        { geo: box(0.8, 0.22, 0.6), color: 0x3a3d44, at: [0, 0.11, 0] },
        { geo: box(0.08, 0.5, 0.5), color: 0x5a5f69, at: [-0.34, 0.45, 0] },
        { geo: box(0.08, 0.5, 0.5), color: 0x5a5f69, at: [0.34, 0.45, 0] },
        { geo: cyl(0.14, 0.14, 0.7), color: 0xc9ced6, at: [0, 0.7, 0], rot: [0, 0, Math.PI / 2] },
        { geo: box(0.5, 0.03, 0.34), color: 0xf3efe2, at: [0, 0.25, 0] },
        { geo: box(0.2, 0.1, 0.1), color: 0xb02a2a, at: [0.2, 0.28, 0.2] },
      ];
    case 'cabinet':
      return [
        { geo: box(0.5, 0.78, 0.26), color: 0x6c7480, at: [0, 0.39, 0] },
        { geo: box(0.42, 0.7, 0.04), color: 0x8f98a6, at: [0, 0.4, 0.14] },
        { geo: new SphereGeometry(0.07, 8, 8), color: 0xff3b1f, at: [0.1, 0.62, 0.17] },
        { geo: new SphereGeometry(0.07, 8, 8), color: 0x4dff88, at: [-0.1, 0.62, 0.17] },
        { geo: box(0.05, 0.22, 0.05), color: 0xf4efe4, at: [0, 0.3, 0.2], rot: [0.5, 0, 0] },
        { geo: box(0.58, 0.05, 0.34), color: 0x3a3d44, at: [0, 0.8, 0] },
      ];
    case 'lever':
      return [
        { geo: box(0.56, 0.1, 0.44), color: 0x3a3d44, at: [0, 0.05, 0] },
        { geo: box(0.2, 0.3, 0.16), color: 0x6c7480, at: [0, 0.25, 0] },
        { geo: cyl(0.045, 0.045, 0.78), color: 0xc9ced6, at: [0.14, 0.62, 0], rot: [0, 0, -0.55] },
        { geo: new SphereGeometry(0.11, 10, 8), color: 0xd62b1a, at: [0.33, 0.97, 0] },
        { geo: box(0.1, 0.34, 0.1), color: 0x23252a, at: [-0.22, 0.27, -0.1] },
        { geo: new SphereGeometry(0.07, 8, 8), color: 0xffb300, at: [-0.22, 0.5, -0.1] },
      ];
  }
}

/** The merged, vertex-coloured icon geometry (the caller owns and disposes it). */
export function buildIcon(kind: IconKind): BufferGeometry {
  const merged = mergeGeometries(parts(kind).map(paint), false);
  merged.computeVertexNormals();
  return merged;
}
