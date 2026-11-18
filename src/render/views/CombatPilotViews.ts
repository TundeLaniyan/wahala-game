/**
 * The combat pilot's readable fight (docs/OSHODI_COMBAT_PILOT.md, decision CP4), the combat test lab and the human's
 * punches in raids and field missions; presentation only - it reads the state and the events, it decides nothing.
 *
 *   swing        every accepted punch of the human: a short white arc on the faced tile, hit or miss (a miss is
 *                plainly a miss: the arc and the whoosh, no impact);
 *   refused      a generator press that cannot be done: NO SOCKET / TILE TAKEN / WAIT over the player.
 *
 * The ENEMY side of the fight (the wind-up ring, the aimed tile, the open and stagger rings, the stretched swing) moved
 * to `EnemyTelegraphViews` (decision SV1), which every match with campaign enemies builds, this pilot included.
 */
import { Group } from 'three';
import type { Dir, GameState, SimEvent } from '../../sim';
import { DIR_VEC, combatLabAllowed, feelPresetFor } from '../../sim';
import type { CombatLabPreset } from '../../sim';
import type { Effects } from '../fx/Effects';
import type { Layout } from '../coords';
import { impactLook, swingLook, whiffLook } from '../combatLabLook';
import type { PlayerViews } from './PlayerViews';
import type { FrameContext, View } from './types';

const REFUSED_TEXT: Record<Extract<SimEvent, { type: 'placeRefused' }>['reason'], string> = {
  capacity: 'NO SOCKET',
  occupied: 'TILE TAKEN',
  stunned: 'WAIT',
  busy: 'WAIT',
};

/**
 * Built for the Oshodi combat pilot, and for every local City Rumble match (the combat test lab can be switched on in
 * the pause menu at any time: its swing arcs and impacts are drawn here too; docs/COMBAT_TEST_LAB.md).
 */
export const hasCombatPilot = (state: GameState): boolean =>
  state.config.combatPilot !== undefined ||
  combatLabAllowed(state) ||
  state.combatLab?.classic === true || // local Classic Battle (decision CC-F1)
  state.raid !== undefined || // raids and field missions: the human's hit / miss confirmation (presentation only)
  state.mission !== undefined;

export class CombatPilotViews implements View {
  readonly group = new Group();
  /** Fighters whose lab punch in flight was aimed at a rival (a miss of it gets the grey puff). */
  private readonly aimed = new Set<number>();

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
        if (p && p.enemyKind === undefined && !state.config.combatLab && !state.config.combatPilot) {
          // a human's punch in a raid or field mission (no lab rules there, so no `punchSwing`): the same fan at the press
          const look = feelPresetFor(state, p);
          if (look) {
            const d = DIR_VEC[p.facing];
            if (e.targetId >= 0) this.aimed.add(p.id);
            fx.swing(
              layout.wx(p.x),
              layout.wz(p.y),
              d.dx,
              d.dy,
              e.targetId >= 0 ? swingLook(look) : whiffLook(look),
            );
          }
        }
        // (an enemy's wind-up is EnemyTelegraphViews')
      } else if (e.type === 'punchSwing') {
        const p = state.players[e.playerId];
        if (!p) continue;
        const v = DIR_VEC[e.dir as Dir];
        const lab = state.config.combatLab;
        if (lab) {
          // the lab: each level's own arc (colour, size, opening); a swing at the air is the thin grey miss
          if (e.targetId !== null) this.aimed.add(e.playerId);
          const look = e.targetId === null ? whiffLook(lab) : swingLook(lab);
          fx.swing(layout.wx(p.x), layout.wz(p.y), v.dx, v.dy, look);
          if (e.targetId === null) fx.dust(p.x + v.dx * 0.9, p.y + v.dy * 0.9, 2, 0.3);
          continue;
        }
        const x = layout.wx(p.x + v.dx * 0.6);
        const z = layout.wz(p.y + v.dy * 0.6);
        fx.shockwave(x, z, 0.55, 0xffffff);
      } else if (e.type === 'attackResolved' && this.feel(state, e.playerId) && e.hit) {
        // the lab's confirmation of a hit: the level's coloured ring, a flash, dust, a flinch and a bounded jolt
        this.aimed.delete(e.playerId);
        const t = e.targetId === null ? undefined : state.players[e.targetId];
        if (!t) continue;
        const x = layout.wx(t.x);
        const z = layout.wz(t.y);
        const look = impactLook(this.feel(state, e.playerId)!);
        fx.shockwave(x, z, look.ringSize, look.color);
        fx.flash(x, 0.9, z, look.flashSize, look.color === 0xffffff ? 0xfff2b0 : look.color, look.flashLife);
        fx.dust(t.x, t.y, look.dust, 0.4);
        this.players?.playOver(t.id, 'Stumble', look.flinchSeconds);
        if (e.playerId === localId || t.id === localId) fx.shake = Math.min(1, fx.shake + look.shake);
      } else if (e.type === 'attackResolved' && this.feel(state, e.playerId)) {
        // an AIMED punch that found nobody (the rival stepped away): the grey miss puff where the fist ended
        const aimed = this.aimed.delete(e.playerId);
        const p = state.players[e.playerId];
        const v = p ? DIR_VEC[p.facing] : null;
        if (aimed && p && v) fx.dust(p.x + v.dx * 0.9, p.y + v.dy * 0.9, 2, 0.3);
      } else if (e.type === 'placeRefused' && e.playerId === localId) {
        fx.floatText(e.x, e.y, REFUSED_TEXT[e.reason], '#ff8a7a');
      }
    }
  }

  /** The look of a seat's close attacks: the lab / Classic preset, or the same look for a human in a raid or mission. */
  private feel(state: GameState, attackerId: number): CombatLabPreset | null {
    return state.config.combatPilot ? null : feelPresetFor(state, state.players[attackerId]);
  }

  update(_ctx: FrameContext): void {
    // everything here is event-driven (the arcs and flashes live in Effects)
  }

  dispose(): void {
    this.aimed.clear();
    this.group.clear();
  }
}
