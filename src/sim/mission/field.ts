/**
 * Section FIELD mission runtime (docs/CAMPAIGN_SECTIONS.md, decisions FS1-FS12). `updateMission` and friends hand over
 * to this file when `state.mission.field` exists; the six boss missions never reach it.
 *
 * A field mission is a ROUTE of legs (`FieldObjectiveKind`), played in order, the last one always the return route:
 *
 *   reachMarkers  stand on the next marked tile (they are lit one at a time); the last one completes the leg
 *   clearGroup    every enemy of the group is out (existing eliminations; campaign damage joins with combat-core)
 *   escapeRoute   reach the exit; the group's bots hunt you from the moment the leg starts, and a pursuer next to you
 *                 for `CATCH_TICKS` catches you: a life, back to the checkpoint, the pursuers back to their posts
 *   door          stand on the door about a second: it raises `state.mission.pendingRaid` and the app plays the raid;
 *                 `resolveRaid` answers (done / failed / abandoned) and puts the human back on the tile in front
 *   returnRoute   stand on the return marker: the mission is complete
 *
 * Lives, the clock and the win/lose flow reuse the boss missions' (`livesUsed`, `evaluateMission`). Nothing here uses
 * Math.random or the clock: it is a function of the state and the tick.
 */
import { endMatch } from '../systems/matchResult';
import type { GameState, Player, SimEvent } from '../types';
import type { RaidOutcome } from '../campaign/types';
import { newNode } from './ctx';
import { CATCH_TICKS, DOOR_HOLD_TICKS, FIELD_MERCY_TICKS, fieldLegCount, getFieldMission } from './fieldDefs';
import type { FieldLegDef, FieldMissionDef } from './fieldDefs';
import type {
  FieldDoorRuntime,
  FieldObjectiveKind,
  FieldRuntime,
  MissionDoorView,
  MissionNodeRuntime,
  MissionNodeView,
  MissionState,
  MissionView,
  NpcDirective,
} from './types';

/** A pursuer is "adjacent" when it is within this many tiles (Manhattan) of the human. */
const CATCH_RANGE = 1;
/** How long (ticks) the "caught" line stays up. */
const CAUGHT_NOTE_TICKS = 180;
/** A ranged field enemy starts hunting the human inside this many tiles (Chebyshev). */
const AGGRO_RADIUS = 9;

type Leg = FieldLegDef | { kind: 'returnRoute' };

export function legAt(def: FieldMissionDef, index: number): Leg {
  return def.legs[index] ?? { kind: 'returnRoute' };
}

function ctxOf(state: GameState): { m: MissionState; f: FieldRuntime; def: FieldMissionDef } {
  const m = state.mission!;
  const f = m.field!;
  return { m, f, def: getFieldMission(f.fieldId) };
}

/** The phase (0-2) the three HUD pips show for leg `leg` of `count`. */
function pipOf(leg: number, count: number): 0 | 1 | 2 {
  return Math.min(2, Math.floor((leg * 3) / count)) as 0 | 1 | 2;
}

const human = (state: GameState): Player | null => {
  const p = state.players[0];
  return p && p.alive ? p : null;
};

const standingOn = (p: Player, x: number, y: number): boolean => p.x === x && p.y === y;

// ------------------------------------------------------------------ legs and nodes

function node(id: string, x: number, y: number, label: string, width: number): MissionNodeRuntime {
  return newNode({ id, x, y, label }, -1, width, 1);
}

/** Starts the leg `f.leg`: its nodes (plus the optional doors still open) and the HUD line. */
export function enterLeg(state: GameState, m: MissionState, def: FieldMissionDef, events: SimEvent[]): void {
  const f = m.field!;
  const w = state.width;
  const leg = legAt(def, f.leg);
  const nodes: MissionNodeRuntime[] = [];
  switch (leg.kind) {
    case 'reachMarkers':
      leg.markers.forEach((mk, i) => {
        const n = node(`mk${i}`, mk.x, mk.y, mk.label, w);
        n.done = i < f.markersDone;
        nodes.push(n);
      });
      break;
    case 'clearGroup': {
      const seats = m.seats.filter((s) => s.group === leg.group && s.post);
      if (seats.length > 0) {
        const cx = Math.round(seats.reduce((a, s) => a + s.post!.x, 0) / seats.length);
        const cy = Math.round(seats.reduce((a, s) => a + s.post!.y, 0) / seats.length);
        nodes.push(node('group', cx, cy, 'ENEMIES', w));
      }
      break;
    }
    case 'escapeRoute':
      nodes.push(node('exit', leg.exit.x, leg.exit.y, leg.exit.label, w));
      break;
    case 'door': {
      const d = f.doors.find((o) => o.id === leg.doorId);
      if (d) nodes.push(node(d.id, d.x, d.y, d.label, w));
      break;
    }
    case 'returnRoute':
      nodes.push(node('return', def.returnMarker.x, def.returnMarker.y, def.returnMarker.label, w));
      break;
  }
  for (const d of f.doors) {
    if (!d.required && d.status !== 'done' && !nodes.some((n) => n.id === d.id))
      nodes.push(node(d.id, d.x, d.y, d.label, w));
  }
  m.nodes = nodes;
  m.phase = pipOf(f.leg, fieldLegCount(def));
  m.callout = legText(m, def);
  void events; // (the leg's own events are pushed by the callers)
}

