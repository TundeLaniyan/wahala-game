import {
  ACESFilmicToneMapping,
  AnimationMixer,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { CharacterId } from '../sim';
import { createSceneLights } from './lighting';
import { assets } from './assets/library';

const CAST: CharacterId[] = ['streetBaller', 'lekkiBoy', 'campusQueen'];

/**
 * Renders a transparent head-and-shoulders portrait of each rigged character (HUD cards, title screen).
 * Uses a throw-away WebGL context so the game renderer is never disturbed. Returns only the characters
 * whose models are loaded.
 */
export function renderCastPortraits(size = 256): Partial<Record<CharacterId, HTMLCanvasElement>> {
  const out: Partial<Record<CharacterId, HTMLCanvasElement>> = {};
  if (!CAST.some((id) => assets.has(`char_${id}`))) return out;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const lights = createSceneLights(scene, renderer);
  lights.setShadows(false, 256);
  lights.sun.position.set(-3, 4, 5);
  lights.sun.intensity = 3.4;
  lights.hemi.intensity = 1.1;
  const camera = new PerspectiveCamera(22, 1, 0.1, 20);
  for (const id of CAST) {
    const model = assets.instance(`char_${id}`);
    if (!model) continue;
    const clip = assets.clips(`char_${id}`).find((c) => c.name === 'Idle');
    if (clip) {
      const mixer = new AnimationMixer(model);
      mixer.clipAction(clip).play();
      mixer.setTime(0.6);
    }
    model.rotation.y = -0.38;
    scene.add(model);
    camera.position.set(0.2, 1.62, 1.95);
    camera.lookAt(0, 1.5, 0);
    renderer.render(scene, camera);
    const copy = document.createElement('canvas');
    copy.width = copy.height = size;
    copy.getContext('2d')!.drawImage(renderer.domElement, 0, 0, size, size);
    out[id] = copy;
    scene.remove(model);
  }
  lights.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
