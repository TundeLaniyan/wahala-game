import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { GameState, SimEvent } from '../../sim';
import type { Effects } from '../fx/Effects';
import type { Layout } from '../coords';
import { HIT_COLORS, PIP_MAX, hitFeedback, pipColor, pipCounts, pipReason } from './damageModel';
import { playerGridPos } from './motion';
import type { FrameContext, View } from './types';

/** Enemy health pips are drawn this high (above the head, under the name tag). */
const PIP_Y = 1.98;
const PIP_SIZE = 0.13;
const PIP_STEP = 0.155;
/** At most this many enemies show pips at once (the rule already keeps it to a few). */
const PIP_ENEMIES = 12;

/** Does this match carry campaign health at all? Only then is the damage feedback built (a normal match builds nothing). */
export function hasCampaignFeedback(state: GameState): boolean {
  return !!state.mission || !!(state as { raid?: unknown }).raid || state.players.some((p) => !!p.vitals);
}

/** What the view needs from the player views to flinch a fighter (kept to one method so tests can fake it). */
export interface JoltTarget {
  jolt(id: number, dx: number, dz: number, amount: number): void;
}

let pipTex: CanvasTexture | null = null;
function pipTexture(): CanvasTexture {
  if (!pipTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0c0e12';
    g.beginPath();
    g.roundRect(1, 1, 30, 30, 8);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(6, 6, 20, 20, 5);
    g.fill();
    pipTex = new CanvasTexture(c);
    pipTex.colorSpace = SRGBColorSpace;
  }
  return pipTex;
}

/**
 * Campaign damage feedback (docs/RAID_PRESENTATION.md): the player must understand why an enemy died, was dazed or lived.
 *
 *  - thin health PIPS above an enemy's head, only when it is targeted (straight ahead of the player), recently hurt, or
 *    close (`pipReason`, never for everybody, never for a boss / lieutenant - their bar is in the HUD rail);
 *  - a hit flash (red on the player, cream on an enemy), a small ring and a flinch on `campaignHit` damage; a yellow
 *    flash on a daze; a distinct WHITE-BLUE spark and ring when Armour or the Okada absorbed it; a poof on
 *    `campaignDefeated`. The dazed halo (stars) is `PlayerViews`' own, driven by `dazedUntil`.
 *
 * Reads `Player.vitals` and the events only; the numbers are the sim's. Camera shake goes through `fx.shake`, whose mode
 * is off for reduced motion; the flinch is switched off here for `prefers-reduced-motion`.
 */
export class DamageViews implements View {
  readonly group = new Group();
  private readonly geo = new PlaneGeometry(1, 1);
  private readonly mat = new MeshBasicMaterial({
    map: pipTexture(),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private readonly pips: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();
  private readonly reduced: boolean;
  private shown = 0;

  constructor(
    private readonly players: JoltTarget | null = null,
    reducedMotion = typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches,
  ) {
    this.reduced = reducedMotion;
    this.pips = new InstancedMesh(this.geo, this.mat, PIP_ENEMIES * PIP_MAX);
    this.pips.instanceMatrix.setUsage(DynamicDrawUsage);
    this.pips.count = 0;
    this.pips.frustumCulled = false;
    this.pips.renderOrder = 35;
    this.pips.setColorAt(0, this.c.setHex(0xffffff));
    this.group.add(this.pips);
  }

  /** Enemies whose pips were drawn last frame (tests / the debug handle). */
  get pipEnemies(): number {
    return this.shown;
  }

  // ------------------------------------------------------------------------------------------ events

  handleEvents(
    events: readonly SimEvent[],
    state: GameState,
    fx: Effects,
    layout: Layout,
    localId: number,
  ): void {
    for (const e of events) {
      if (e.type === 'campaignHit') {
        const fb = hitFeedback(e.result, e.victimId === localId);
        if (fb.kind === 'none') continue;
        const x = layout.wx(e.x);
        const z = layout.wz(e.y);
        fx.flash(x, 0.95, z, fb.size, fb.color, fb.life);
        if (fb.ring) fx.shockwave(x, z, fb.kind === 'shield' ? 1.3 : 0.8, fb.color);
        if (fb.kind === 'shield') {
          // the layer that took it: a spray of cold sparks and a second, wider ring
          fx.sparkle(e.x, e.y, HIT_COLORS.shield);
          fx.shockwave(x, z, 1.7, 0x6fb4ff);
        }
        if (fb.shake > 0) fx.shake = Math.min(1, fx.shake + fb.shake);
        if (fb.jolt > 0 && !this.reduced && this.players) {
          const from = e.byId !== null ? state.players[e.byId] : undefined;
          let dx = from ? e.x - from.x : 0;
          let dz = from ? e.y - from.y : 0;
          const len = Math.hypot(dx, dz);
          if (len < 1e-3) {
            // no attacker on the board (a hazard): shove away from the way the victim faces
            const f = state.players[e.victimId]?.facing;
            dx = f === 'left' ? 1 : f === 'right' ? -1 : 0;
            dz = f === 'up' ? 1 : f === 'down' ? -1 : 0;
          } else {
            dx /= len;
            dz /= len;
          }
          this.players.jolt(e.victimId, dx, dz, fb.jolt);
        }
      } else if (e.type === 'campaignDefeated') {
        // the enemy (or the player) is gone: a poof of smoke with the comic stars, so a defeat is never silent
        const x = layout.wx(e.x);
        const z = layout.wz(e.y);
        fx.comicPuff(e.x, e.y);
        fx.dust(e.x, e.y, 10, 0.9);
        fx.flash(x, 0.9, z, 2.4, 0xffffff, 0.3);
        fx.shockwave(x, z, 1.4, 0xffffff);
        if (e.victimId === localId) fx.shake = Math.min(1, fx.shake + 0.22);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ pips

  update(ctx: FrameContext): void {
    const { state, alpha } = ctx;
    const local = state.players[ctx.info.localPlayerId];
    this.pips.count = 0;
    let n = 0;
    let enemies = 0;
    const cam = ctx.camera?.quaternion ?? NO_ROTATION;
    for (const p of state.players) {
      if (enemies >= PIP_ENEMIES) break;
      if (!pipReason(p, local, state.tick)) continue;
      const v = p.vitals!;
      const { filled, total } = pipCounts(v.hp, v.maxHp);
      const frac = v.maxHp > 0 ? v.hp / v.maxHp : 0;
      const pos = playerGridPos(p, alpha);
      const wx = ctx.layout.wx(pos.x);
      const wz = ctx.layout.wz(pos.y);
      // a mounted fighter stands taller
      const y = PIP_Y + (p.mounted ? 0.28 : 0) + 0.06;
      for (let i = 0; i < total; i++) {
        // pips run along the screen's horizontal (the camera's right axis), centred over the head
        const off = (i - (total - 1) / 2) * PIP_STEP;
        this.p
          .set(off, 0, 0)
          .applyQuaternion(cam)
          .add(this.s.set(wx, y, wz));
        this.m.compose(this.p, cam, this.s.set(PIP_SIZE, PIP_SIZE, 1));
        this.pips.setMatrixAt(n, this.m);
        this.c.setHex(pipColor(i < filled, frac));
        this.pips.setColorAt(n, this.c);
        n++;
      }
      enemies++;
    }
    this.pips.count = n;
    this.shown = enemies;
    this.pips.instanceMatrix.needsUpdate = true;
    if (this.pips.instanceColor) this.pips.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.pips.dispose();
    pipTex?.dispose();
    pipTex = null;
  }
}

const NO_ROTATION = new Quaternion();
