import {
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import type { Texture } from 'three';
import { floorTexture } from '../textures';
import { arenaLook } from '../arenaLook';

const albedoUrl = new URL('../../assets/textures/floor_albedo.jpg', import.meta.url).href;
const normalUrl = new URL('../../assets/textures/floor_normal.jpg', import.meta.url).href;
const ormUrl = new URL('../../assets/textures/floor_orm.jpg', import.meta.url).href;

/** The atlas holds CELLS x CELLS distinct slabs; one slab covers one arena tile. */
const CELLS = 4;

function load(url: string, color: boolean, cols: number, rows: number): Texture {
  const t = new TextureLoader().load(url);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(cols / CELLS, rows / CELLS);
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  if (color) t.colorSpace = SRGBColorSpace;
  return t;
}

/** Concrete-slab floor with normal + roughness maps; falls back to the drawn texture if the files are missing. */
export function floorMaterial(cols: number, rows: number, arenaId = 'danfoBusPark'): MeshStandardMaterial {
  const color = arenaLook(arenaId).floorTint;
  try {
    const orm = load(ormUrl, false, cols, rows);
    return new MeshStandardMaterial({
      color,
      map: load(albedoUrl, true, cols, rows),
      normalMap: load(normalUrl, false, cols, rows),
      roughnessMap: orm,
      roughness: 1,
      metalness: 0,
    });
  } catch {
    return new MeshStandardMaterial({
      color,
      map: floorTexture(cols, rows),
      roughness: 0.95,
      metalness: 0,
    });
  }
}
