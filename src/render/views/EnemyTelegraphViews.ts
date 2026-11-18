/**
 * Readable enemy attacks (docs/CAMPAIGN_SECTOR_AI.md "Enemy telegraphs and looks", decisions SV1-SV3): built for EVERY
 * match with campaign enemy seats (`Player.enemyKind`: field and boss missions, raids, the Academy's Generator Tactics
 * lessons), never for multiplayer bots. Presentation only: it reads the state (`enemyTelegraph.ts`) and the events.
 *
 *   punch wind-up   a solid red ring under the enemy whose centre FILLS as the blow comes and whose pulse quickens; a
 *                   fat arrow toward the aimed tile that grows; the aimed tile framed and filling; corner brackets on
 *                   the other tiles the punch can still reach. The swing clip is stretched so the fist lands with the
 *                   sim's resolve tick.
 *   throw cue       an amber SIGHT (ring with four ticks, turning) under the thrower, filling; chevrons marching along
 *                   the path and an X where the path ends (ProjectileViews still draws the held object and its flight);
 *                   the throw clip is stretched over the cue.
 *   open            after a swing or a throw, while the enemy is planted: a cyan BROKEN ring that shrinks as the
 *                   window closes. A missed punch also stumbles (the Stumble clip) and kicks up dust: punish now.
 *   stagger         reeling from the human's punch: a thin yellow ring (plus PlayerViews' dazed stars).
 *   awareness       (decision SV6) a brief mark where the clock sits, from the territorial layer (`enemyCue` alert /
 *                   investigate / lost and the `state.territory.minds` state changes): an orange warning triangle with
 *                   "!" (spotted you), a pale-blue round "?" (heard something / going to look), a grey three-dot plate
 *                   that sinks and fades (lost you, going back). Never while the clock shows; each fades on its own.
 *
 * Every glyph has a dark outline baked in and the meaning is carried by its SHAPE and MOTION (fill, pulse, march), not
 * by colour alone. Glyphs are a dozen shared instanced meshes (one draw call each, none while unused): no per-enemy
 * meshes, no allocation per frame once warm. Not gated by the graphics quality: Very Low draws exactly the same marks.
 */
import { Color, Group, Quaternion } from 'three';
import type { BufferGeometry } from 'three';
import type { Dir, GameState, SimEvent } from '../../sim';
import { DIR_VEC } from '../../sim';
import type { Effects } from '../fx/Effects';
import type { Layout } from '../coords';
import { emptyTelegraph, pulseRate, readTelegraph, telegraphKindOf } from './enemyTelegraph';
import type { Telegraph, TelegraphKind } from './enemyTelegraph';
import {
  AWARENESS_COLORS,
  awarenessLook,
  awarenessOfCue,
  awarenessOfMind,
  emptyLook,
  mindOf,
} from './enemyAwareness';
import type { AwarenessKind, AwarenessLook } from './enemyAwareness';
import type { MindState } from '../../sim';
import { enemyScaleOf } from '../../assets/enemyLooks';
import { hasCampaignFeedback } from './DamageViews';
import { playerGridPos } from './motion';
import { BILLBOARDS, GLYPHS, GlyphBatch } from './telegraphShapes';
import type { BillboardId, GlyphId } from './telegraphShapes';
import type { FrameContext, View } from './types';

/** Colours (the outline is always dark; the glyph's shape carries the meaning). `hot` is the pulse peak. */
export const TELEGRAPH_COLORS = {
  melee: { base: 0xff1a0a, hot: 0xff9a7a },
  ranged: { base: 0xff9a00, hot: 0xffe46a },
  open: { base: 0x14d6ff, hot: 0xb4f2ff },
  stagger: { base: 0xffcc00, hot: 0xffcc00 },
} as const;

/** Height of the over-the-head wind-up clock (above the name tag and the health pips) and its size, in tiles. */
const CLOCK_Y = 2.66;
const CLOCK_SIZE = 0.62;
const WEDGES = 12;
/** Size of an awareness mark (tiles; it sits where the clock does and is about as big: it must read on a phone). */
const MARK_SIZE = 0.6;

/** What the view needs from the player views (kept small so tests can fake it). */
export interface TelegraphAnimator {
  playOver(id: number, clip: 'Push' | 'Throw' | 'Stumble', seconds: number): void;
}

