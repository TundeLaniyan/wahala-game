/**
 * "Grit": the weathering pass that turns clean, saturated toy surfaces into worn Lagos street
 * materials. It is a small patch injected into every lit standard/physical material (no extra
 * render pass, no new textures), driven by world position so it never repeats per object:
 *
 * - colour (after texture, vertex and instance colours) pulled towards a dusty, desaturated tone;
 * - mottled grime and soot (two octaves of value noise, darker in the crevices of the noise);
 * - street dirt creeping up the bottom of everything that stands on the ground;
 * - a dust film on upward-facing surfaces;
 * - extra roughness so paint, plastic and concrete stop looking freshly lacquered.
 *
 * Classes are chosen from the scene graph: an ancestor's `userData.grit` names the class, so the
 * renderer only has to tag the roots it builds (scenery, vehicles, crowd, players). Materials are
 * patched once; a tag on the material (`userData.gritPatched`) prevents double patching. Presentation
 * only: nothing here reads or changes game state.
 */
import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import type { Material, Object3D } from 'three';

export type GritClass = 'scenery' | 'floor' | 'vehicle' | 'paint' | 'crowd' | 'player' | 'skin' | 'none';

interface GritParams {
  /** 0 = keep colour, 1 = fully mixed to the dusty tone. */
  desat: number;
  /** Strength of the mottled grime (0..1). */
  grime: number;
  /** Ground dirt creeping up from y = 0 (0..1). */
  ground: number;
  /** Dust film on upward faces (0..1). */
  dust: number;
  /** Added roughness. */
  rough: number;
}

export const GRIT_CLASSES: Readonly<Record<Exclude<GritClass, 'none'>, GritParams>> = {
  scenery: { desat: 0.5, grime: 0.62, ground: 0.6, dust: 0.32, rough: 0.16 },
  floor: { desat: 0.42, grime: 0.55, ground: 0, dust: 0.12, rough: 0.12 },
  vehicle: { desat: 0.34, grime: 0.5, ground: 0.55, dust: 0.3, rough: 0.14 },
  /** Bright livery (Danfo yellow): weathered but kept saturated. */
  paint: { desat: 0.1, grime: 0.34, ground: 0.45, dust: 0.1, rough: 0.14 },
  crowd: { desat: 0.66, grime: 0.36, ground: 0.3, dust: 0.08, rough: 0.1 },
  player: { desat: 0.3, grime: 0.34, ground: 0.4, dust: 0.08, rough: 0.22 },
  skin: { desat: 0.06, grime: 0.06, ground: 0, dust: 0, rough: 0.02 },
};

/** Arena-wide grit settings shared by every patched material (set per arena by the renderer). */
export const gritWorld = {
  /** The dusty tone colours drift towards (arena-specific: red laterite, grey cement, ochre). */
  tone: { value: new Color(0x7a6c5c) },
  /** Ground-dirt colour multiplier. */
  dirt: { value: new Color(0x6a5d4e) },
  /** Dust film colour. */
  dustColor: { value: new Color(0x9a8a74) },
  /** World scale of the grime noise. */
  scale: { value: 1.3 },
  /** Global multiplier (0 = off, e.g. the asset viewer). */
  amount: { value: 1 },
};

const VERT_DECL = /* glsl */ `
varying vec3 vGritPos;
varying vec3 vGritNormal;
`;
const VERT_BODY = /* glsl */ `
{
  vec4 gp = vec4( transformed, 1.0 );
  vec3 gn = objectNormal;
  #ifdef USE_INSTANCING
    gp = instanceMatrix * gp;
    gn = mat3( instanceMatrix ) * gn;
  #endif
  gp = modelMatrix * gp;
  vGritPos = gp.xyz;
  vGritNormal = normalize( mat3( modelMatrix ) * gn );
}
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vGritPos;
varying vec3 vGritNormal;
uniform vec4 uGrit; // desat, grime, ground, dust
uniform float uGritRough;
uniform vec3 uGritTone;
uniform vec3 uGritDirt;
uniform vec3 uGritDust;
uniform float uGritScale;
uniform float uGritAmount;
float gritHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float gritNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gritHash( i ), gritHash( i + vec2( 1.0, 0.0 ) ), u.x ),
              mix( gritHash( i + vec2( 0.0, 1.0 ) ), gritHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float gritField( vec3 p ) {
  // triplanar-ish: blend two planar projections so walls and floors both get grime
  vec2 a = p.xz * uGritScale + p.y * 0.37;
  vec2 b = vec2( p.x + p.z, p.y ) * uGritScale * 1.6;
  float n = gritNoise( a ) * 0.62 + gritNoise( a * 3.1 + 7.3 ) * 0.38;
  float m = gritNoise( b ) * 0.6 + gritNoise( b * 2.7 + 3.1 ) * 0.4;
  float up = abs( vGritNormal.y );
  return mix( m, n, up );
}
`;