function legText(m: MissionState, def: FieldMissionDef): string {
  const leg = legAt(def, m.field!.leg);
  return leg.kind === 'returnRoute'
    ? `Done here. Walk back to ${def.returnMarker.label} to finish.`
    : leg.text;
}

function nodeStateOf(f: FieldRuntime, def: FieldMissionDef, n: MissionNodeRuntime): MissionNodeView['state'] {
  const door = f.doors.find((d) => d.id === n.id);
  if (door) {
    if (door.status === 'done') return 'done';
    if (door.status === 'inRaid') return 'progress';
    if (door.hold > 0) return 'progress';
    return doorActive(f, def, door) ? 'live' : 'locked';
  }
  if (n.id.startsWith('mk')) {
    const i = Number(n.id.slice(2));
    return i < f.markersDone ? 'done' : i === f.markersDone ? 'live' : 'locked';
  }
  return 'live';
}

function nodeFraction(f: FieldRuntime, n: MissionNodeRuntime): number {
  const door = f.doors.find((d) => d.id === n.id);
  if (!door) return n.id.startsWith('mk') && Number(n.id.slice(2)) < f.markersDone ? 1 : 0;
  if (door.status === 'done' || door.status === 'inRaid') return 1;
  return Math.min(1, door.hold / DOOR_HOLD_TICKS);
}

/** May the human start this door right now? Optional doors always; a required one only on its own leg. */
function doorActive(f: FieldRuntime, def: FieldMissionDef, d: FieldDoorRuntime): boolean {
  if (d.status === 'done' || d.status === 'inRaid') return false;
  if (!d.required) return true;
  const leg = legAt(def, f.leg);
  return leg.kind === 'door' && leg.doorId === d.id;
}

// ------------------------------------------------------------------ the per-tick update

export function updateFieldMission(state: GameState, events: SimEvent[]): void {
  const { m, f, def } = ctxOf(state);
  if (m.outcome || state.match.phase !== 'playing') return;
  if (!m.announced) announce(state, m, f, def, events);
  moveRespawnedHuman(state, f, events);
  if (!m.pendingRaid) {
    const p = human(state);
    if (p) {
      updateDoors(m, f, def, p);
      if (!m.pendingRaid) updateLeg(state, m, f, def, p, events);
    }
  }
  syncNodes(m, f, def, events);
  syncCallout(state, m, def, events);
}

function announce(
  state: GameState,
  m: MissionState,
  f: FieldRuntime,
  def: FieldMissionDef,
  events: SimEvent[],
): void {
  m.announced = true;
  m.phaseStartTick = state.tick;
  f.legStartTick = state.tick;
  events.push({ type: 'missionStarted', missionId: m.id, objective: 'fieldRoute', bossId: m.bossId });
  events.push({ type: 'missionPhase', phase: pipOf(f.leg, fieldLegCount(def)), change: 'started' });
}

/** A life lost in the field respawns the human at the checkpoint, not at an arena spawn. */
function moveRespawnedHuman(state: GameState, f: FieldRuntime, events: SimEvent[]): void {
  const p = state.players[0];
  if (!p?.alive) return;
  for (const e of events) {
    if (e.type !== 'playerRespawned' || e.playerId !== 0) continue;
    p.x = p.stepFromX = f.checkpoint.x;
    p.y = p.stepFromY = f.checkpoint.y;
    p.stepRemaining = 0;
    e.x = p.x;
    e.y = p.y;
  }
}

function updateDoors(m: MissionState, f: FieldRuntime, def: FieldMissionDef, p: Player): void {
  for (const d of f.doors) {
    if (!doorActive(f, def, d)) continue;
    d.hold = standingOn(p, d.x, d.y) ? d.hold + 1 : Math.max(0, d.hold - 2);
    if (d.hold < DOOR_HOLD_TICKS) continue;
    d.hold = 0;
    d.status = 'inRaid';
    m.pendingRaid = { doorId: d.id, raidId: d.raidId, returnTile: { x: d.returnTile.x, y: d.returnTile.y } };
    return;
  }
}

