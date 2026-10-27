/**
 * Ojuelegba Underbridge - the flyover overhead (presentation only). The deck runs north-south over the
 * pier court and the through road beneath it (tile columns 15-29, from the north edge to its cut end over
 * the south bent; the set carries it on north of the board, where the ambient deck traffic runs). Only
 * its OUTER EDGES are drawn over the board - the two north-south fascia girders with a strip of soffit
 * inside each, and the upper shafts of the piers with their hammerheads - and the central deck is cut
 * away, so it never roofs over the fight (research: "cut away the central deck consistently while retaining
 * beams and outer edges").
 *
 * Even those beams never hide play. Under the close follow camera anything 4-5 m up sits halfway to the
 * lens, so the beams are cut by a screen-space cutaway (the same ordered screen-door dither as the obstacle
 * fade): everything in the lower part of the screen - between the camera and the fight - is cut away, the
 * beams only show towards the top of the frame (the far side of the road band, where they frame the view),
 * an ellipse round the local fighter at the screen centre is always cut, and a light dissolve runs over the
 * rest. Occluded fighters keep their x-ray silhouettes as everywhere else.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, WebGLRenderer } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { concreteTexture } from '../textures';
import type { CoverGroup } from './ojuelegbaCoverMap';

/** Height of the on-board pier stub (the board cover draws up to here; the overhead takes over). */
export const PIER_CUT = 2.5;
/** Soffit (underside) of the deck. */
export const SOFFIT = 4.4;
/** Tile columns under the deck, and the row over which it is cut off (the south bent). */
export const DECK_X0 = 15;
export const DECK_X1 = 29;
export const DECK_END = 21;

const CUT = {
  /** Fraction of pixels always dissolved (0 = solid). */
  base: 0,
  /** Ellipse round the screen centre (fraction of the screen height): fully cut inside r0, solid-ish past r1. */
  r0: 0.12,
  r1: 0.22,
  /** Cut plane: fully cut below y0 (fraction of the screen height from the bottom), shown above y1. */
  y0: 0.56,
  y1: 0.7,
};

const FRAG_DECL = /* glsl */ `
uniform vec2 uCutCentre;
uniform float uCutScale;
float cutBayer2( vec2 a ) { a = floor( a ); return fract( a.x / 2.0 + a.y * a.y * 0.75 ); }
float cutBayer4( vec2 a ) { return cutBayer2( 0.5 * a ) * 0.25 + cutBayer2( a ); }
`;
const FRAG_BODY = /* glsl */ `
{
  vec2 cd = ( gl_FragCoord.xy - uCutCentre ) * uCutScale;
  float cr = length( cd * vec2( 1.0, 1.35 ) );
  float cut = max( ${CUT.base.toFixed(2)}, 1.0 - smoothstep( ${CUT.r0.toFixed(2)}, ${CUT.r1.toFixed(2)}, cr ) );
  cut = max( cut, 1.0 - smoothstep( ${CUT.y0.toFixed(2)}, ${CUT.y1.toFixed(2)}, gl_FragCoord.y * uCutScale ) );
  if ( cutBayer4( gl_FragCoord.xy ) < cut ) discard;
}
`;