const FRAG_COLOR = /* glsl */ `
{
  float k = uGritAmount;
  vec3 c = diffuseColor.rgb;
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  // desaturate towards a dusty version of the arena tone at the same lightness
  vec3 dusty = uGritTone * ( l / max( 0.05, dot( uGritTone, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
  c = mix( c, mix( vec3( l ), dusty, 0.55 ), uGrit.x * k );
  // mottled grime and soot: darker blotches, stronger where the noise dips
  float n = gritField( vGritPos );
  float blotch = smoothstep( 0.62, 0.18, n );
  c *= 1.0 - uGrit.y * k * ( 0.18 + 0.32 * blotch );
  // street dirt creeping up from the ground
  float g = 1.0 - smoothstep( 0.0, 0.5 + 0.25 * n, vGritPos.y );
  c = mix( c, c * uGritDirt, uGrit.z * k * g );
  // a dust film on upward faces
  float up = smoothstep( 0.55, 0.95, vGritNormal.y );
  c = mix( c, uGritDust * ( 0.6 + 0.4 * l ), uGrit.w * k * up * ( 0.35 + 0.65 * n ) );
  diffuseColor.rgb = c;
}
`;

const FRAG_ROUGH = /* glsl */ `
roughnessFactor = clamp( roughnessFactor + uGritRough * uGritAmount * ( 0.6 + 0.8 * gritField( vGritPos ) ), 0.0, 1.0 );
`;

function isLit(m: Material): m is MeshStandardMaterial {
  return m instanceof MeshStandardMaterial || m instanceof MeshPhysicalMaterial;
}

/** Patches one material for a grit class (once). Returns true if it was patched now. */
export function patchMaterial(material: Material, cls: GritClass): boolean {
  if (cls === 'none' || !isLit(material)) return false;
  const ud = material.userData as { gritPatched?: boolean; noGrit?: boolean };
  if (ud.gritPatched || ud.noGrit) return false;
  ud.gritPatched = true;
  const p = GRIT_CLASSES[cls];
  const own = {
    uGrit: { value: [p.desat, p.grime, p.ground, p.dust] as [number, number, number, number] },
    uGritRough: { value: p.rough },
  };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uGrit = { value: own.uGrit.value };
    shader.uniforms.uGritRough = own.uGritRough;
    shader.uniforms.uGritTone = gritWorld.tone;
    shader.uniforms.uGritDirt = gritWorld.dirt;
    shader.uniforms.uGritDust = gritWorld.dustColor;
    shader.uniforms.uGritScale = gritWorld.scale;
    shader.uniforms.uGritAmount = gritWorld.amount;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <project_vertex>', `${VERT_BODY}\n#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`);
  };
  // uGrit is a vec4 uniform: three accepts a plain array of 4 numbers; values differ per material
  // but the GLSL is identical, so every patched material shares one program per base variant.
  // other shader patches on the same material (e.g. occlusionFade.ts) extend the key
  const extra = (material.userData.programKey as string | undefined) ?? '';
  material.customProgramCacheKey = () => `grit2${extra}`;
  material.needsUpdate = true;
  return true;
}

/** Character materials are named in the GLB: skin keeps its tone, eyes are left alone. */
function classFor(material: Material, inherited: GritClass): GritClass {
  if (inherited === 'player' || inherited === 'crowd') {
    const n = material.name.toLowerCase();
    if (n.includes('eye')) return 'none';
    if (n.includes('skin')) return 'skin';
  }
  return inherited;
}

/**
 * Patches every lit material under `root`, using the nearest ancestor's `userData.grit` (falling
 * back to `fallback`). Cheap to call repeatedly: already patched materials are skipped.
 */
export function applyGrit(root: Object3D, fallback: GritClass = 'scenery'): number {
  let patched = 0;
  const visit = (o: Object3D, cls: GritClass): void => {
    const own = (o.userData as { grit?: GritClass }).grit ?? cls;
    const m = (o as { material?: Material | Material[] }).material;
    if (m) {
      for (const mm of Array.isArray(m) ? m : [m]) if (patchMaterial(mm, classFor(mm, own))) patched++;
    }
    for (const c of o.children) visit(c, own);
  };
  visit(root, fallback);
  return patched;
}

/** Per-arena dusty tones. */
export function setGritWorld(tone: number, dirt: number, dust: number, scale = 1.3): void {
  gritWorld.tone.value.setHex(tone);
  gritWorld.dirt.value.setHex(dirt);
  gritWorld.dustColor.value.setHex(dust);
  gritWorld.scale.value = scale;
}