function updateLeg(
  state: GameState,
  m: MissionState,
  f: FieldRuntime,
  def: FieldMissionDef,
  p: Player,
  events: SimEvent[],
): void {
  const leg = legAt(def, f.leg);
  switch (leg.kind) {
    case 'reachMarkers': {
      const mk = leg.markers[f.markersDone];
      if (mk && standingOn(p, mk.x, mk.y)) {
        f.markersDone++;
        f.checkpoint = { x: mk.x, y: mk.y };
        const n = m.nodes.find((o) => o.id === `mk${f.markersDone - 1}`);
        if (n) {
          n.done = true;
          n.doneAt = state.tick;
        }
        if (f.markersDone >= leg.markers.length) completeLeg(state, m, def, events);
      }
      return;
    }
    case 'clearGroup': {
      const members = m.seats.filter((s) => s.group === leg.group);
      if (members.every((s) => !state.players[s.playerId]?.alive)) completeLeg(state, m, def, events);
      return;
    }
    case 'escapeRoute': {
      if (standingOn(p, leg.exit.x, leg.exit.y)) {
        completeLeg(state, m, def, events);
        return;
      }
      updateCatch(state, m, f, p, leg.group);
      return;
    }
    case 'door':
      return; // completed by resolveRaid
    case 'returnRoute':
      if (standingOn(p, def.returnMarker.x, def.returnMarker.y)) f.done = true;
      return;
  }
}

function pursuers(state: GameState, m: MissionState, group: string): Player[] {
  return m.seats
    .filter((s) => s.group === group)
    .map((s) => state.players[s.playerId]!)
    .filter((q) => q.alive);
}

/** A pursuer next to the human for `CATCH_TICKS` catches them: a life, the checkpoint, the pursuers back to their posts. */
function updateCatch(state: GameState, m: MissionState, f: FieldRuntime, p: Player, group: string): void {
  const near = pursuers(state, m, group).some(
    (q) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) <= CATCH_RANGE,
  );
  f.catchTicks = near ? f.catchTicks + 1 : Math.max(0, f.catchTicks - 2);
  if (f.catchTicks < CATCH_TICKS) return;
  f.catchTicks = 0;
  f.caught++;
  f.caughtAt = state.tick;
  m.livesUsed++;
  p.x = p.stepFromX = f.checkpoint.x;
  p.y = p.stepFromY = f.checkpoint.y;
  p.stepRemaining = 0;
  p.protectedUntil = Math.max(p.protectedUntil, state.tick + FIELD_MERCY_TICKS);
  for (const q of pursuers(state, m, group)) {
    const post = m.seats[q.id]?.post;
    if (!post) continue;
    q.x = q.stepFromX = post.x;
    q.y = q.stepFromY = post.y;
    q.stepRemaining = 0;
  }
}

function completeLeg(state: GameState, m: MissionState, def: FieldMissionDef, events: SimEvent[]): void {
  const f = m.field!;
  events.push({ type: 'missionPhase', phase: pipOf(f.leg, fieldLegCount(def)), change: 'cleared' });
  m.phasesCleared++;
  f.leg++;
  f.markersDone = 0;
  f.catchTicks = 0;
  f.legStartTick = state.tick;
  m.phaseStartTick = state.tick;
  enterLeg(state, m, def, events);
  events.push({ type: 'missionPhase', phase: m.phase, change: 'started' });
}

// ------------------------------------------------------------------ raids

/**
 * The app's answer to `state.mission.pendingRaid`: the raid ended with `outcome`. Marks the door (completed = done,
 * failed = open for a retry and a life lost, abandoned = open again), carries the health the human leaves with, pays
 * the bonus (a raid completed with three stars can earn the mission's third star), advances the route when the door was
 * its leg, and puts the human on the tile in front of the door with a moment of protection. False when no such request
 * is pending (a stale or wrong answer changes nothing).
 */
