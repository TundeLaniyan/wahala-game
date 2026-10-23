/**
 * Colour grade folded into tone mapping (no extra render pass, so it costs nothing on phones).
 * A hard, cinematic street-fight grade rather than a sunny cartoon one: ACES filmic, then slightly
 * pulled saturation, a firm S-curve with crushed blacks, a mild bleach-bypass for gritty midtones,
 * and a split tone (cold teal-green shadows, sodium-amber highlights).
 * Renderers opt in with `toneMapping = CustomToneMapping`.
 */
import { CustomToneMapping, ShaderChunk } from 'three';
import type { WebGLRenderer } from 'three';

const GRADE = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  color = ACESFilmicToneMapping( color * vec3( 1.03, 1.0, 0.95 ) );
  float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( l ), color, 0.9 );
  color = clamp( color, 0.0, 1.0 );
  // firm S-curve: deep shadows, hot highlights
  color = mix( color, color * color * ( 3.0 - 2.0 * color ), 0.32 );
  // crushed blacks
  color = max( color - 0.01, 0.0 ) * 1.01;
  // bleach bypass (luminance overlay) for a gritty, silvery midtone
  float lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 over = mix( 2.0 * color * lum, 1.0 - 2.0 * ( 1.0 - color ) * ( 1.0 - lum ), step( 0.5, lum ) );
  color = mix( color, over, 0.16 );
  // split tone
  lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color += mix( vec3( -0.022, 0.006, 0.014 ), vec3( 0.03, 0.012, -0.03 ), smoothstep( 0.15, 0.7, lum ) );
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
