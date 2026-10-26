import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { Material } from 'three';
import type { GameState } from '../../sim';
import { Tile } from '../../sim';
import { MAX_HIDE } from '../assets/occlusionFade';
import type { FrameContext, View } from './types';

/** Safety yellow of the supply marking (straps, plates, floor frame). */
export const SUPPLY_YELLOW = 0xffc414;

/**
 * Tile indices of the marked supply crates still standing (decision RE-C3). `state.supplies` is public
 * (the marking is, the content is not); a tile that stopped being a crate (blasted, crushed) is dropped.
 */
export function standingSupplies(state: Pick<GameState, 'supplies' | 'tiles'>): number[] {
  return state.supplies.filter((i) => state.tiles[i] === Tile.Soft);
}

function stencilTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffc414';
  g.beginPath();
  g.roundRect(6, 6, 116, 116, 18);
  g.fill();
  g.strokeStyle = '#1a1304';
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = '#1a1304';
  g.font = 'bold 100px "Barlow Condensed", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('$', 64, 70);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Painted floor frame: four yellow corner brackets round the crate foot (visible from every angle). */
function frameTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffc414';
  g.lineWidth = 9;
  g.lineCap = 'square';
  const a = 10;
  const b = 118;
  const len = 34;
  for (const [x, y, sx, sy] of [
    [a, a, 1, 1],
    [b, a, -1, 1],
    [a, b, 1, -1],
    [b, b, -1, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(x + sx * len, y);
    g.lineTo(x, y);
    g.lineTo(x, y + sy * len);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface Mark {
  root: Group;
  /** Materials faded together with the crate they sit on. */
  fading: Material[];
  frame: MeshBasicMaterial;
}

/**
 * Marked supply crates (`$` in an arena layout): each wooden crate gets yellow straps over the top and a
 * stencilled `$` plate on the camera-facing side and the lid, plus a pulsing painted frame on the floor.
 * Marks follow `state.supplies` (they vanish with the crate), are drawn flat on the crate so they hide
 * nothing, and dissolve together with the crate when it dissolves for a fighter standing behind it
 * (`fadeOf`, ArenaView.hideAmount). The crate itself is a fixed model chosen by ArenaView.
 */
export class SupplyMarkViews implements View {
  readonly group = new Group();
  private readonly marks = new Map<number, Mark>();
  private readonly strapGeo = new BoxGeometry(0.1, 0.93, 0.94);
  private readonly plateGeo = new PlaneGeometry(0.5, 0.5);
  private readonly lidGeo = new PlaneGeometry(0.58, 0.58);
  private readonly frameGeo = new PlaneGeometry(1.12, 1.12);
  private readonly stencil = stencilTexture();
  private readonly frameTex = frameTexture();

  constructor(
    private readonly fadeOf: (tile: number) => number,
    private readonly tiltOf: (x: number, y: number) => number,
  ) {}

  update(ctx: FrameContext): void {
    const { state, layout, time } = ctx;
    const standing = new Set(standingSupplies(state));
    for (const [i, mark] of this.marks) {
      if (standing.has(i)) continue;
      this.group.remove(mark.root);
      for (const m of [...mark.fading, mark.frame]) m.dispose();
      this.marks.delete(i);
    }
    for (const i of standing) {
      let mark = this.marks.get(i);
      if (!mark) {
        const x = i % state.width;
        const y = Math.floor(i / state.width);
        mark = this.build();
        mark.root.position.set(layout.wx(x), 0, layout.wz(y));
        mark.root.rotation.y = this.tiltOf(x, y);
        this.group.add(mark.root);
        this.marks.set(i, mark);
      }
      const keep = 1 - Math.min(1, this.fadeOf(i) / MAX_HIDE);
      for (const m of mark.fading) m.opacity = keep;
      mark.frame.opacity = (0.72 + 0.28 * Math.sin(time * 3.2 + i)) * keep;
      mark.root.visible = keep > 0.03;
    }
  }

  private build(): Mark {
    const root = new Group();
    const strap = new MeshStandardMaterial({
      color: SUPPLY_YELLOW,
      emissive: 0x3a2a00,
      roughness: 0.55,
      transparent: true,
    });
    const plate = new MeshBasicMaterial({ map: this.stencil, transparent: true });
    const frame = new MeshBasicMaterial({
      map: this.frameTex,
      transparent: true,
      depthWrite: false,
    });
    for (const sx of [-0.22, 0.22]) {
      const s = new Mesh(this.strapGeo, strap);
      s.position.set(sx, 0.465, 0);
      root.add(s);
    }
    // the side the camera sees (+z = south) and the lid
    const front = new Mesh(this.plateGeo, plate);
    front.position.set(0, 0.45, 0.452);
    root.add(front);
    const lid = new Mesh(this.lidGeo, plate);
    lid.rotation.x = -Math.PI / 2;
    lid.position.set(0, 0.93, 0);
    root.add(lid);
    const floor = new Mesh(this.frameGeo, frame);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.014;
    floor.renderOrder = 2;
    root.add(floor);
    for (const o of root.children) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
    root.userData.grit = 'none';
    return { root, fading: [strap, plate], frame };
  }

  dispose(): void {
    for (const mark of this.marks.values()) for (const m of [...mark.fading, mark.frame]) m.dispose();
    this.marks.clear();
    this.strapGeo.dispose();
    this.plateGeo.dispose();
    this.lidGeo.dispose();
    this.frameGeo.dispose();
    this.stencil.dispose();
    this.frameTex.dispose();
  }
}
