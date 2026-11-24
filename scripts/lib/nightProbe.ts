/**
 * NIGHT RAID DETECTION PROBE (task FU2-B1, docs/NIGHT_RAID_REAR_REVIEW.md): the dwell probe of scripts/lib/rearStalk.ts
 * with a classifier that KNOWS the night raid's rules (torch light, contact, reaction ticks) and the turn grace of
 * decision PI7, run on the real Records Vault night mission (or, as a control, the same board with the night detection
 * switched off, i.e. the day rules with the full PI7 grace).
 *
 * A window: at tick `t0` of the real raid the human appears on the tile directly behind a calm first-wave guard that
 * nobody could notice him on, lays a generator and stands still (or leaves on a reaction). Every enemy engagement in the
 * dwell is traced to the rule that produced it by replaying `noticeOf` on the tick's own state with the mind as it was.
 */
import { DIR_VEC } from '../../src/sim';
import type { CampaignLevel, Dir, Intents, RaidId } from '../../src/sim';
import { previewBlast } from '../../src/sim/systems/explosions';
import { noticeOf } from '../../src/sim/systems/territory';
import { RAID_TUNING } from '../../src/sim/raid/tuning';
import { raidWithBots, step } from './raidAi';
import { bfs, idx, noticedAt, overrideGrace, stepEvents, walkable } from './rearStalk';

export interface NightWindowOptions {
  raidId?: RaidId;
  level: CampaignLevel;
  seed: number;
  target: number;
  t0: number;
  dwell: number;
  /** Replace `revealGraceTicks` (0 = production before PI7); undefined = the shipped number. */
  grace?: number;
  /** false = the same raid without light-based detection (the day rules): the control. Default true. */
  night?: boolean;
  /** Stand still (-1) or leave after this many ticks / this many ticks of being watched. */
  leaveAfter?: number;
  reactTicks?: number;
}

export interface NightEngagement {
  tick: number;
  by: number;
  isTarget: boolean;
  /** sight | contact | close | ally | hit | noise | other */
  cause: string;
  /** What the rule replay said: torch sight / cone sight / grace held / which. */
  detail: string;
  noticeBefore: number;
  manhattan: number;
  /** Ticks since the engaging guard last changed its facing during the dwell (-1: it did not). */
  sinceTurn: number;
}

export interface NightWindow {
  eligible: boolean;
  /** The target changed its facing during the dwell and could notice the human right after that (a REVEAL). */
  revealed: boolean;
  revealTick: number;
  turned: boolean;
  first: NightEngagement | null;
  killed: boolean;
}

const NONE: NightWindow = {
  eligible: false,
  revealed: false,
  revealTick: -1,
  turned: false,
  first: null,
  killed: false,
};

