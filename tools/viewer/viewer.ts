/**
 * Dev-only glTF viewer used to inspect generated assets under the game's lighting and camera.
 *
 *   /tools/viewer/viewer.html?model=/src/assets/models/x.glb&view=game&clip=Run&t=0.3
 *
 * Params: model (url, repeatable as models=a,b,c to lay several side by side), view =
 * game|front|back|side|three|top|close|head, dist (camera distance), ty (look-at height), clip (animation name), t (seconds into the clip),
 * rot (degrees about Y), scale, grid=0|1, bg (hex), models spacing via space=2.5.
 * When ready it sets window.__VIEWER__ = { ready, stats, clips }.
 */
import {
  AnimationMixer,
  Box3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSceneLights } from '../../src/render/lighting';
import { installGrading } from '../../src/render/grading';
import { floorTexture } from '../../src/render/textures';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const W = Number(q.get('w') ?? innerWidth);
const H = Number(q.get('h') ?? innerHeight);

const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = SRGBColorSpace;
installGrading(renderer);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
const scene = new Scene();
scene.background = new Color(Number('0x' + (q.get('bg') ?? 'e3b985')));
const lights = createSceneLights(scene, renderer);
lights.setShadows(true, 2048);

if (q.get('grid') !== '0') {
  const floor = new Mesh(
    new PlaneGeometry(15, 11),
    new MeshStandardMaterial({ map: floorTexture(15, 11), roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

const camera = new PerspectiveCamera(36, W / H, 0.05, 200);
const loader = new GLTFLoader();
const urls = (q.get('models') ?? q.get('model') ?? '').split(',').filter(Boolean);
const group = new Group();
scene.add(group);
const mixers: AnimationMixer[] = [];
const stats = {
  triangles: 0,
  meshes: 0,
  materials: 0,
  bones: 0,
  clips: [] as string[],
  bbox: [0, 0, 0] as number[],
};

async function main(): Promise<void> {
  const space = Number(q.get('space') ?? 2.5);
  let i = 0;
  for (const url of urls) {
    const gltf = await loader.loadAsync(url);
    const obj: Object3D = clone(gltf.scene);
    obj.scale.setScalar(Number(q.get('scale') ?? 1));
    obj.rotation.y = (Number(q.get('rot') ?? 0) * Math.PI) / 180;
    obj.position.x = (i - (urls.length - 1) / 2) * space;
    obj.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    group.add(obj);
    const mats = new Set<unknown>();
    obj.traverse((o) => {
      const m = o as Mesh & { isSkinnedMesh?: boolean };
      if (m.isMesh) {
        stats.meshes++;
        const g = m.geometry;
        stats.triangles += (g.index ? g.index.count : g.attributes.position!.count) / 3;
        mats.add(m.material);
      }
      if ((o as { isBone?: boolean }).isBone) stats.bones++;
    });
    stats.materials += mats.size;
    stats.clips.push(...gltf.animations.map((a) => `${a.name}(${a.duration.toFixed(2)}s)`));
    const clipName = q.get('clip');
    if (clipName && gltf.animations.length) {
      const clip = gltf.animations.find((a) => a.name === clipName) ?? gltf.animations[0]!;
      const mixer = new AnimationMixer(obj);
      mixer.clipAction(clip).play();
      mixer.setTime(Number(q.get('t') ?? 0));
      mixers.push(mixer);
    }
    i++;
  }
  const box = new Box3().setFromObject(group);
  const size = box.getSize(new Vector3());
  stats.bbox = [size.x, size.y, size.z].map((n) => Math.round(n * 100) / 100);
  frame(box);
  renderer.render(scene, camera);
  (window as unknown as { __VIEWER__: unknown }).__VIEWER__ = { ready: true, stats };
}

function frame(box: Box3): void {
  const view = q.get('view') ?? 'game';
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const r = Math.max(size.x, size.y, size.z);
  const target = new Vector3(center.x, Math.min(center.y, size.y * 0.5), center.z);
  let dist = ((r * 0.5) / Math.tan((camera.fov * Math.PI) / 360)) * 1.25 + r * 0.3;
  if (q.has('dist')) dist = Number(q.get('dist'));
  if (q.has('ty')) target.y = Number(q.get('ty'));
  const pos = new Vector3();
  switch (view) {
    case 'front':
      pos.set(0, target.y, dist);
      break;
    case 'back':
      pos.set(0, target.y, -dist);
      break;
    case 'side':
      pos.set(dist, target.y, 0);
      break;
    case 'three':
      pos.set(dist * 0.7, target.y + dist * 0.25, dist * 0.7);
      break;
    case 'top':
      pos.set(0, dist, 0.01);
      break;
    case 'head':
      target.y = size.y * 0.88;
      pos.set(0, target.y + 0.05, dist * 0.42);
      break;
    case 'close':
      pos.set(dist * 0.45, target.y + dist * 0.1, dist * 0.55);
      break;
    default: {
      // the in-game camera: pitch 58 degrees from the south
      const p = (58 * Math.PI) / 180;
      const d = Math.max(dist, 5);
      pos.set(0, Math.sin(p) * d, Math.cos(p) * d).add(new Vector3(target.x, 0, target.z));
    }
  }
  camera.position.copy(pos);
  camera.lookAt(target);
}

main().catch((e) => {
  console.error('viewer error', e);
  (window as unknown as { __VIEWER__: unknown }).__VIEWER__ = { ready: true, error: String(e) };
});
void mixers;