/** Every match with campaign enemy seats (or campaign health) gets the telegraphs; multiplayer never does. */
export const hasEnemyTelegraphs = (state: GameState): boolean =>
  hasCampaignFeedback(state) || state.players.some((p) => telegraphKindOf(state, p) !== null);

/** Yaw about +Y that turns a glyph's +X toward a grid direction (+y on the grid is +z in the world). */
export function dirYaw(dir: Dir): number {
  const v = DIR_VEC[dir];
  return Math.atan2(-v.dy, v.dx);
}

interface Seat {
  /** Tick its current wind-up began (the `attackStarted` event), if seen. */
  windStart?: number;
  /** Tick its current counter window began (first frame seen open). */
  openStart?: number;
  last: TelegraphKind | null;
  /** Integrated pulse phase (radians). */
  phase: number;
  /** The awareness mark running (null = none), when it started (tick) and its cue's beat (ticks). */
  mark: AwarenessKind | null;
  markFrom: number;
  markBeat: number;
  /** The territorial state seen last frame (undefined until first seen, or without the layer). */
  mind: MindState | undefined;
}

const ENEMIES_MAX = 24;
const NO_ROTATION = new Quaternion();

export interface TelegraphStats {
  melee: number;
  ranged: number;
  open: number;
  stagger: number;
  /** Awareness marks drawn this frame (decision SV6). */
  alert: number;
  investigate: number;
  lost: number;
  /** Awareness marks started since the view was built, by kind (tests, the debug handle). */
  marksStarted: { alert: number; investigate: number; lost: number };
  /** Instances drawn this frame, over all glyphs. */
  instances: number;
}

export class EnemyTelegraphViews implements View {
  readonly group = new Group();
  private readonly geometries = new Map<GlyphId | BillboardId, BufferGeometry>();
  private readonly b: Record<
    | 'halo'
    | 'fill'
    | 'arrow'
    | 'frame'
    | 'tileFill'
    | 'brackets'
    | 'sight'
    | 'chevron'
    | 'cross'
    | 'dashed'
    | 'thin'
    | 'dialMelee'
    | 'dialRanged'
    | 'wedge'
    | 'alertSign'
    | 'querySign'
    | 'lostSign',
    GlyphBatch
  >;
  private readonly look: AwarenessLook = emptyLook();
  private readonly started = { alert: 0, investigate: 0, lost: 0 };
  private readonly seats = new Map<number, Seat>();
  private readonly t: Telegraph = emptyTelegraph();
  private readonly c = new Color();
  private readonly hot = new Color();
  private readonly reduced: boolean;
  private counts: TelegraphStats = this.zeroCounts();

  constructor(
    private readonly animator: TelegraphAnimator | null = null,
    reducedMotion = typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches,
  ) {
    this.reduced = reducedMotion;
    const geo = (id: GlyphId | BillboardId) => {
      let g = this.geometries.get(id);
      if (!g) {
        g = id in GLYPHS ? GLYPHS[id as GlyphId]() : BILLBOARDS[id as BillboardId]();
        this.geometries.set(id, g);
      }
      return g;
    };
    // under the enemy: drawn with the depth test (the body stands in front of its own ring); on the tiles around it:
    // drawn over everything so the warning on the human's tile is never hidden by a body or a prop
    const under = (id: GlyphId, cap: number, order: number, opacity = 0.95) =>
      new GlyphBatch(geo(id), cap, { renderOrder: order, opacity, depthTest: true, y: 0.07 });
    const over = (id: GlyphId | BillboardId, cap: number, order: number, opacity = 0.95) =>
      new GlyphBatch(geo(id), cap, { renderOrder: order, opacity, depthTest: false, y: 0.08 });
    // the awareness marks fade per instance: each gets its own geometry (the fade attribute lives on it)
    const mark = (id: BillboardId) =>
      new GlyphBatch(BILLBOARDS[id](), ENEMIES_MAX, {
        renderOrder: 36,
        opacity: 1,
        depthTest: false,
        y: 0,
        fade: true,
      });
    this.b = {
      fill: under('disc', ENEMIES_MAX, 9, 0.5),
      halo: under('halo', ENEMIES_MAX, 10),
      sight: under('sight', ENEMIES_MAX, 10),
      dashed: under('dashed', ENEMIES_MAX, 10),
      thin: under('thin', ENEMIES_MAX, 10, 0.85),
      tileFill: over('square', ENEMIES_MAX * 2, 11, 0.42),
      brackets: over('brackets', ENEMIES_MAX * 3, 12, 0.8),
      frame: over('frame', ENEMIES_MAX * 2, 12),
      chevron: over('chevron', ENEMIES_MAX * 8, 12),
      cross: over('cross', ENEMIES_MAX, 12),
      arrow: over('arrow', ENEMIES_MAX, 13),
      // the clock over the head: seen even where a wall or a body hides the floor (above the pips' order 35)
      dialMelee: over('dialMelee', ENEMIES_MAX, 36, 0.92),
      dialRanged: over('dialRanged', ENEMIES_MAX, 36, 0.92),
      wedge: over('wedge', ENEMIES_MAX * WEDGES, 37),
      alertSign: mark('alertSign'),
      querySign: mark('querySign'),
      lostSign: mark('lostSign'),
    };
    for (const batch of Object.values(this.b)) this.group.add(batch.mesh);
  }

