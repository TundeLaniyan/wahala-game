/**
 * The darkness mask of a NIGHT raid (docs/CLASSIC_LIGHTING.md, decisions NL4-NL6): shared shader uniforms read by the
 * grit patch (`grit.ts`, every lit material already carries it, so this adds no pass and no material). The light map is
 * a tiny RGBA texture, one texel per board tile (R = the fighter's flashlight, G = guard torches, B = fixed lamps),
 * written every frame by `NightLightViews` from the sim's lit tile sets (`raidLightMap`). The fragment multiplies its
 * lit colour by a cold shade where the tile is dark and by the light's tint where it is lit; linear filtering of the
 * texture gives soft tile edges. Off the board everything is dark (unlit signs and lamps keep glowing).
 *
 * Presentation only, and independent of the quality preset: Low and High compute and show the same lit tiles.
 */
import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector4,
} from 'three';

/** A 1 x 1 black map bound whenever no night raid runs (the sampler always needs a texture). */
const EMPTY = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
EMPTY.needsUpdate = true;

/** What full darkness and each light do to a lit material's colour (multipliers). */
export const NIGHT_TINTS = {
  /** Fully dark: a cold, very low residue so walls and corridors stay a faint silhouette. */
  shade: 0x2a3a52,
  /** The fighter's flashlight: warm white. */
  player: 0xfff0d8,
  /** Guard torches: a cold blue-white (reads as "their" light). */
  guard: 0xd4e2ff,
  /** Fixed lamps: sodium amber. */
  lamp: 0xffcf96,
} as const;

/** Shared uniforms of the darkness mask (one set for the whole scene). */
export const nightWorld = {
  /** 1 while a night raid runs, 0 otherwise (the patch then leaves every colour alone). */
  on: { value: 0 },
  map: { value: EMPTY as DataTexture },
  /** Board origin (world x, z of the north-west corner) and 1 / board size in tiles. */
  board: { value: new Vector4(0, 0, 1, 1) },
  shade: { value: new Color(NIGHT_TINTS.shade) },
  player: { value: new Color(NIGHT_TINTS.player) },
  guard: { value: new Color(NIGHT_TINTS.guard) },
  lamp: { value: new Color(NIGHT_TINTS.lamp) },
};

/** A light-map texture for a board of `width` x `height` tiles (RGBA bytes, linear filtering, clamped). */
export function createNightMap(width: number, height: number): DataTexture {
  const tex = new DataTexture(
    new Uint8Array(width * height * 4),
    width,
    height,
    RGBAFormat,
    UnsignedByteType,
  );
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Turns the mask on with `map` for a board of `width` x `height` tiles centred on the origin (render/coords.ts). */
export function enableNight(map: DataTexture, width: number, height: number): void {
  nightWorld.map.value = map;
  nightWorld.board.value.set(-width / 2, -height / 2, 1 / width, 1 / height);
  nightWorld.on.value = 1;
}

/** Turns the mask off (every match that is not a night raid). */
export function disableNight(): void {
  nightWorld.on.value = 0;
  nightWorld.map.value = EMPTY;
}

/** GLSL declarations of the mask (appended to the grit patch's fragment declarations). */
export const NIGHT_FRAG_DECL = /* glsl */ `
uniform float uNightOn;
uniform sampler2D uNightMap;
uniform vec4 uNightBoard;
uniform vec3 uNightShade;
uniform vec3 uNightPlayer;
uniform vec3 uNightGuard;
uniform vec3 uNightLamp;
uniform float uNightK;
`;

/**
 * GLSL run just before `opaque_fragment`: scales the material's lit colour by the light on its tile. `uNightK` is the
 * material's share of the mask (1 = full; generators keep part of their own light, decision NL6).
 */
export const NIGHT_FRAG_APPLY = /* glsl */ `
if ( uNightOn > 0.5 ) {
  vec2 nuv = ( vGritPos.xz - uNightBoard.xy ) * uNightBoard.zw;
  vec3 nl = vec3( 0.0 );
  if ( nuv.x >= 0.0 && nuv.x <= 1.0 && nuv.y >= 0.0 && nuv.y <= 1.0 ) nl = texture2D( uNightMap, nuv ).rgb;
  float nlv = max( nl.r, max( nl.g, nl.b ) );
  vec3 ntint = ( nl.r * uNightPlayer + nl.g * uNightGuard + nl.b * uNightLamp ) / max( 0.001, nl.r + nl.g + nl.b );
  vec3 nm = mix( uNightShade, ntint, smoothstep( 0.04, 0.6, nlv ) );
  outgoingLight *= mix( vec3( 1.0 ), nm, uNightK );
}
`;
