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
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import type { Texture, WebGLRenderer } from 'three';

export interface SceneLights {
  sun: DirectionalLight;
  hemi: HemisphereLight;
  environment: Texture;
  setShadows(enabled: boolean, mapSize: number): void;
  dispose(): void;
}

/** Procedural dusk sky used only to build the reflection environment. */
function buildSkyScene(): Scene {
  const sky = new Scene();
  const dome = new Mesh(
    new SphereGeometry(50, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new Color(0x6f9bd1) },
        horizon: { value: new Color(0xffd7a0) },
        ground: { value: new Color(0x6a5846) },
      },
      vertexShader:
        'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.4)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  sky.add(dome);
  // a bright "sun" patch so glossy surfaces pick up a warm highlight
  const sun = new Mesh(new SphereGeometry(4, 16, 8), new MeshBasicMaterial({ color: 0xfff1cc }));
  sun.position.set(-30, 26, 18);
  sky.add(sun);
  return sky;
}

export function createSceneLights(scene: Scene, renderer: WebGLRenderer): SceneLights {
  const hemi = new HemisphereLight(0xffe9cc, 0x6b5a47, 0.9);
  const sun = new DirectionalLight(0xffd29a, 3.1);
  sun.position.set(-10, 15, 7);
  sun.target.position.set(0, 0, 0);
  const cam = sun.shadow.camera;
  cam.left = -14;
  cam.right = 14;
  cam.top = 12;
  cam.bottom = -12;
  cam.near = 1;
  cam.far = 50;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(hemi, sun, sun.target);

  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(buildSkyScene(), 0.02);
  scene.environment = rt.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  return {
    sun,
    hemi,
    environment: rt.texture,
    setShadows(enabled, mapSize) {
      sun.castShadow = enabled;
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
    dispose() {
      rt.dispose();
      scene.remove(hemi, sun, sun.target);
    },
  };
}
