/**
 * Colour grade folded into tone mapping (no extra render pass, so it costs nothing on phones):
 * ACES filmic, then a warm late-afternoon balance, a little extra saturation, a gentle S-curve and a
 * teal-shadow / warm-highlight split tone.
 * Renderers opt in with `toneMapping = CustomToneMapping`.
 */
import { CustomToneMapping, ShaderChunk } from 'three';
import type { WebGLRenderer } from 'three';

const GRADE = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  color = ACESFilmicToneMapping( color * vec3( 1.05, 1.0, 0.92 ) );
  float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( l ), color, 1.18 );
  // gentle S-curve around mid grey (in linear light): deeper shadows, brighter sunlit tops
  color = clamp( color, 0.0, 1.0 );
  color = mix( color, color * color * ( 3.0 - 2.0 * color ), 0.26 );
  // cinematic split tone: cool, slightly teal shadows and warm highlights separate the sunlit cast
  // from the shade they run through
  float lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color += mix( vec3( -0.014, 0.004, 0.026 ), vec3( 0.022, 0.006, -0.02 ), smoothstep( 0.18, 0.72, lum ) );
  return clamp( color, 0.0, 1.0 );
}`;

let installed = false;

export function installGrading(renderer: WebGLRenderer, exposure = 1.06): void {
  if (!installed) {
    ShaderChunk.tonemapping_pars_fragment = ShaderChunk.tonemapping_pars_fragment.replace(
      'vec3 CustomToneMapping( vec3 color ) { return color; }',
      GRADE,
    );
    installed = true;
  }
  renderer.toneMapping = CustomToneMapping;
  renderer.toneMappingExposure = exposure;
}
