/**
 * Rumble sudden death (decisions SD1-SD6). When the clock runs out, or a blast takes down everyone still active,
 * the credited kills of every player (the fallen included) decide. One clear highest total wins at once; the
 * players tied on it are the only contenders: they are seated in the compacted area and fight on until
 * full-area blasts drop, the first after 60 s, the second 30 s later and then every 15 s, until one contender
 * is left.
 *
 * Each blast is an ordinary lethal hit (`cause.kind === 'suddenDeath'`) resolved by `applyLethalHits`, so the
 * existing protection layers decide who lives: a mounted Okada is spent first, then one Armour plate, one layer
 * per blast; a contender with none is eliminated. Nothing here invents an inventory. The only draw is
 * `suddenDeathExhausted`: a blast takes the last contenders down together with the lead still shared.
 */
import { tileAt } from '../grid';
import { Tile } from '../types';
import type {
  GameState,
  Player,
  SimEvent,
  SuddenDeathArea,
  SuddenDeathCause,
  SuddenDeathContender,
  WinReason,
} from '../types';
import { endMatch, leadingSides, sideKills, sideOf, winFor } from './matchResult';
import type { LethalHit } from './lethality';
import { flameAt, groundedGeneratorAt, pickupAt } from './queries';
import { dangerTiles, respawn } from './respawn';

/** Ticks of protection that outlast the title card, so the first moments of the countdown are fair. */
const SETTLE_TICKS = 60;

/**
 * The compacted area: the arena's never-closing core when it has one (every Rumble stage does), else the
 * bounding box of the tiles that are still open. The blast reaches every contender wherever they stand.
 */
export function suddenDeathArea(state: GameState): SuddenDeathArea {
  const core = state.config.crush.keepCore;
  if (core) {
    const x0 = Math.floor((state.width - core.w) / 2);
    const y0 = Math.floor((state.height - core.h) / 2);
    return { x0, y0, x1: x0 + core.w - 1, y1: y0 + core.h - 1 };
  }
  const area: SuddenDeathArea = { x0: state.width, y0: state.height, x1: -1, y1: -1 };
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (tileAt(state, x, y) === Tile.Hard) continue;
      area.x0 = Math.min(area.x0, x);
      area.y0 = Math.min(area.y0, y);
      area.x1 = Math.max(area.x1, x);
      area.y1 = Math.max(area.y1, y);
    }
  }
  return area.x1 < 0 ? { x0: 0, y0: 0, x1: state.width - 1, y1: state.height - 1 } : area;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** `count` seats in the area, spread as far apart as the floor allows (farthest-point, ties by position). */
