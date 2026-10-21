/**
 * Presentation of the Okada's one-hit protection: a faint golden Fresnel bubble around the rider and
 * bike (bright only at its silhouette, so it never hides the character) with a slow shimmer band.
 * It is purely visual; whether a player is protected comes from `Player.mounted` in the sim.
 */
import { AdditiveBlending, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';

const geometry = new SphereGeometry(1, 28, 18);

export function createShieldBubble(color = 0xffd54a): Mesh {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      color: { value: new Color(color) },
      opacity: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = position.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      uniform float time;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float band = smoothstep(0.12, 0.0, abs(fract(vY * 0.9 - time * 0.55) - 0.5) - 0.32);
        float a = (f * 0.85 + band * 0.12) * opacity;
        gl_FragColor = vec4(color * a, a);
      }`,
  });
  const bubble = new Mesh(geometry, material);
  bubble.scale.set(0.78, 0.92, 0.95);
  bubble.renderOrder = 6;
  bubble.visible = false;
  return bubble;
}

/** Fades/pulses the bubble. `pop` (0..1) is the mount/break flash. */
export function updateShieldBubble(bubble: Mesh, visible: boolean, time: number, pop: number): void {
  const m = bubble.material as ShaderMaterial;
  bubble.visible = visible || pop > 0;
  m.uniforms.time!.value = time;
  m.uniforms.opacity!.value = (visible ? 0.32 + 0.08 * Math.sin(time * 3.2) : 0) + pop * 1.2;
}