  /** What was drawn last frame (tests, the debug handle). */
  stats(): TelegraphStats {
    return this.counts;
  }

  handleEvents(events: readonly SimEvent[], state: GameState, fx: Effects): void {
    for (const e of events) {
      if (e.type === 'enemyCue') {
        const kind = awarenessOfCue(e.cue);
        if (kind) this.startMark(this.seat(e.playerId), kind, e.fromTick, e.untilTick - e.fromTick);
      } else if (e.type === 'attackStarted') {
        const p = state.players[e.playerId];
        if (!p || telegraphKindOf(state, p) === null) continue;
        this.seat(p.id).windStart = state.tick;
        // the enemy's swing is stretched over its wind-up: the blow lands when the sim resolves it
        this.animator?.playOver(p.id, 'Push', Math.max(0.1, (e.resolveTick - state.tick) / 60));
      } else if (e.type === 'attackResolved') {
        const p = state.players[e.playerId];
        if (!p || telegraphKindOf(state, p) === null) continue;
        this.seat(p.id).windStart = undefined;
        if (!e.hit) {
          // a punch at the air: the enemy overreaches and stumbles - its open window is starting
          const v = DIR_VEC[p.facing];
          fx.dust(p.x + v.dx * 0.8, p.y + v.dy * 0.8, 4, 0.4);
          this.animator?.playOver(p.id, 'Stumble', 0.5);
        }
      } else if (e.type === 'projectileLaunched') {
        const p = state.players[e.ownerId];
        if (!p || telegraphKindOf(state, p) === null) continue;
        // the throw clip lasts the whole cue: the arm comes over as the object leaves
        if (e.warnTicks > 0) this.animator?.playOver(p.id, 'Throw', e.warnTicks / 60);
      }
    }
  }

