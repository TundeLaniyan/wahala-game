/**
 * Fresnel rim light for gameplay-critical models (characters, the Okada): a warm edge glow that
 * separates them from the busy, similarly lit floor clutter at phone size, the way the reference's
 * characters pop. Purely a material tweak (no extra pass); the patched program is shared by every
 * material with the same rim settings.
 */
import { Color } from 'three';
import type { Material, MeshStandardMaterial, Object3D } from 'three';

const patched = new WeakSet<Material>();

export function addRim(root: Object3D, color = 0xffe0b0, strength = 0.26, power = 3.2): void {
  const rimColor = new Color(color);
  root.traverse((o) => {
    const mats = (o as { material?: Material | Material[] }).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (patched.has(m) || !(m as MeshStandardMaterial).isMeshStandardMaterial) continue;
      patched.add(m);
      m.onBeforeCompile = (shader) => {
        shader.uniforms.rimColor = { value: rimColor };
        shader.uniforms.rimStrength = { value: strength };
        shader.uniforms.rimPower = { value: power };
        shader.fragmentShader = shader.fragmentShader
          .replace(
            'void main() {',
            'uniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;\nvoid main() {',
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
  float rimF = pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), rimPower );
  totalEmissiveRadiance += rimColor * rimF * rimStrength;`,
          );
      };
      m.customProgramCacheKey = () => `rim:${color}:${strength}:${power}`;
      m.needsUpdate = true;
    }
  });
}
