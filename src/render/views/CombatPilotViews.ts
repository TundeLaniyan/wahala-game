/**
 * The combat pilot's readable fight (docs/OSHODI_COMBAT_PILOT.md, decision CP4). Built only for a match that carries
 * `config.combatPilot` (the Oshodi Terminal Approach field mission); presentation only - it reads the state and the
 * events, it decides nothing.
 *
 *   wind-up      an enemy winding up a punch: a red ring under it that closes as the blow comes, a red mark on the
 *                tile it is aimed at, and the enemy's swing clip stretched so the fist lands when the sim resolves it;
 *   open         an enemy planted after its swing or throw (the counter window): a cyan ring;
 *   staggered    an enemy reeling from the human's punch: a yellow ring (it cannot act);
 *   swing        every accepted punch of the human: a short white arc on the faced tile, hit or miss (a miss is
 *                plainly a miss: the arc and the whoosh, no impact);
 *   refused      a generator press that cannot be done: NO SOCKET / TILE TAKEN / WAIT over the player.
 */
import {
  CircleGeometry,
  DoubleSide,
  NormalBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three';
import type { Dir, GameState, Player, SimEvent } from '../../sim';
import { DIR_VEC } from '../../sim';
import type { Effects } from '../fx/Effects';
import type { Layout } from '../coords';
import { playerGridPos } from './motion';
import type { PlayerViews } from './PlayerViews';
import type { FrameContext, View } from './types';

const RING = new RingGeometry(0.33, 0.52, 36);
const DISC = new CircleGeometry(0.44, 28);

const COLORS = { windup: 0xff1e12, aim: 0xff3a1e, open: 0x18d8ff, stagger: 0xffcc00 } as const;

interface Marks {
  ring: Mesh;
  aim: Mesh;
}

const REFUSED_TEXT: Record<Extract<SimEvent, { type: 'placeRefused' }>['reason'], string> = {
  capacity: 'NO SOCKET',
  occupied: 'TILE TAKEN',
  stunned: 'WAIT',
  busy: 'WAIT',
};

/** Solid (not additive) and drawn over the floor art, so it reads on a pale yard by day as well as at night. */
function material(color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    blending: NormalBlending,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  });
}

export const hasCombatPilot = (state: GameState): boolean => state.config.combatPilot !== undefined;

export class CombatPilotViews implements View {
  readonly group = new Group();
  private readonly marks = new Map<number, Marks>();
  /** When each enemy's current wind-up started (tick), to show how far it has come. */
  private readonly windStart = new Map<number, number>();

  constructor(private readonly players: PlayerViews | null) {}

  handleEvents(
    events: readonly SimEvent[],
    state: GameState,
    fx: Effects,
    layout: Layout,
    localId: number,
  ): void {
    for (const e of events) {
      if (e.type === 'attackStarted') {
        const p = state.players[e.playerId];
        if (!p || p.enemyKind === undefined) continue;
        this.windStart.set(p.id, state.tick);
        // the enemy's swing is stretched over its wind-up: the blow lands when the sim resolves it
        this.players?.playOver(p.id, 'Push', Math.max(0.1, (e.resolveTick - state.tick) / 60));
      } else if (e.type === 'punchSwing') {
        const p = state.players[e.playerId];
        if (!p) continue;
        const v = DIR_VEC[e.dir as Dir];
        const x = layout.wx(p.x + v.dx * 0.6);
        const z = layout.wz(p.y + v.dy * 0.6);
        fx.shockwave(x, z, 0.55, 0xffffff);
      } else if (e.type === 'placeRefused' && e.playerId === localId) {
        fx.floatText(e.x, e.y, REFUSED_TEXT[e.reason], '#ff8a7a');
      }
    }
  }

  update(ctx: FrameContext): void {
    const { state, alpha, layout } = ctx;
    const live = new Set<number>();
    for (const p of state.players) {
      if (!p.alive || p.enemyKind === undefined) continue;
      const kind = this.kindOf(state, p);
      if (!kind) continue;
      live.add(p.id);
      const m = this.marksOf(p.id);
      const pos = playerGridPos(p, alpha);
      m.ring.position.set(layout.wx(pos.x), 0.06, layout.wz(pos.y));
      const mat = m.ring.material as MeshBasicMaterial;
      mat.color.setHex(COLORS[kind]);
      m.ring.visible = true;
      m.aim.visible = false;
      if (kind === 'windup' && p.attack) {
        // the ring closes in on the enemy as the blow comes
        const start = this.windStart.get(p.id) ?? state.tick;
        const total = Math.max(1, p.attack.resolveTick - start);
        const left = Math.max(0, (p.attack.resolveTick - state.tick - alpha) / total);
        m.ring.scale.setScalar(0.8 + 0.8 * left);
        mat.opacity = 1;
        const target = state.players[p.attack.targetId];
        if (target?.alive) {
          const tp = playerGridPos(target, alpha);
          m.aim.position.set(layout.wx(tp.x), 0.05, layout.wz(tp.y));
          (m.aim.material as MeshBasicMaterial).opacity = 0.3 + 0.45 * (1 - left);
          m.aim.visible = true;
        }
      } else {
        m.ring.scale.setScalar(1);
        mat.opacity = 0.7 + 0.25 * Math.sin(ctx.time * 12);
      }
    }
    for (const [id, m] of this.marks) {
      if (live.has(id)) continue;
      m.ring.visible = false;
      m.aim.visible = false;
    }
  }

  /** What the enemy's ring shows now, or null for none. */
  private kindOf(state: GameState, p: Readonly<Player>): keyof typeof COLORS | null {
    if (p.attack) return 'windup';
    if (state.tick < p.dazedUntil) return 'stagger';
    if (state.tick < p.rootedUntil) return 'open';
    return null;
  }

  private marksOf(id: number): Marks {
    let m = this.marks.get(id);
    if (!m) {
      const ring = new Mesh(RING, material(COLORS.windup));
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 9;
      const aim = new Mesh(DISC, material(COLORS.aim));
      aim.rotation.x = -Math.PI / 2;
      aim.renderOrder = 8;
      this.group.add(ring, aim);
      m = { ring, aim };
      this.marks.set(id, m);
    }
    return m;
  }

  dispose(): void {
    for (const m of this.marks.values()) {
      (m.ring.material as MeshBasicMaterial).dispose();
      (m.aim.material as MeshBasicMaterial).dispose();
    }
    this.marks.clear();
    this.group.clear();
  }
}