export function resolveRaid(
  state: GameState,
  doorId: string,
  outcome: RaidOutcome,
  events: SimEvent[] = [],
): boolean {
  const m = state.mission;
  const f = m?.field;
  if (!m || !f || m.outcome) return false;
  const door = f.doors.find((d) => d.id === doorId);
  if (!door || door.status !== 'inRaid' || outcome.raidId !== door.raidId) return false;
  const def = getFieldMission(f.fieldId);
  const p = state.players[0]!;

  m.pendingRaid = null;
  door.attempts++;
  door.last = outcome;
  door.hold = 0;
  const wasLeg = (() => {
    const leg = legAt(def, f.leg);
    return leg.kind === 'door' && leg.doorId === door.id;
  })();

  if (outcome.result === 'completed') {
    door.status = 'done';
    door.stars = outcome.stars;
    f.raidsCompleted++;
    if (outcome.stars === 3) f.raidBonus++;
    if (p.vitals) p.vitals.hp = Math.min(p.vitals.maxHp, Math.max(1, Math.floor(outcome.hpLeft)));
  } else if (outcome.result === 'failed') {
    door.status = 'failed';
    m.livesUsed++;
  } else {
    door.status = 'idle';
  }

  // back on the map in front of the door
  p.x = p.stepFromX = door.returnTile.x;
  p.y = p.stepFromY = door.returnTile.y;
  p.stepRemaining = 0;
  p.slide = null;
  p.protectedUntil = Math.max(p.protectedUntil, state.tick + FIELD_MERCY_TICKS);
  f.checkpoint = { x: door.returnTile.x, y: door.returnTile.y };

  if (door.status === 'done' && wasLeg) completeLeg(state, m, def, events);
  else enterLeg(state, m, def, events);
  return true;
}

// ------------------------------------------------------------------ nodes, HUD line

function syncNodes(m: MissionState, f: FieldRuntime, def: FieldMissionDef, events: SimEvent[]): void {
  for (const n of m.nodes) {
    const st = nodeStateOf(f, def, n);
    if (st === n.shown) continue;
    n.shown = st;
    events.push({
      type: 'missionNode',
      nodeId: n.id,
      x: n.x,
      y: n.y,
      state: st,
      fraction: nodeFraction(f, n),
    });
  }
}

function syncCallout(state: GameState, m: MissionState, def: FieldMissionDef, events: SimEvent[]): void {
  const f = m.field!;
  const caughtNow = f.caughtAt >= 0 && state.tick - f.caughtAt < CAUGHT_NOTE_TICKS;
  const text = caughtNow ? 'CAUGHT! Back to the last checkpoint.' : legText(m, def);
  if (text === m.callout) return;
  m.callout = text;
  events.push({ type: 'missionCallout', text });
}

// ------------------------------------------------------------------ eliminations, end of the mission

export function fieldAfterEliminations(state: GameState, eliminated: readonly number[]): void {
  const m = state.mission;
  if (!m || m.outcome) return;
  for (const id of eliminated) if (id === 0) m.livesUsed++;
}

/** Replaces the boss rules of `evaluateMission` for a field mission: route done, lives, clock. */
export function evaluateFieldMission(state: GameState, events: SimEvent[]): void {
  const { m, f } = ctxOf(state);
  if (m.outcome || state.match.phase !== 'playing') return;
  if (f.done) finishField(state, 'won', events);
  else if (m.livesUsed >= m.livesMax) finishField(state, 'lost', events);
  else if (state.match.playTicks >= m.tuning.timeLimitTicks) finishField(state, 'timeout', events);
}

function finishField(state: GameState, result: 'won' | 'lost' | 'timeout', events: SimEvent[]): void {
  const { m, f } = ctxOf(state);
  const ticks = state.match.playTicks;
  const won = result === 'won';
  const clean = m.livesUsed <= 1;
  const stars = won
    ? ((1 + (clean ? 1 : 0) + (clean && (ticks <= m.tuning.parTicks || f.raidBonus > 0) ? 1 : 0)) as
        1 | 2 | 3)
    : 0;
  m.outcome = {
    result,
    missionId: m.id,
    modifiers: [],
    seconds: Math.round(ticks / 60),
    livesUsed: m.livesUsed,
    phasesCleared: m.phasesCleared + (won ? 1 : 0),
    defeat: null,
    stars,
    creditedKills: state.players[0]!.stats.kills,
    sectionMissionId: f.fieldId,
    raidBonus: f.raidBonus,
  };
  m.phaseState = won ? 'won' : 'lost';
  m.callout = null;
  events.push({ type: 'missionOutcome', outcome: m.outcome, phaseState: m.phaseState });
  endMatch(
    state,
    won
      ? { kind: 'win', winnerId: 0 }
      : result === 'timeout'
        ? { kind: 'draw', reason: 'timeout' }
        : { kind: 'win', winnerId: 1 },
    events,
  );
}

// ------------------------------------------------------------------ enemy directives