/** A material whose fragments dissolve round the screen centre (updated per frame by the mesh). */
function cutawayMaterial(): {
  material: MeshStandardMaterial;
  centre: { value: Vector2 };
  scale: { value: number };
} {
  const centre = { value: new Vector2(0, 0) };
  const scale = { value: 1 };
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    map: typeof document !== 'undefined' ? concreteTexture() : null,
  });
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uCutCentre = centre;
    shader.uniforms.uCutScale = scale;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAG_BODY}`);
  };
  material.userData.programKey = `${(material.userData.programKey as string | undefined) ?? ''}+deckcut`;
  material.customProgramCacheKey = () => 'deckcut';
  return { material, centre, scale };
}

const m4 = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const sc = new Vector3();
const size = new Vector2();

function piece(
  geo: BufferGeometry,
  x: number,
  y: number,
  z: number,
  color: number,
  ry = 0,
  sx = 1,
  sz = 1,
): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  q.setFromAxisAngle(new Vector3(0, 1, 0), ry);
  g.applyMatrix4(m4.compose(p.set(x, y, z), q, sc.set(sx, 1, sz)));
  const n = g.attributes.position!.count;
  const c = new Float32Array(n * 3);
  const r = ((color >> 16) & 255) / 255;
  const gg = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  for (let i = 0; i < n; i++) c.set([r, gg, b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
  return g;
}

/**
 * The overhead for a W x H board: fascia girders over the north and south edges of the road band, soffit
 * strips, and the upper pier shafts with their hammerheads over every pier group. Returns a group and its disposer.
 */
export function buildDeck(
  W: number,
  H: number,
  piers: readonly CoverGroup[],
): { object: Group; dispose(): void } {
  const wx = (x: number): number => x - W / 2 + 0.5;
  const wz = (y: number): number => y - H / 2 + 0.5;
  // the deck runs north-south over the pier court (tile columns 15-29), on from the north edge of the board
  // to its cut end over the south bent (row 21); the set carries it on north of the board
  const xW = wx(DECK_X0) - 0.3;
  const xE = wx(DECK_X1) + 0.3;
  const zTop = -H / 2;
  const zEnd = wz(DECK_END) + 0.5;
  const len = zEnd - zTop;
  const zc = (zTop + zEnd) / 2;
  const tone = 0x8e8a82; // soot concrete with some warmth (research palette #5E5A55, lit)
  const parts: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y0: number, z: number, c: number): void => {
    parts.push(piece(new BoxGeometry(w, h, d), x, y0 + h / 2, z, c));
  };
  // fascia girders with a drip line, and the soffit strips just inside them (the deck's outer edges)
  for (const [x, dir] of [
    [xW, 1],
    [xE, -1],
  ] as const) {
    box(0.42, 0.75, len, x, SOFFIT, zc, tone);
    box(0.5, 0.12, len, x, SOFFIT + 0.75, zc, 0x6e6a64); // parapet coping
    box(0.44, 0.06, len, x, SOFFIT - 0.06, zc, 0x3e3a36); // the dark drip line under the fascia
    box(1.1, 0.14, len, x + dir * 0.75, SOFFIT, zc, 0x7a766e); // soffit strip
  }
  // over every pier group: the upper shaft from the stub to its hammerhead under the deck
  for (const g of piers) {
    const cx = (wx(g.x0) + wx(g.x1)) / 2;
    const cz = (wz(g.y0) + wz(g.y1)) / 2;
    const deep = g.y1 - g.y0 + 1;
    const shaft = SOFFIT - 0.5 - PIER_CUT;
    parts.push(
      piece(
        new CylinderGeometry(0.74, 0.74, shaft, 8),
        cx,
        PIER_CUT + shaft / 2,
        cz,
        0xa8a090,
        Math.PI / 8,
        1,
        0.82 * (deep > 2 ? 1.4 : 1),
      ),
    );
    // the hammerhead flaring out under the deck
    parts.push(
      piece(new CylinderGeometry(1.3, 0.78, 0.5, 4), cx, SOFFIT - 0.25, cz, 0xa29a8a, Math.PI / 4, 1, 0.9),
    );
  }
  // no east-west crossheads over the board: seen from the camera they would lie across the frame and hide
  // the pavement behind them; each shaft ends in its own hammerhead under the girders instead
  const merged = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  const { material, centre, scale } = cutawayMaterial();
  const mesh = new Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'ojuelegbaDeck';
  // the cut-out follows the screen centre (the follow camera keeps the local fighter there)
  mesh.onBeforeRender = (renderer: WebGLRenderer) => {
    renderer.getDrawingBufferSize(size);
    centre.value.set(size.x / 2, size.y * 0.47);
    scale.value = 1 / Math.max(1, size.y);
  };
  const object = new Group();
  object.name = 'ojuelegbaOverhead';
  object.add(mesh);
  return {
    object,
    dispose() {
      merged.dispose();
      (material as Material).dispose();
    },
  };
}