  update(ctx: FrameContext): void {
    const { state, alpha, layout, dt, time } = ctx;
    for (const batch of Object.values(this.b)) batch.begin();
    const counts = this.zeroCounts();
    const now = state.tick + alpha;
    const cam = ctx.camera?.quaternion ?? NO_ROTATION;
    let n = 0;
    for (const p of state.players) {
      if (telegraphKindOf(state, p) === null) continue;
      const seat = this.seat(p.id);
      // the territorial state machine: a change of state starts a mark even without its event (sight lost in a
      // chase, a search that found nothing); the event of the same change is folded in (same kind, same tick)
      const mind = mindOf(state, p.id);
      const fromMind = mind !== undefined ? awarenessOfMind(mind, seat.mind) : null;
      if (fromMind && mind !== undefined) {
        const since = state.territory?.minds[p.id]?.since ?? state.tick;
        this.startMark(seat, fromMind, since, state.config.campaignTactics?.awareness.alertTicks ?? 0);
      }
      seat.mind = mind;
      if (!p.alive) {
        seat.last = null;
        seat.mark = null;
        continue;
      }
      if (n >= ENEMIES_MAX) break;
      if (seat.last !== 'open' && state.tick < p.rootedUntil && !p.attack) seat.openStart = state.tick;
      const t = readTelegraph(state, p, now, this.t, seat.windStart, seat.openStart);
      if (t.kind !== 'melee') seat.windStart = undefined;
      seat.last = t.kind;
      const clock = t.kind === 'melee' || t.kind === 'ranged';
      if (!t.kind && !seat.mark) continue;
      n++;
      const pos = playerGridPos(p, alpha);
      const x = layout.wx(pos.x);
      const z = layout.wz(pos.y);
      const headY = (p.mounted ? 0.28 : 0) + CLOCK_Y + (enemyScaleOf(p) - 1) * 1.86;
      // the awareness mark sits where the clock does: never both (the wind-up is the more urgent read)
      if (seat.mark && !clock) this.drawMark(seat, x, headY, z, now, cam, counts);
      if (!t.kind) continue;
      counts[t.kind]++;
      seat.phase += dt * pulseRate(clock ? t.progress : 0.15);
      if (t.kind === 'melee') this.drawMelee(t, seat, x, z, layout);
      else if (t.kind === 'ranged') this.drawRanged(t, seat, x, z, layout, time);
      if (clock) this.drawClock(t, x, headY, z, cam);
      else if (t.kind === 'open') this.drawOpen(t, seat, x, z, time);
      else this.b.thin.push(x, z, 0, 1, 1, TELEGRAPH_COLORS.stagger.base);
    }
    for (const batch of Object.values(this.b)) {
      batch.end();
      counts.instances += batch.size;
    }
    this.counts = counts;
  }

  private zeroCounts(): TelegraphStats {
    return {
      melee: 0,
      ranged: 0,
      open: 0,
      stagger: 0,
      alert: 0,
      investigate: 0,
      lost: 0,
      marksStarted: this.started,
      instances: 0,
    };
  }

  /** Starts (or restarts) an awareness mark; the same change seen twice (its event, then its state) is one mark. */
  private startMark(seat: Seat, kind: AwarenessKind, from: number, beat: number): void {
    if (seat.mark === kind && seat.markFrom === from) return;
    seat.mark = kind;
    seat.markFrom = from;
    seat.markBeat = Math.max(0, beat);
    this.started[kind]++;
  }

  /** The awareness mark over the head (it pops, holds, then fades on its own; then the seat forgets it). */
  private drawMark(
    seat: Seat,
    x: number,
    y: number,
    z: number,
    now: number,
    cam: Quaternion,
    counts: TelegraphStats,
  ): void {
    const kind = seat.mark!;
    const look = awarenessLook(kind, now - seat.markFrom, seat.markBeat, this.reduced, this.look);
    if (!look.visible) {
      seat.mark = null;
      return;
    }
    const batch =
      kind === 'alert' ? this.b.alertSign : kind === 'investigate' ? this.b.querySign : this.b.lostSign;
    batch.pushFacing(
      x,
      y + look.lift,
      z,
      cam,
      look.roll,
      MARK_SIZE * look.scale,
      AWARENESS_COLORS[kind],
      look.alpha,
    );
    counts[kind]++;
  }

  /** The pulse colour: the base colour brightening toward `hot` on each beat. */
  private pulse(kind: keyof typeof TELEGRAPH_COLORS, seat: Seat, depth: number): Color {
    const k = depth * (0.5 + 0.5 * Math.sin(seat.phase));
    return this.c.setHex(TELEGRAPH_COLORS[kind].base).lerp(this.hot.setHex(TELEGRAPH_COLORS[kind].hot), k);
  }

  /** The wind-up clock over the head: a dark face whose wedges fill clockwise from twelve o'clock. */
  private drawClock(t: Telegraph, x: number, y: number, z: number, cam: Quaternion): void {
    const s = CLOCK_SIZE * (t.strong ? 1.15 : 1);
    const kind = t.kind === 'ranged' ? 'ranged' : 'melee';
    const color = TELEGRAPH_COLORS[kind].base;
    (kind === 'ranged' ? this.b.dialRanged : this.b.dialMelee).pushFacing(x, y, z, cam, 0, s, color);
    const n = Math.min(WEDGES, Math.max(1, Math.ceil(t.progress * WEDGES)));
    const step = (Math.PI * 2) / WEDGES;
    // wedge i covers the clock from twelve o'clock clockwise: angles (90 deg - (i + 1) * 30 deg) .. (90 deg - i * 30 deg)
    for (let i = 0; i < n; i++)
      this.b.wedge.pushFacing(
        x,
        y,
        z,
        cam,
        Math.PI / 2 - (i + 1) * step,
        s,
        i === n - 1 ? TELEGRAPH_COLORS[kind].hot : color,
      );
  }