/** What a field enemy's bot is asked to do (see `directiveFor`): hold its post, hunt when set on you, block, or wait. */
export function fieldDirective(state: GameState, id: number): NpcDirective | undefined {
  const { m, f, def } = ctxOf(state);
  const seat = m.seats[id];
  const p = state.players[id];
  const h = state.players[0]!;
  if (!seat || !p || !p.alive || seat.role === 'player' || m.outcome) return undefined;
  const post = seat.post ?? { x: p.x, y: p.y };
  const leg = legAt(def, f.leg);
  const pursuerGroups = new Set(def.legs.flatMap((l) => (l.kind === 'escapeRoute' ? [l.group] : [])));
  if (seat.group && pursuerGroups.has(seat.group)) {
    const hunting = leg.kind === 'escapeRoute' && leg.group === seat.group;
    // decision EF6: a pursuer keeps the pressure on, but a human who has opened a real gap has got away from it - it
    // holds where it stands (and takes up the chase again if he comes back within reach)
    const gap = Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y));
    if (hunting && h.alive && gap <= state.config.enemyAttacks.pursuitGiveUpTiles)
      return { kind: 'chase', x: h.x, y: h.y };
    if (hunting) return { kind: 'guard', x: p.x, y: p.y, radius: 1 };
    const before = def.legs.findIndex((l) => l.kind === 'escapeRoute' && l.group === seat.group) > f.leg;
    return before
      ? { kind: 'block', x: post.x, y: post.y, radius: 0 }
      : { kind: 'guard', x: post.x, y: post.y, radius: seat.radius ?? 3 };
  }
  switch (seat.role) {
    case 'blocker':
      return { kind: 'block', x: post.x, y: post.y, radius: 0 };
    case 'rangedAttacker': {
      const near = h.alive && Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)) <= AGGRO_RADIUS;
      return near
        ? { kind: 'chase', x: h.x, y: h.y }
        : { kind: 'guard', x: post.x, y: post.y, radius: seat.radius ?? 3 };
    }
    default:
      return { kind: 'guard', x: post.x, y: post.y, radius: seat.radius ?? 3 };
  }
}

// ------------------------------------------------------------------ the view

const LEG_UNIT: Record<FieldObjectiveKind, string> = {
  reachMarkers: 'checkpoints',
  clearGroup: 'enemies down',
  escapeRoute: 'at the exit',
  door: 'raid done',
  returnRoute: 'back at the gate',
};

export function fieldMissionView(state: GameState): MissionView {
  const { m, f, def } = ctxOf(state);
  const leg = legAt(def, f.leg);
  const nodes: MissionNodeView[] = m.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    label: n.label,
    state: nodeStateOf(f, def, n),
    fraction: nodeFraction(f, n),
  }));
  const doors: MissionDoorView[] = f.doors.map((d) => ({
    id: d.id,
    x: d.x,
    y: d.y,
    label: d.label,
    raidId: d.raidId,
    status: d.status,
    fraction: nodeFraction(f, { id: d.id } as MissionNodeRuntime),
    required: d.required,
  }));
  let done = 0;
  let goal = 1;
  if (leg.kind === 'reachMarkers') {
    done = f.markersDone;
    goal = leg.markers.length;
  } else if (leg.kind === 'clearGroup') {
    const members = m.seats.filter((s) => s.group === leg.group);
    goal = members.length;
    done = members.filter((s) => !state.players[s.playerId]?.alive).length;
  }
  const won = m.outcome?.result === 'won';
  const crewAlive = m.seats.filter((s) => s.role !== 'player' && state.players[s.playerId]?.alive).length;
  return {
    format: 'field',
    fieldId: f.fieldId,
    phaseText: m.callout ?? legAt(def, f.leg).kind,
    legIndex: f.leg,
    legCount: fieldLegCount(def),
    legKind: leg.kind,
    doors,
    pendingRaid: m.pendingRaid ?? null,
    missionId: m.id,
    objective: 'fieldRoute',
    phase: m.phase,
    phaseCount: 3,
    phaseState: m.phaseState,
    progress: { done: won ? goal : done, goal, label: LEG_UNIT[leg.kind] },
    nodes,
    warnings: [],
    boss: { playerId: -1, shielded: false, exposed: false, exposedRemainingTicks: 0, defeated: false },
    lives: { used: m.livesUsed, max: m.livesMax },
    timeRemainingSec: Math.max(0, Math.ceil((m.tuning.timeLimitTicks - state.match.playTicks) / 60)),
    callout: m.callout,
    crewAlive,
    outcome: m.outcome,
  };
}
