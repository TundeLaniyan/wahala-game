/**
 * Presentation of the protection layers (V2: Okada + Armour, decision WC5).
 *
 * - Okada: a golden Fresnel energy bubble around the rider and bike (bright at its silhouette with an
 *   animated hex-band shimmer, so it never hides the character).
 * - Armour: a cooler steel-blue shell just outside it (fainter, so both layers read when stacked) and one
 *   small plate pip per Armour layer beside the name tag; a breaking plate flashes the shell and the view
 *   throws steel shards.
 *
 * Purely visual; whether a player is protected comes from `Player.mounted` / `Player.armour` in the sim.
 */
import { AdditiveBlending, CanvasTexture, Color, Group, Mesh, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial } from 'three';
import { drawPickupIcon } from '../../assets/pickupIcons';

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

/** Steel-blue Armour colour (shell, shards, HUD pip). */
export const ARMOUR_COLOR = 0x9fd8ff;
const MAX_PIPS = 3;
let plateTex: CanvasTexture | null = null;

export interface ArmourVisual {
  group: Group;
  shell: Mesh;
  pips: Sprite[];
  /** Plates shown last frame (-1 = unknown: never flash on the first frame / after a respawn). */
  shown: number;
  brokeAt: number;
}

export function createArmourVisual(): ArmourVisual {
  const group = new Group();
  const shell = createShieldBubble(ARMOUR_COLOR);
  plateTex ??= new CanvasTexture(drawPickupIcon('armour', 64));
  const pips = Array.from({ length: MAX_PIPS }, () => {
    const s = new Sprite(new SpriteMaterial({ map: plateTex, transparent: true, depthTest: false }));
    s.scale.set(0.27, 0.27, 1);
    s.renderOrder = 33;
    s.visible = false;
    return s;
  });
  group.add(shell, ...pips);
  return { group, shell, pips, shown: -1, brokeAt: -10 };
}

/**
 * Poses the Armour layer for a living player at world (x, z). Returns true on the frame a plate breaks
 * (so the caller can throw shards).
 */
export function updateArmourVisual(
  a: ArmourVisual,
  x: number,
  z: number,
  yaw: number,
  armour: number,
  mounted: boolean,
  time: number,
): boolean {
  const broke = a.shown >= 0 && armour < a.shown;
  if (broke) a.brokeAt = time;
  a.shown = armour;
  a.group.visible = true;
  const pop = Math.max(0, 1 - (time - a.brokeAt) / 0.35);
  a.shell.position.set(x, 0.88, z);
  a.shell.rotation.y = yaw;
  // just outside the Okada bubble when both are worn; swells as it shatters
  a.shell.scale.set(0.98, 1.14, 1.16).multiplyScalar((mounted ? 1.1 : 1) * (1 + (1 - pop) * (armour > 0 ? 0 : 0.5)));
  const m = a.shell.material as ShaderMaterial;
  a.shell.visible = armour > 0 || pop > 0;
  m.uniforms.time!.value = -time * 0.7;
  m.uniforms.opacity!.value = (armour > 0 ? 0.2 + 0.05 * Math.min(armour, MAX_PIPS) + 0.05 * Math.sin(time * 2.4) : 0) + pop * 1.1;
  a.pips.forEach((pip, i) => {
    pip.visible = i < armour;
    if (pip.visible) pip.position.set(x + 0.64 + i * 0.25, 2.1 + Math.sin(time * 3 + i) * 0.02, z);
  });
  return broke;
}

/** Hides the Armour layer (eliminated / off screen); a later reappearance never counts as a break. */
export function hideArmourVisual(a: ArmourVisual, forget: boolean): void {
  a.group.visible = false;
  if (forget) a.shown = -1;
}
