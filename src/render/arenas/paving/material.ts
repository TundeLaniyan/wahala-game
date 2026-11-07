/**
 * Interlocking road paving on an arena floor (presentation only; docs/LEKKI_INTERLOCK_ROADS.md).
 *
 * How it works (decision LI1). The arena's floor canvas paints every paved road tile in one reserved KEY colour, then
 * paints the road markings (kerbs, lane lines, stop lines, the median, road words) over it as usual. The floor material
 * keeps that canvas as its map; a small shader patch samples a seamless, mip-mapped paver texture in WORLD space (tile
 * units) and, wherever the canvas shows the key colour, uses the paver colour instead. Anything painted over the key
 * (a marking, a kerb) differs from it and shows through unchanged, and the edge of a road blends over a fraction of a
 * canvas texel. So:
 *
 *   - one texture lattice for the whole network: courses run continuously through every junction and segment, with no
 *     reset or seam at tile or road boundaries;
 *   - the paver texture has about four times the floor canvas's texels per tile and its own mip chain, so the blocks stay
 *     crisp up close and fade smoothly to an even grey (no moire, no shimmer) as they get small on screen;
 *   - a large-scale world-space tone variation hides the texture repeat;
 *   - no mesh, no extra draw call; one extra 512 x 512 texture (1.3 MB with mips) and two texture reads per floor pixel.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import type { MeshStandardMaterial, Texture } from 'three';
import { LEKKI_INTERLOCK, blockSize, interlockPixels } from './interlock';
import type { InterlockSpec } from './interlock';

/** The reserved floor-canvas colour that marks a paved tile (sRGB 0-255). Nothing else in a paved arena's floor uses it. */
export const PAVING_KEY: readonly [number, number, number] = [128, 128, 128];
export const PAVING_KEY_CSS = `rgb(${PAVING_KEY[0]},${PAVING_KEY[1]},${PAVING_KEY[2]})`;

export interface PavingSpec {
  interlock: InterlockSpec;
  /** Length of one block in tiles (the texture repeats every `blocksAcross` blocks). */
  blockTiles: number;
}

/** Lekki Phase 1 (decision LI3): a block 0.22 tile long, so the texture repeats every 2.64 tiles. */
export const LEKKI_PAVING: PavingSpec = { interlock: LEKKI_INTERLOCK, blockTiles: 0.22 };

/** Tiles covered by one repeat of the texture (square: courses x course height = blocks x block length). */
export function periodTiles(p: PavingSpec): number {
  const { L, H } = blockSize(p.interlock);
  if (Math.abs(L * p.interlock.blocksAcross - H * p.interlock.courses) > 1e-6)
    throw new Error('paver texture not square');
  return p.blockTiles * p.interlock.blocksAcross;
}

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/**
 * The paver texture of a floor. The texels are computed once per page (deterministic, about a quarter of a second) and
 * kept; each floor gets its own texture object, owned and disposed with the floor, so leaving the arena frees the GPU copy.
 */
const pixelCache = new Map<InterlockSpec, Uint8Array>();
export function paverTexture(spec: InterlockSpec = LEKKI_INTERLOCK): DataTexture {
  let px = pixelCache.get(spec);
  if (!px) {
    px = interlockPixels(spec);
    pixelCache.set(spec, px);
  }
  const t = new DataTexture(px, spec.size, spec.size, RGBAFormat, UnsignedByteType);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

const FRAG_DECL = /* glsl */ `
uniform sampler2D uPaverMap;
uniform vec2 uPaverBoard;
uniform float uPaverPeriod;
uniform vec3 uPaverKey;
float pvHash( vec2 p ) { return fract( sin( dot( p, vec2( 41.3, 289.1 ) ) ) * 15731.743 ); }
float pvNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( pvHash( i ), pvHash( i + vec2( 1.0, 0.0 ) ), u.x ),
              mix( pvHash( i + vec2( 0.0, 1.0 ) ), pvHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;

// replaces three's map_fragment: the canvas as before, the pavers where the canvas shows the key colour. Both textures
// are always sampled (no branch around a texture read, so mip selection stays defined everywhere).
const FRAG_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  // tile coordinates of this point of the floor (x east, y south), the same lattice for every road
  vec2 pvTile = vec2( vMapUv.x * uPaverBoard.x, ( 1.0 - vMapUv.y ) * uPaverBoard.y );
  vec3 pvColor = texture2D( uPaverMap, pvTile / uPaverPeriod ).rgb;
  // large-scale, world-space tone drift (a few percent) so the 2.6-tile repeat never reads as a pattern
  float pvMacro = pvNoise( pvTile * 0.31 ) * 0.6 + pvNoise( pvTile * 0.83 + 5.1 ) * 0.4;
  pvColor *= 0.95 + 0.1 * pvMacro;
  float pvCover = 1.0 - smoothstep( 0.012, 0.06, length( sampledDiffuseColor.rgb - uPaverKey ) );
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, pvColor, pvCover );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

/**
 * Installs the paving on a floor material (once). `board` is the floor size in tiles (the floor plane spans it with its
 * map, row 0 at the north edge). Must run before any other shader patch reads `programKey` (grit.ts composes with it).
 * Returns the paver texture it created (the caller owns and disposes it), or null if the material already has paving.
 */
export function installPaving(
  material: MeshStandardMaterial,
  board: { width: number; height: number },
  spec: PavingSpec = LEKKI_PAVING,
): Texture | null {
  const ud = material.userData as { paving?: boolean; programKey?: string };
  if (ud.paving) return null;
  ud.paving = true;
  const texture = paverTexture(spec.interlock);
  const uniforms = {
    uPaverMap: { value: texture },
    uPaverBoard: { value: [board.width, board.height] as [number, number] },
    uPaverPeriod: { value: periodTiles(spec) },
    uPaverKey: { value: PAVING_KEY.map(srgbToLinear) as [number, number, number] },
  };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <map_fragment>', FRAG_MAP);
  };
  ud.programKey = `${ud.programKey ?? ''}+paving`;
  material.customProgramCacheKey = () => 'paving';
  material.needsUpdate = true;
  return texture;
}
