/**
 * Ring equipment of a field mission's `destroyTargets` leg (docs/CAMPAIGN_SECTOR_AI.md, decision DS7): a relay box, a
 * toll box, a switch cabinet, a parts cage or a control point standing on its tile, with a blinking red warning light
 * while it stands. Damage shows (a dent tilt, the light faster), a wreck leaves a scorched stump and a burst of sparks
 * and debris. Presentation only: the rule (only the human's blasts count) is `src/sim/mission/equipment.ts`; this view
 * reads `state.mission.field.targets` and consumes nothing else. A match without equipment builds nothing.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { GameState } from '../../sim';
import type { FrameContext, View } from './types';

/** Body colour and size (w, h, d) by kind; every piece is a steel cabinet of its own shape. */
const LOOK: Readonly<Record<string, { color: number; size: [number, number, number] }>> = {
  relayBox: { color: 0x3c4a58, size: [0.62, 1.15, 0.5] },
  tollBox: { color: 0x8a6a1e, size: [0.72, 1.3, 0.62] },
  switchCabinet: { color: 0x4a5a3a, size: [0.85, 1.45, 0.5] },
  partsCage: { color: 0x5a5e62, size: [0.9, 1.0, 0.8] },
  controlPoint: { color: 0x6a2a24, size: [0.7, 1.55, 0.7] },
};
const DEFAULT_LOOK = LOOK.relayBox!;

interface Piece {
  root: Group;
  body: Mesh;
  light: Mesh;
  stump: Mesh;
  wrecked: boolean;
}

export const hasFieldEquipment = (state: GameState): boolean => !!state.mission?.field?.targets?.length;

export class FieldEquipmentViews implements View {
  readonly group = new Group();
  private readonly pieces = new Map<string, Piece>();
  private readonly owned: { dispose(): void }[] = [];
  private readonly lightOn = new MeshBasicMaterial({ color: 0xff2a18 });
  private readonly lightOff = new MeshBasicMaterial({ color: 0x3a0a08 });
  private readonly stripe = new MeshStandardMaterial({ color: 0xe3b21a, roughness: 0.7 });
  private readonly scorch = new MeshStandardMaterial({ color: 0x1c1814, roughness: 1 });

  constructor() {
    this.group.name = 'fieldEquipment';
    this.owned.push(this.lightOn, this.lightOff, this.stripe, this.scorch);
  }

  private build(kind: string): Piece {
    const look = LOOK[kind] ?? DEFAULT_LOOK;
    const [w, h, d] = look.size;
    const root = new Group();
    const bodyGeo = new BoxGeometry(w, h, d).translate(0, h / 2, 0);
    const bodyMat = new MeshStandardMaterial({ color: look.color, roughness: 0.55, metalness: 0.45 });
    const body = new Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    // a hazard stripe across the front and a plinth
    const stripeGeo = new BoxGeometry(w * 1.01, 0.12, d * 1.01).translate(0, h * 0.62, 0);
    const plinthGeo = new BoxGeometry(w + 0.12, 0.1, d + 0.12).translate(0, 0.05, 0);
    body.add(new Mesh(stripeGeo, this.stripe), new Mesh(plinthGeo, this.scorch));
    const lightGeo = new CylinderGeometry(0.07, 0.07, 0.12, 8).translate(0, h + 0.06, 0);
    const light = new Mesh(lightGeo, this.lightOn);
    const stumpGeo = new BoxGeometry(w * 0.9, 0.22, d * 0.9).translate(0, 0.11, 0);
    const stump = new Mesh(stumpGeo, this.scorch);
    stump.visible = false;
    root.add(body, light, stump);
    this.owned.push(bodyGeo, bodyMat, stripeGeo, plinthGeo, lightGeo, stumpGeo);
    this.group.add(root);
    return { root, body, light, stump, wrecked: false };
  }

  update(ctx: FrameContext): void {
    const targets = ctx.state.mission?.field?.targets;
    if (!targets) return;
    const { layout, time } = ctx;
    for (const t of targets) {
      let piece = this.pieces.get(t.id);
      if (!piece) {
        piece = this.build(t.kind);
        piece.root.position.set(layout.wx(t.x), 0, layout.wz(t.y));
        this.pieces.set(t.id, piece);
      }
      if (t.destroyed) {
        if (!piece.wrecked) {
          piece.wrecked = true;
          piece.body.visible = false;
          piece.light.visible = false;
          piece.stump.visible = true;
          ctx.fx.blockDebris(t.x, t.y, 'drums');
          ctx.fx.dust(t.x, t.y, 14, 1.1);
        }
        continue;
      }
      const damaged = t.hp < t.maxHp;
      piece.body.rotation.z = damaged ? 0.12 : 0;
      // the warning light blinks while the piece stands (faster once it is hit)
      const rate = damaged ? 7 : 3;
      piece.light.material = Math.sin(time * rate) > 0 ? this.lightOn : this.lightOff;
    }
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.pieces.clear();
  }
}
