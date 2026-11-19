/**
 * The briefing's target picture (docs/MISSION_GUIDANCE.md, decision MG2): the REAL in-game object rendered once into an
 * image with the game's own builders - the equipment cabinet (`buildEquipmentPiece`), the marked raid crate
 * (`markedCargoMaterial` on the cargo box), the field door and the boss objective icons (`buildIcon`) - in a small
 * offscreen WebGL renderer that is thrown away straight after. The result is a PNG data URL, cached per model for the
 * session. Null when WebGL is unavailable (tests, a blocked context): the card then shows the objective glyph.
 * Presentation only; loaded on demand (`import()`), so the menu chunk does not grow.
 */
import {
  Box3,
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import type { ObjectiveKind } from '../sim';
import { buildEquipmentPiece } from './views/FieldEquipmentViews';
import { buildIcon, iconFor } from './views/missionIcons';
import { cargoBoxGeometry, markedCargoMaterial } from './views/RaidViews';
import { markedFaceTexture } from './views/raidTextures';

/** What to preview (the briefing model's `BriefModel`). */
export type PreviewModel =
  | { kind: 'equipment'; equipment: string }
  | { kind: 'cargo' }
  | { kind: 'door' }
  | { kind: 'bossNode'; objective: ObjectiveKind };

export const previewKey = (m: PreviewModel): string =>
  m.kind === 'equipment'
    ? `equipment:${m.equipment}`
    : m.kind === 'bossNode'
      ? `boss:${m.objective}`
      : m.kind;

const cache = new Map<string, Promise<string | null>>();

/** Builds the object of `model` (and what must be disposed with it). */
function buildObject(model: PreviewModel, owned: { dispose(): void }[]): Object3D {
  switch (model.kind) {
    case 'equipment': {
      const stripe = new MeshStandardMaterial({ color: 0xe3b21a, roughness: 0.7 });
      const scorch = new MeshStandardMaterial({ color: 0x1c1814, roughness: 1 });
      const light = new MeshBasicMaterial({ color: 0xff2a18 });
      owned.push(stripe, scorch, light);
      return buildEquipmentPiece(model.equipment, { stripe, scorch, light }, owned).root;
    }
    case 'cargo': {
      const map = markedFaceTexture().clone(); // the shared texture stays the raid view's
      map.needsUpdate = true;
      const geo = cargoBoxGeometry();
      const mat = markedCargoMaterial(map);
      owned.push(map, geo, mat);
      return new Mesh(geo, mat);
    }
    case 'door':
    case 'bossNode': {
      const geo = buildIcon(model.kind === 'door' ? 'door' : iconFor(model.objective, ''));
      const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });
      owned.push(geo, mat);
      return new Mesh(geo, mat);
    }
  }
}

function render(model: PreviewModel, size: number): string | null {
  if (typeof document === 'undefined') return null;
  const owned: { dispose(): void }[] = [];
  let renderer: WebGLRenderer | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new Scene();
    scene.add(new HemisphereLight(0xfff4e0, 0x2a2f3a, 1.7));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(2.5, 4, 3);
    scene.add(sun);

    const holder = new Group();
    const object = buildObject(model, owned);
    holder.add(object);
    holder.rotation.y = -0.55; // a three-quarter view, like the game camera's angle on it
    // a soft contact shadow on the floor
    const shadowGeo = new CircleGeometry(0.62, 28).rotateX(-Math.PI / 2);
    const shadowMat = new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    owned.push(shadowGeo, shadowMat);
    const shadow = new Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.002;
    scene.add(shadow, holder);

    // frame the object: its bounding box fills about 70 % of the picture
    const box = new Box3().setFromObject(holder);
    const centre = box.getCenter(new Vector3());
    const extent = box.getSize(new Vector3());
    const radius = Math.max(extent.x, extent.y, extent.z) * 0.62 + 0.05;
    const camera = new PerspectiveCamera(30, 1, 0.05, 50);
    const dist = radius / Math.sin((30 * Math.PI) / 180 / 2);
    camera.position.set(centre.x, centre.y + dist * 0.42, centre.z + dist * 0.91);
    camera.lookAt(centre);
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    for (const o of owned) o.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
}

/**
 * The picture of `model` as a data URL (rendered once per model; later calls share the result). Waits a frame first so
 * the briefing card paints its glyph before the render.
 */
export function previewImage(model: PreviewModel, size = 256): Promise<string | null> {
  const key = `${previewKey(model)}@${size}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise<string | null>((resolve) => setTimeout(() => resolve(render(model, size)), 0));
    cache.set(key, p);
  }
  return p;
}
