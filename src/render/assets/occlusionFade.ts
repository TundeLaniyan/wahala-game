/**
 * Occlusion fade for tall obstacles (presentation only). Pillars stand nearly as tall as the
 * characters and breakables reach hip height, so under the three-quarter camera they can hide
 * whatever stands on the tile behind them (north). Instead of making every obstacle short, an
 * obstacle that hides a player, generator or pickup dissolves its upper part with an ordered
 * (screen-door) dither: depth and shadows stay correct, nothing has to be sorted, and its foot
 * stays solid so the blocker still reads. Players additionally keep their x-ray silhouette.
 *
 * Per instance: an `aHide` attribute (0 = solid, 1 = fully dissolved above the foot). Every
 * geometry drawn with a fadeable material must carry it (InstanceSet adds it when asked to).
 */
import type { Material } from 'three';

/** Max fraction of pixels removed (the rest keeps the obstacle's shape readable). */
export const MAX_HIDE = 0.72;
/** Heights (world units) over which the dissolve ramps in: the foot below stays solid. */
const FOOT = [0.28, 0.7] as const;

const VERT_DECL = /* glsl */ `
attribute float aHide;
varying float vHide;
varying float vHideY;
`;
const VERT_BODY = /* glsl */ `
vHide = aHide;
{
  vec4 hw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    hw = instanceMatrix * hw;
  #endif
  vHideY = ( modelMatrix * hw ).y;
}
`;
const FRAG_DECL = /* glsl */ `
varying float vHide;
varying float vHideY;
float hideBayer2( vec2 a ) { a = floor( a ); return fract( a.x / 2.0 + a.y * a.y * 0.75 ); }
float hideBayer4( vec2 a ) { return hideBayer2( 0.5 * a ) * 0.25 + hideBayer2( a ); }
`;
const FRAG_BODY = /* glsl */ `
if ( vHide > 0.001 ) {
  float hideCut = vHide * smoothstep( ${FOOT[0].toFixed(2)}, ${FOOT[1].toFixed(2)}, vHideY );
  if ( hideBayer4( gl_FragCoord.xy ) < hideCut ) discard;
}
`;

/** A copy of `base` that honours the per-instance `aHide` attribute. */
export function fadeableMaterial<T extends Material>(base: T): T {
  const m = base.clone() as T;
  // a clone does not inherit shader patches (onBeforeCompile), only the flags in userData
  delete (m.userData as { gritPatched?: boolean }).gritPatched;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAG_BODY}`);
  };
  // other patches (grit.ts) compose their program key with this one
  m.userData.programKey = `${(m.userData.programKey as string | undefined) ?? ''}+hide`;
  m.customProgramCacheKey = () => 'hide';
  return m;
}

/**
 * Tiles whose obstacle should dissolve this frame: the obstacle on the tile directly SOUTH of
 * (in front of, towards the camera) anything worth seeing. Returns tile indices of the obstacles.
 */
export function occludingTiles(
  width: number,
  height: number,
  occupied: Iterable<{ x: number; y: number }>,
): Set<number> {
  const out = new Set<number>();
  for (const o of occupied) {
    const x = Math.round(o.x);
    const y = Math.round(o.y) + 1;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    out.add(y * width + x);
  }
  return out;
}