function seatSpots(state: GameState, area: SuddenDeathArea, count: number): { x: number; y: number }[] {
  const danger = dangerTiles(state);
  const collect = (inArea: boolean, strict: boolean): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let y = inArea ? area.y0 : 0; y <= (inArea ? area.y1 : state.height - 1); y++) {
      for (let x = inArea ? area.x0 : 0; x <= (inArea ? area.x1 : state.width - 1); x++) {
        if (tileAt(state, x, y) !== Tile.Empty || groundedGeneratorAt(state, x, y)) continue;
        if (strict && (flameAt(state, x, y) || pickupAt(state, x, y) || danger.has(y * state.width + x)))
          continue;
        if (!NEIGHBOURS.some(([dx, dy]) => tileAt(state, x + dx, y + dy) === Tile.Empty)) continue;
        out.push({ x, y });
      }
    }
    return out;
  };
  let cands = collect(true, true);
  if (cands.length < count) cands = collect(true, false);
  if (cands.length < count) cands = collect(false, false);

  const chosen: { x: number; y: number }[] = [];
  while (chosen.length < count && cands.length > 0) {
    let best = 0;
    let bestScore = -Infinity;
    cands.forEach((c, i) => {
      const score =
        chosen.length === 0 ? 0 : Math.min(...chosen.map((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y)));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    chosen.push(cands.splice(best, 1)[0]!);
  }
  return chosen;
}

/** A fighter who lost the kill count stands down (no death is counted, nobody is credited). */
function standDown(state: GameState, p: Player, eventId: number, events: SimEvent[]): void {
  const cause = { kind: 'suddenDeath', eventId } as const;
  p.alive = false;
  p.eliminatedTick = state.tick;
  p.elimination = cause;
  p.eliminatedBy = null;
  p.entryUntil = null;
  p.stepRemaining = 0;
  if (p.carrying !== null) {
    const gen = state.generators.find((g) => g.id === p.carrying);
    if (gen) {
      gen.carriedBy = null;
      gen.stepFromX = gen.x;
      gen.stepFromY = gen.y;
    }
    p.carrying = null;
  }
  events.push({
    type: 'playerEliminated',
    playerId: p.id,
    cause,
    x: p.x,
    y: p.y,
    creditId: null,
    assistIds: [],
  });
}

function seat(state: GameState, p: Player, x: number, y: number): void {
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
  p.slide = null;
  p.teleportPending = null;
  p.entryUntil = null;
  p.dazedUntil = 0;
  if (p.carrying !== null) {
    const gen = state.generators.find((g) => g.id === p.carrying);
    if (gen) {
      gen.carriedBy = null;
      gen.x = gen.stepFromX = x;
      gen.y = gen.stepFromY = y;
    }
    p.carrying = null;
  }
}

/** Starts the round: everyone else stands down, the contenders are seated (the fallen are brought back). */
export function enterSuddenDeath(
  state: GameState,
  contenders: readonly Player[],
  cause: SuddenDeathCause,
  events: SimEvent[],
): void {
  const cfg = state.config.suddenDeath;
  const area = suddenDeathArea(state);
  const ids = new Set(contenders.map((p) => p.id));
  const standEventId = state.nextEventId++;
  for (const p of state.players) {
    if (ids.has(p.id)) continue;
    p.respawnAt = null;
    if (p.alive) standDown(state, p, standEventId, events);
  }

  const ordered = [...contenders].sort((a, b) => a.id - b.id);
  const spots = seatSpots(state, area, ordered.length);
  const transitionEndTick = state.tick + cfg.transitionTicks;
  ordered.forEach((p, i) => {
    const spot = spots[i] ?? { x: p.x, y: p.y };
    if (p.alive) seat(state, p, spot.x, spot.y);
    else {
      respawn(state, p, spot.x, spot.y);
      events.push({ type: 'playerRespawned', playerId: p.id, x: p.x, y: p.y });
    }
    p.protectedUntil = transitionEndTick + SETTLE_TICKS;
  });

  const list: SuddenDeathContender[] = ordered.map((p) => ({ playerId: p.id, kills: p.stats.kills }));
  state.match.suddenDeath = {
    cause,
    stage: 'transition',
    contenders: list,
    startedTick: state.tick,
    transitionEndTick,
    area,
    blastsFired: 0,
    nextBlastTick: Infinity,
    lastBlastTick: null,
    blastResolving: false,
  };
  events.push({ type: 'suddenDeathStarted', cause, contenders: list, area, transitionEndTick });
}

/** True while the title card holds input back. */
export function suddenDeathHoldsInput(state: GameState): boolean {
  const sd = state.match.suddenDeath;
  return sd !== null && sd.stage === 'transition' && state.tick < sd.transitionEndTick;
}

/** Blast 1 comes 60 s after the title card, blast 2 30 s after that, every later one 15 s after the last. */
function scheduleBlast(state: GameState, events: SimEvent[]): void {
  const sd = state.match.suddenDeath!;
  const cfg = state.config.suddenDeath;
  const delay = cfg.blastDelayTicks[sd.blastsFired] ?? cfg.repeatBlastTicks;
  sd.nextBlastTick = state.tick + delay;
  events.push({ type: 'suddenDeathCountdown', blast: sd.blastsFired + 1, blastTick: sd.nextBlastTick });
}

/** Per tick, before lethal hits resolve: ends the title card and queues a due blast's hits. */
export function updateSuddenDeath(state: GameState, hits: LethalHit[], events: SimEvent[]): void {
  const sd = state.match.suddenDeath;
  if (!sd) return;
  if (sd.stage === 'transition' && state.tick >= sd.transitionEndTick) {
    sd.stage = 'countdown';
    scheduleBlast(state, events);
  }
  if (sd.stage !== 'countdown' || state.tick < sd.nextBlastTick) return;

  const eventId = state.nextEventId++;
  for (const c of sd.contenders) {
    const p = state.players[c.playerId]!;
    if (!p.alive) continue;
    hits.push({
      playerId: p.id,
      eventId,
      cause: { kind: 'suddenDeath', eventId },
      graceUntil: state.tick,
    });
  }
  sd.blastsFired++;
  sd.lastBlastTick = state.tick;
  sd.nextBlastTick = Infinity;
  sd.blastResolving = true;
}

/**
 * Sudden death trigger (time up, or nobody left active): the credited kills of EVERY player count, the ones
 * who have just fallen included. One clear highest total wins at once; the players tied on it (a team's
 * members when teams tie) are the only contenders of the sudden-death round.
 */
export function resolveByKills(state: GameState, by: WinReason, events: SimEvent[]): void {
  const lead = leadingSides(sideKills(state, state.players));
  if (lead.length === 1) endMatch(state, winFor(state, lead[0]!, by), events);
  else
    enterSuddenDeath(
      state,
      state.players.filter((p) => lead.includes(sideOf(state, p))),
      by === 'timeoutKills' ? 'timeout' : 'simultaneous',
      events,
    );
}

/**
 * After lethal hits resolved: reports a blast, schedules the next one, and finds the winner or the draw.
 *
 *  - one side standing: it wins (a fight can end the round before any blast);
 *  - several sides standing after a blast: the next blast is scheduled (30 s after the first, then every 15 s),
 *    with no limit: each blast takes one protection layer from each survivor, so the round always narrows;
 *  - nobody standing: the credited kills of every player decide again (the fallen included). One clear leader
 *    wins. A fight that took the last contenders down together with the lead still shared starts a fresh round
 *    for the tied players; a blast that did, has no winner left to produce, so it is the (only) draw,
 *    `suddenDeathExhausted`.
 */
export function evaluateSuddenDeath(state: GameState, events: SimEvent[]): void {
  const sd = state.match.suddenDeath;
  if (!sd) return;
  const members = sd.contenders.map((c) => state.players[c.playerId]!);
  const standing = members.filter((p) => p.alive);
  const sides = new Set(standing.map((p) => sideOf(state, p)));
  const blastFell = sd.blastResolving;

  if (blastFell) {
    sd.blastResolving = false;
    events.push({
      type: 'suddenDeathBlast',
      blast: sd.blastsFired,
      survivors: standing.map((p) => p.id),
      eliminated: members
        .filter((p) => !p.alive && p.eliminatedTick === state.tick && p.elimination?.kind === 'suddenDeath')
        .map((p) => p.id),
    });
    if (sides.size > 1) {
      scheduleBlast(state, events);
      return;
    }
  }

  if (sides.size === 1) {
    endMatch(state, winFor(state, [...sides][0]!, 'suddenDeath'), events);
  } else if (sides.size === 0) {
    const lead = leadingSides(sideKills(state, state.players));
    if (lead.length === 1) endMatch(state, winFor(state, lead[0]!, 'simultaneousKills'), events);
    else if (blastFell) endMatch(state, { kind: 'draw', reason: 'suddenDeathExhausted' }, events);
    else resolveByKills(state, 'simultaneousKills', events);
  }
}