export function nightWindow(o: NightWindowOptions): NightWindow {
  const raidId = o.raidId ?? 'recordsVault';
  const { s, bots } = raidWithBots(raidId, o.level, o.seed);
  if (o.night === false) delete (s.config as { nightSight?: unknown }).nightSight;
  overrideGrace(s, o.grace);
  const warm = RAID_TUNING.spawnWarnTicks + 3 + o.t0;
  for (let t = 0; t < warm; t++) step(s, bots);
  const h = s.players[0]!;
  const E = s.players[o.target]!;
  const m0 = s.territory?.minds[o.target];
  if (!E.alive || !m0 || m0.state === 'alert' || m0.state === 'pursue') return NONE;
  const v = DIR_VEC[E.facing];
  const rx = E.x - v.dx;
  const ry = E.y - v.dy;
  if (!walkable(s, rx, ry)) return NONE;
  for (const key of Object.keys(s.territory!.minds)) if (noticedAt(s, Number(key), rx, ry)) return NONE;
  h.x = h.stepFromX = rx;
  h.y = h.stepFromY = ry;
  h.stepRemaining = 0;
  let first: NightEngagement | null = null;
  let revealed = false;
  let revealTick = -1;
  let turned = false;
  let leaving: ReturnType<typeof previewBlast> | null = null;
  let exposed = 0;
  const turnAt = new Map<number, number>();
  for (let t = 0; t < o.dwell; t++) {
    let intent: Intents[number] = {};
    if (t === 0) intent = { place: true };
    const watched = Object.keys(s.territory!.minds).some((k) => noticedAt(s, Number(k), h.x, h.y));
    exposed = watched ? exposed + 1 : 0;
    const timeUp = o.leaveAfter !== undefined && o.leaveAfter >= 0 && t >= o.leaveAfter;
    const startled = o.reactTicks !== undefined && o.reactTicks >= 0 && exposed >= o.reactTicks;
    if ((timeUp || startled || leaving) && h.stepRemaining === 0) {
      const g = s.generators.find((q) => q.ownerId === 0);
      if (g) leaving ??= previewBlast(s, g);
      if (leaving) {
        const unseen = (x: number, y: number): boolean =>
          Object.keys(s.territory!.minds).every((k) => !noticedAt(s, Number(k), x, y));
        const out =
          bfs(
            s,
            h.x,
            h.y,
            (x, y) => !leaving!.has(idx(s, x, y)) && unseen(x, y),
            (x, y) => walkable(s, x, y),
          ) ??
          bfs(
            s,
            h.x,
            h.y,
            (x, y) => !leaving!.has(idx(s, x, y)),
            (x, y) => walkable(s, x, y),
          );
        if (out?.first) intent = { move: out.first };
      }
    }
    const before = new Map<number, { facing: Dir; x: number; y: number; state: string; notice: number }>();
    for (const [key, mm] of Object.entries(s.territory!.minds)) {
      const e = s.players[Number(key)]!;
      before.set(Number(key), { facing: e.facing, x: e.x, y: e.y, state: mm.state, notice: mm.notice });
    }
    const hpBefore = h.vitals?.hp ?? 0;
    const evs = stepEvents(s, bots, intent);
    const T = s.tick - 1; // the tick the territory just ran
    for (const [key, mm] of Object.entries(s.territory!.minds)) {
      const id = Number(key);
      const e = s.players[id]!;
      const b = before.get(id);
      if (!b) continue;
      if (e.facing !== b.facing) {
        turnAt.set(id, t);
        if (id === o.target) {
          turned = true;
          if (!revealed && noticedAt(s, id, h.x, h.y)) {
            revealed = true;
            revealTick = t;
          }
        }
      }
      if (first) continue;
      if (mm.state === b.state || (mm.state !== 'alert' && mm.state !== 'pursue')) continue;
      if (b.state === 'alert' || b.state === 'pursue') continue;
      const cue = evs.find((c) => c.type === 'enemyCue' && c.cue === 'alert' && c.playerId === id);
      const dist = Math.abs(h.x - e.x) + Math.abs(h.y - e.y);
      // replay the rule on this tick's state with the mind as it was before it
      const replay = { ...mm, state: b.state as typeof mm.state, notice: b.notice };
      const r = noticeOf(s, replay, e, h, T);
      const keen = b.state === 'investigate' || (b.state === 'return' && r.sees) ? 3 : 1;
      const needed = r.night ? r.night.reactTicks : Math.max(mm.spec.noticeTicks, r.held);
      let cause: string;
      let detail = `sees=${r.sees} near=${r.near} calm=${r.calmNow} held=${r.held} state=${b.state}`;
      if (cue && cue.type === 'enemyCue' && cue.byId !== null) cause = 'ally';
      else if ((h.vitals?.hp ?? 0) < hpBefore) cause = 'hit';
      else if (r.sees && b.notice + keen >= needed) {
        cause = 'sight';
        detail = r.night ? `torch react ${needed}` : `cone react ${needed}${r.held ? ' (held)' : ''}`;
      } else if (r.close) {
        cause = r.night ? 'contact' : 'close';
        detail = `d=${dist}`;
      } else if (b.state === 'investigate') {
        cause = 'investigate';
        detail = `notice ${b.notice}, ${detail}`;
      } else {
        cause = 'noise';
        detail = `d=${dist} ${detail}`;
      }
      const tt = turnAt.get(id);
      first = {
        tick: t,
        by: id,
        isTarget: id === o.target,
        cause,
        detail,
        noticeBefore: b.notice,
        manhattan: dist,
        sinceTurn: tt === undefined ? -1 : t - tt,
      };
    }
    if (!h.alive) break;
  }
  return { eligible: true, revealed, revealTick, turned, first, killed: !E.alive };
}
