/**
 * Presentation of the Okada's one-hit protection: a golden Fresnel energy bubble around the rider and
 * bike (bright at its silhouette with an animated hex-band shimmer, so it never hides the character).
 * It is purely visual; whether a player is protected comes from `Player.mounted` in the sim.
 */
import { AdditiveBlending, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';

const geometry = new SphereGeometry(1, 32, 22);

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
      varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      uniform float time;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float ndv = abs(dot(normalize(vN), normalize(vV)));
        float f = pow(1.0 - ndv, 2.0);
        float rim = smoothstep(0.55, 0.96, 1.0 - ndv);
        float band = smoothstep(0.14, 0.0, abs(fract(vP.y * 0.95 - time * 0.65) - 0.5) - 0.34);
        // Subtle hexagonal / diamond lattice along the rim
        float lat = sin(vP.x * 22.0 + vP.y * 14.0) * sin(vP.z * 22.0 - vP.y * 14.0);
        float hex = smoothstep(0.65, 0.92, lat) * f * 0.35;
        float a = (f * 0.82 + rim * 0.38 + band * 0.18 + hex) * opacity;
        vec3 col = mix(color, vec3(1.0, 0.97, 0.82), rim * 0.55 + band * 0.35);
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  const bubble = new Mesh(geometry, material);
  bubble.scale.set(0.82, 0.95, 1.02);
  bubble.renderOrder = 6;
  bubble.visible = false;
  return bubble;
}

/** Fades/pulses the bubble. `pop` (0..1) is the mount/break flash. */
export function updateShieldBubble(bubble: Mesh, visible: boolean, time: number, pop: number): void {
  const m = bubble.material as ShaderMaterial;
  bubble.visible = visible || pop > 0;
  m.uniforms.time!.value = time;
  m.uniforms.opacity!.value = (visible ? 0.36 + 0.09 * Math.sin(time * 3.6) : 0) + pop * 1.25;
}