  private drawMelee(t: Telegraph, seat: Seat, x: number, z: number, layout: Layout): void {
    const s = t.strong ? 1.15 : 1;
    const col = this.pulse('melee', seat, 0.35 + 0.45 * t.progress);
    const r = Math.max(0.06, 0.47 * s * t.progress);
    this.b.fill.push(x, z, 0, r, r, TELEGRAPH_COLORS.melee.base);
    this.b.halo.push(x, z, 0, s, s, col);
    if (t.dir) {
      const v = DIR_VEC[t.dir];
      const yaw = dirYaw(t.dir);
      // the arrow pushes out from the ring toward the aimed tile as the blow comes (its tip ends near the tile centre)
      const len = 0.5 + 0.25 * t.progress;
      this.b.arrow.push(x + v.dx * 0.45, z + v.dy * 0.45, yaw, len * s, s, col);
    }
    for (let i = 0; i < t.aimCount; i++) {
      const a = t.aim[i]!;
      const ax = layout.wx(a.x);
      const az = layout.wz(a.y);
      this.b.frame.push(ax, az, 0, 1, 1, col);
      const f = Math.max(0.04, 0.44 * t.progress);
      this.b.tileFill.push(ax, az, 0, f, f, TELEGRAPH_COLORS.melee.base);
    }
    for (let i = 0; i < t.zoneCount; i++) {
      const a = t.zone[i]!;
      this.b.brackets.push(layout.wx(a.x), layout.wz(a.y), 0, 1, 1, TELEGRAPH_COLORS.melee.base);
    }
  }

  private drawRanged(t: Telegraph, seat: Seat, x: number, z: number, layout: Layout, time: number): void {
    const s = t.strong ? 1.2 : 1;
    const col = this.pulse('ranged', seat, 0.35 + 0.45 * t.progress);
    const r = Math.max(0.06, 0.45 * s * t.progress);
    this.b.fill.push(x, z, 0, r, r, TELEGRAPH_COLORS.ranged.base);
    this.b.sight.push(x, z, this.reduced ? 0 : time * 1.6, s, s, col);
    const yaw = t.dir ? dirYaw(t.dir) : 0;
    for (let i = 0; i < t.aimCount; i++) {
      const a = t.aim[i]!;
      // a bright beat marching outward along the line, tile by tile
      const wave = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * 9 - i * 1.1);
      const c = this.c
        .setHex(TELEGRAPH_COLORS.ranged.base)
        .lerp(this.hot.setHex(TELEGRAPH_COLORS.ranged.hot), wave * 0.8);
      const k = 0.85 + 0.2 * t.progress;
      if (i === t.aimCount - 1) this.b.cross.push(layout.wx(a.x), layout.wz(a.y), 0, k, k, c);
      else this.b.chevron.push(layout.wx(a.x), layout.wz(a.y), yaw, k, k, c);
    }
  }

  private drawOpen(t: Telegraph, seat: Seat, x: number, z: number, time: number): void {
    const k = 0.78 + 0.27 * t.progress;
    this.b.dashed.push(x, z, this.reduced ? 0 : -time * 0.9, k, k, this.pulse('open', seat, 0.5));
  }

  private seat(id: number): Seat {
    let s = this.seats.get(id);
    if (!s) {
      s = { last: null, phase: 0, mark: null, markFrom: 0, markBeat: 0, mind: undefined };
      this.seats.set(id, s);
    }
    return s;
  }

  dispose(): void {
    for (const k of ['alertSign', 'querySign', 'lostSign'] as const) this.b[k].mesh.geometry.dispose();
    for (const batch of Object.values(this.b)) batch.dispose();
    for (const g of this.geometries.values()) g.dispose();
    this.geometries.clear();
    this.seats.clear();
    this.group.clear();
  }
}
