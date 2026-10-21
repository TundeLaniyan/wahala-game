import {
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import type { Texture } from 'three';
import { floorTexture } from '../textures';

/** Every bundled floor texture, keyed by file name (`<set>_albedo`, `<set>_normal`, `<set>_orm`). */
const urls = import.meta.glob('../../assets/textures/*.jpg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const URL_BY_NAME = new Map(
  Object.entries(urls).map(([path, url]) => [
    path
      .split('/')
      .pop()!
      .replace(/\.jpg$/, ''),
    url,
  ]),
);

/** The atlas holds CELLS x CELLS distinct slabs; one slab covers one arena tile. */
const CELLS = 4;
/** Anisotropic filtering keeps the far rows of the floor crisp under the low 3/4 camera. */
export const FLOOR_ANISOTROPY = 16;

function load(url: string, color: boolean, cols: number, rows: number): Texture {
  const t = new TextureLoader().load(url);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(cols / CELLS, rows / CELLS);
  t.anisotropy = FLOOR_ANISOTROPY;
  t.minFilter = LinearMipmapLinearFilter;
  if (color) t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Tiled floor with normal + roughness maps from the texture set `set` (e.g. `floor` = bus-park
 * concrete slabs, `market` = interlocking pavers); falls back to the drawn texture tinted
 * `fallback` if the files are missing.
 */
export function floorMaterial(
  cols: number,
  rows: number,
  set = 'floor',
  fallback?: string,
): MeshStandardMaterial {
  const albedo = URL_BY_NAME.get(`${set}_albedo`);
  const normal = URL_BY_NAME.get(`${set}_normal`);
  const orm = URL_BY_NAME.get(`${set}_orm`);
  if (albedo && normal && orm) {
    return new MeshStandardMaterial({
      map: load(albedo, true, cols, rows),
      normalMap: load(normal, false, cols, rows),
      roughnessMap: load(orm, false, cols, rows),
      roughness: 1,
      metalness: 0,
    });
  }
  return new MeshStandardMaterial({ map: floorTexture(cols, rows, fallback), roughness: 0.95, metalness: 0 });
}
