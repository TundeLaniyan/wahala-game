/**
 * Scene lighting shared by the game and the asset viewer so previews match what players see:
 * a low golden-hour sun with soft shadows, a warm/cool hemisphere fill and a small procedural
 * environment map for believable reflections on paint, glass and metal.
 */
import {
  BackSide,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PointLight,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import type { Texture, WebGLRenderer } from 'three';
import type { ArenaLook } from './arenaLook';

export interface SceneLights {
  sun: DirectionalLight;
  /** Warm work lamps around the arena (no shadows). */
  lamps: PointLight[];
  hemi: HemisphereLight;
  environment: Texture;
  setShadows(enabled: boolean, mapSize: number): void;
  dispose(): void;
}

/** Procedural sky used only to build the reflection environment (tinted by the arena's air). */
function buildSkyScene(look?: ArenaLook): Scene {
  const sky = new Scene();
  const dome = new Mesh(
    new SphereGeometry(50, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new Color(look ? look.hemi.sky : 0x6f9bd1).multiplyScalar(look ? 0.7 : 1) },
        horizon: { value: new Color(look ? look.fog.color : 0xffd7a0) },
        ground: { value: new Color(look ? look.street : 0x6a5846) },
      },
      vertexShader:
        'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.4)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  sky.add(dome);
  // a bright "sun" patch so glossy surfaces pick up a warm highlight
  const sun = new Mesh(
    new SphereGeometry(4, 16, 8),
    new MeshBasicMaterial({ color: look ? look.sun.color : 0xfff1cc }),
  );
  sun.position.set(-30, 26, 18);
  sky.add(sun);
  return sky;
}

export function createSceneLights(
  scene: Scene,
  renderer: WebGLRenderer,
  look?: ArenaLook,
  /** Work / street lamps cost a light per lit fragment: off on the low quality profile. */
  withLamps = true,
): SceneLights {
  // Default: late-afternoon Lagos sun from the upper left: warm key, crisp shadows falling right and
  // slightly back, and a lower sky/bounce fill so faces turned away from the sun keep real shape.
  // Each arena can bring its own key, fill and reflection strength (arenaLook.ts).
  const hemi = new HemisphereLight(
    look?.hemi.sky ?? 0xffe8cc,
    look?.hemi.ground ?? 0x765a40,
    look?.hemi.intensity ?? 0.62,
  );
  const sun = new DirectionalLight(look?.sun.color ?? 0xffd698, look?.sun.intensity ?? 4.4);
  if (look) sun.position.set(...look.sun.position);
  else sun.position.set(-13, 12.5, 6.2);
  sun.target.position.set(0, 0, 0);
  const cam = sun.shadow.camera;
  cam.left = -15;
  cam.right = 15;
  cam.top = 12;
  cam.bottom = -12;
  cam.near = 1;
  cam.far = 50;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 1.6;
  scene.add(hemi, sun, sun.target);
  // without its lamps (low quality) a lamp-lit arena gets a stronger fill so the streets stay readable
  if (!withLamps && (look?.lamps.length ?? 0) > 0) hemi.intensity *= 1.3;
  const lamps = (withLamps ? (look?.lamps ?? []) : []).map(([x, y, z, color]) => {
    const l = new PointLight(color, 42, 14, 1.5);
    l.position.set(x, y, z);
    l.castShadow = false;
    scene.add(l);
    return l;
  });

  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(buildSkyScene(look), 0.02);
  scene.environment = rt.texture;
  scene.environmentIntensity = look?.envIntensity ?? 0.6;
  pmrem.dispose();

  return {
    sun,
    hemi,
    lamps,
    environment: rt.texture,
    setShadows(enabled, mapSize) {
      sun.castShadow = enabled;
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
    dispose() {
      rt.dispose();
      scene.remove(hemi, sun, sun.target, ...lamps);
    },
  };
}
