/**
 * THE TERRITORIAL STATE MACHINE of campaign enemies (campaign tactics layer, decision SA6, docs/CAMPAIGN_SECTOR_AI.md).
 * ONE machine for every variant; data (the seat's `TerritoryDef`, the variant's personality, the level's
 * `config.campaignTactics`) changes its numbers, never its shape. Inert without `config.campaignTactics` and
 * `state.territory` (created by the field mission builder, or by a test through `addEnemyMind`).
 *
 *   patrol       walks its waypoint loop (pauses at each; Normal varies the pause, Hard also reverses the loop)
 *   watch        holds its post (no patrol route) or looks around
 *   investigate  heard a noise (a generator being laid, a blast) it did not see: walks to a COARSE spot - its own tile
 *                plus `investigateStep` tiles along one of 8 direction bands - never the source tile, then searches
 *   alert        spotted the human (sight within `noticeTiles` for `noticeTicks`, or within `closeTiles`, or hit, or
 *                an ally's call): turns to him for `alertTicks` (the readable "!"), then pursues
 *   pursue       chases (group tactics when the level allows: a different side each, throwers line up at range);
 *                out of sight it goes to where it last SAW him; a cover user ducks out of sight after attacking
 *   return       the human left the leash (measured from the TERRITORY's anchors, with hysteresis): it first watches
 *                him (facing him; a thrower keeps throwing) for `returnWatchTicks`, then walks back; a hit or the human
 *                coming back inside its pursuit range re-engages it at once (no farming at the boundary)
 *
 * The overlay states (wind-up / attack / recovery, stagger, defeat) are the sim's own and the generator evasion is the
 * AI's (`enemyMindView` combines them for presentation). Everything here is a function of the state and the tick: no
 * RNG, no clock. Sight uses the grid rule of `sight.ts` (walls, crates and other bodies block).
 */
import { DIRS, DIR_VEC, manhattan, tileAt } from '../grid';
import { Tile } from '../types';
import type { GameState, Player, SimEvent, TilePos } from '../types';
import type { EnemyMind, MindState, TerritoryDef, TerritorySpec } from '../campaign/types';
import type { NpcDirective } from '../mission/types';
import { ENEMY_ATTACK_SETS } from '../data/enemyAttacks';
import { variantOf } from '../data/enemyVariants';
import { enemyGroupDirective, standoffSlots } from '../campaign/tactics';
import { canSeePlayer, inViewCone } from './sight';
import { sameSide } from './projectiles';
import { pushEnemyCue } from './enemyCues';
import { throwReach } from './enemyActions';
import { enemyAttackPhase } from './tacticalTrap';
import type { AttackPhase } from './tacticalTrap';

const chebyshev = (a: TilePos, b: TilePos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const floor = (state: GameState, x: number, y: number): boolean => tileAt(state, x, y) === Tile.Empty;

/** Distance (Chebyshev) from a tile to the territory: the nearest anchor (centre or patrol waypoint). */
export function territoryDistance(spec: TerritorySpec, t: TilePos): number {
  let best = Infinity;
  for (const a of spec.anchors) best = Math.min(best, chebyshev(a, t));
  return best;
}

/** The authored territory of one seat, completed from the level and the seat's variant (pure). */
export function resolveTerritory(
  state: GameState,
  p: Readonly<Player>,
  post: TilePos,
  def: TerritoryDef = {},
): TerritorySpec {
  const cfg = state.config.campaignTactics!;
  const kind = p.enemyKind!;
  const pers = variantOf(p)!.personality;
  const centre = def.centre ? { x: def.centre[0], y: def.centre[1] } : { x: post.x, y: post.y };
  const patrol = (def.patrol ?? []).map(([x, y]) => ({ x, y }));
  const pursuitTiles = Math.max(2, (def.pursuitTiles ?? cfg.territory.pursuitTiles) + pers.pursuitBonus);
  const keepsDistance = ENEMY_ATTACK_SETS[kind].keepsDistance;
  return {
    anchors: [centre, ...patrol],
    patrol: patrol.length >= 2 ? patrol : [],
    centre,
    radius: def.radius ?? 2,
    investigateRadius: def.investigateRadius ?? cfg.territory.investigateRadius,
    pursuitTiles,
    leashTiles: pursuitTiles + cfg.territory.leashSlack,
    watchTicks: def.onReturn === 'walk' ? 0 : cfg.territory.returnWatchTicks,
    alertAllies: Math.round((def.alertAllies ?? pers.alertAllies) * cfg.territory.alertAlliesScale),
    escape: def.escape ?? 'free',
    usesCover: pers.usesCover && cfg.territory.coverTiles > 0,
    preferredRange: pers.preferredRange || (keepsDistance ? state.config.enemyAttacks.standoffTiles : 0),
    noticeTicks: Math.max(1, Math.round(cfg.awareness.noticeTicks * pers.noticeScale)),
    noticeTiles: cfg.awareness.noticeTiles[kind],
    hearingTiles: cfg.perception[kind].hearingTiles,
  };
}

/** Gives enemy seat `id` a territory and a fresh mind (the field builder; tests). No-op without the tactics layer. */
export function addEnemyMind(state: GameState, id: number, post: TilePos, def?: TerritoryDef): void {
  const p = state.players[id];
  if (!state.config.campaignTactics || !p?.enemyKind) return;
  const spec = resolveTerritory(state, p, post, def);
  state.territory ??= { minds: {}, heardGeneratorId: 0, heardBlastId: 0 };
  state.territory.minds[id] = {
    spec,
    state: spec.patrol.length > 0 ? 'patrol' : 'watch',
    since: state.tick,
    waypoint: 0,
    dirSign: 1,
    lap: 0,
    pauseUntil: -1,
    target: null,
    lastSeen: null,
    lastSeenTick: -1e9,
    notice: 0,
    watchUntil: -1,
    hpSeen: p.vitals?.hp ?? 0,
    coverUntil: -1,
    attackSeen: p.lastAttack?.endTick ?? -1,
  };
}

/** The campaign human this enemy reacts to: the nearest living rival without an enemy kind (ties: lowest id). */
function quarry(state: GameState, p: Readonly<Player>): Player | null {
  let best: Player | null = null;
  for (const o of state.players) {
    if (!o.alive || o.enemyKind !== undefined || sameSide(p, o) || o.team === p.team) continue;
    if (best === null || manhattan(p, o) < manhattan(p, best)) best = o;
  }
  return best;
}

/** Deterministic per-visit variation of a patrol pause (no RNG): a small hash of seat, lap and waypoint. */
function jitter(id: number, lap: number, waypoint: number, span: number): number {
  if (span <= 0) return 0;
  const h =
    (Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(lap + 7, 0x85ebca6b) ^ Math.imul(waypoint + 3, 0xc2b2ae35)) >>>
    0;
  return (h % (2 * span + 1)) - span;
}

/**
 * The COARSE direction band of a noise heard from (x, y) (8 bands; integer comparisons only): a horizontal or
 * vertical band when one axis dominates by more than 2:1, else a diagonal one. The distance is not kept.
 */
export function noiseBand(from: TilePos, x: number, y: number): { dx: number; dy: number } {
  const dx = x - from.x;
  const dy = y - from.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 0 && ay === 0) return { dx: 0, dy: 0 };
  if (ax > 2 * ay) return { dx: Math.sign(dx), dy: 0 };
  if (ay > 2 * ax) return { dx: 0, dy: Math.sign(dy) };
  return { dx: Math.sign(dx), dy: Math.sign(dy) };
}

/**
 * Where an enemy goes to look after hearing a noise in direction band `band` (decision SA4): `investigateStep` tiles
 * along the band from its own tile, shortened until it is open floor within `radius + investigateRadius` of its
 * territory. It depends on the band only, so two hidden sources in the same band send it to the same spot.
 */
export function investigateSpot(
  state: GameState,
  p: Readonly<Player>,
  spec: TerritorySpec,
  band: { dx: number; dy: number },
): TilePos {
  const step = state.config.campaignTactics!.awareness.investigateStep;
  for (let k = step; k >= 1; k--) {
    const t = { x: p.x + band.dx * k, y: p.y + band.dy * k };
    if (!floor(state, t.x, t.y)) continue;
    if (territoryDistance(spec, t) > spec.radius + spec.investigateRadius) continue;
    return t;
  }
  return { x: p.x, y: p.y };
}

function setState(m: EnemyMind, s: MindState, tick: number): void {
  m.state = s;
  m.since = tick;
}

function face(p: Player, t: TilePos | null): void {
  if (!t || p.stepRemaining > 0 || p.attack !== null) return;
  const dx = t.x - p.x;
  const dy = t.y - p.y;
  if (dx === 0 && dy === 0) return;
  p.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

function alert(
  state: GameState,
  m: EnemyMind,
  p: Player,
  seen: TilePos | null,
  events: SimEvent[],
  byId: number | null,
): void {
  const T = state.tick;
  const was = m.state;
  if (was === 'alert' || was === 'pursue') return;
  setState(m, 'alert', T);
  m.notice = 0;
  if (seen) {
    m.lastSeen = { x: seen.x, y: seen.y };
    m.lastSeenTick = T;
  }
  const cfg = state.config.campaignTactics!;
  pushEnemyCue(state, events, {
    playerId: p.id,
    cue: 'alert',
    untilTick: T + cfg.awareness.alertTicks,
    x: m.lastSeen?.x ?? p.x,
    y: m.lastSeen?.y ?? p.y,
    byId,
  });
  if (byId !== null || m.spec.alertAllies <= 0) return;
  // the call: allies of its team within `alertAllies` tiles hear it and know where it saw him (never more)
  for (const [key, q] of Object.entries(state.territory!.minds)) {
    const ally = state.players[Number(key)]!;
    if (ally.id === p.id || !ally.alive || ally.team !== p.team) continue;
    if (manhattan(ally, p) > m.spec.alertAllies) continue;
    alert(state, q, ally, m.lastSeen, events, p.id);
  }
}

function giveUp(state: GameState, m: EnemyMind, p: Player, events: SimEvent[]): void {
  const T = state.tick;
  setState(m, 'return', T);
  m.watchUntil = T + m.spec.watchTicks;
  let best = m.spec.anchors[0]!;
  for (const a of m.spec.anchors) if (manhattan(a, p) < manhattan(best, p)) best = a;
  m.target = { x: best.x, y: best.y };
  pushEnemyCue(state, events, { playerId: p.id, cue: 'lost', untilTick: m.watchUntil, x: best.x, y: best.y });
}

/** The noises of this tick: generators just laid and blasts just set off, by anyone not on the listener's side. */
interface Noise {
  x: number;
  y: number;
  ownerTeam: number;
  loud: boolean;
}

function noisesOf(state: GameState): Noise[] {
  const t = state.territory!;
  const out: Noise[] = [];
  for (const g of state.generators) {
    if (g.id <= t.heardGeneratorId) continue;
    const owner = state.players[g.ownerId];
    out.push({ x: g.x, y: g.y, ownerTeam: owner?.team ?? -1, loud: false });
  }
  for (const b of state.blasts) {
    if (b.id <= t.heardBlastId || b.tiles.length === 0) continue;
    const owner = state.players[b.seedOwnerId];
    const i = b.tiles[0]!;
    out.push({
      x: i % state.width,
      y: Math.floor(i / state.width),
      ownerTeam: owner?.team ?? -1,
      loud: true,
    });
  }
  for (const g of state.generators) t.heardGeneratorId = Math.max(t.heardGeneratorId, g.id);
  for (const b of state.blasts) t.heardBlastId = Math.max(t.heardBlastId, b.id);
  return out;
}

/** One tick of every mind (tick.ts, after attacks and projectiles). */
export function updateTerritory(state: GameState, events: SimEvent[]): void {
  const cfg = state.config.campaignTactics;
  const terr = state.territory;
  if (!cfg || !terr) return;
  const T = state.tick;
  const noises = noisesOf(state);
  for (const [key, m] of Object.entries(terr.minds)) {
    const p = state.players[Number(key)]!;
    if (!p.alive) continue;
    const h = quarry(state, p);
    const hp = p.vitals?.hp ?? 0;
    const hit = hp < m.hpSeen;
    m.hpSeen = hp;
    // calm (patrol, watch, walking back) it looks where it walks: the cone ahead (and the eight tiles around it)
    const calmNow =
      m.state === 'patrol' || m.state === 'watch' || (m.state === 'return' && T >= m.watchUntil);
    const sees =
      h !== null && (!calmNow || inViewCone(p, h.x, h.y)) && canSeePlayer(state, p, h, m.spec.noticeTiles);
    const close = h !== null && manhattan(p, h) <= cfg.awareness.closeTiles;
    if (h && (sees || close)) {
      m.lastSeen = { x: h.x, y: h.y };
      m.lastSeenTick = T;
    }
    if (p.lastAttack && p.lastAttack.endTick > m.attackSeen) {
      m.attackSeen = p.lastAttack.endTick;
      if (m.spec.usesCover && m.state === 'pursue')
        m.coverUntil = Math.max(p.rootedUntil, T) + cfg.territory.coverHoldTicks;
    }
    const calm =
      m.state === 'patrol' || m.state === 'watch' || m.state === 'investigate' || m.state === 'return';
    if (calm) {
      const inside = h !== null && territoryDistance(m.spec, h) <= m.spec.pursuitTiles;
      if (h && (hit || close)) {
        alert(state, m, p, h, events, null);
      } else if (h && sees) {
        // sight builds up (faster while it is already looking: investigating, or a returning enemy he re-enters on)
        const keen = m.state === 'investigate' || (m.state === 'return' && inside) ? 3 : 1;
        m.notice += keen;
        if (m.notice >= m.spec.noticeTicks && (inside || m.state !== 'return'))
          alert(state, m, p, h, events, null);
      } else {
        m.notice = Math.max(0, m.notice - 2);
      }
    }
    if (m.state === 'patrol' || m.state === 'watch' || (m.state === 'return' && T >= m.watchUntil)) {
      // hearing: a noise it did not see sends it to look, along a coarse band only
      for (const n of noises) {
        if (n.ownerTeam === p.team) continue;
        const range = n.loud ? m.spec.hearingTiles * cfg.awareness.blastHearingScale : m.spec.hearingTiles;
        if (Math.abs(n.x - p.x) + Math.abs(n.y - p.y) > range) continue;
        const band = noiseBand(p, n.x, n.y);
        if (band.dx === 0 && band.dy === 0) continue;
        setState(m, 'investigate', T);
        m.target = investigateSpot(state, p, m.spec, band);
        m.pauseUntil = -1;
        pushEnemyCue(state, events, {
          playerId: p.id,
          cue: 'investigate',
          untilTick: T + cfg.awareness.investigateTimeoutTicks,
          x: m.target.x,
          y: m.target.y,
        });
        break;
      }
    }
    advance(state, m, p, h, sees || close, hit, events);
  }
}

function advance(
  state: GameState,
  m: EnemyMind,
  p: Player,
  h: Player | null,
  sees: boolean,
  hit: boolean,
  events: SimEvent[],
): void {
  const cfg = state.config.campaignTactics!;
  const T = state.tick;
  switch (m.state) {
    case 'alert':
      face(p, m.lastSeen);
      if (hit || T - m.since >= cfg.awareness.alertTicks) setState(m, 'pursue', T);
      return;
    case 'pursue': {
      if (!h) {
        giveUp(state, m, p, events);
        return;
      }
      // the leash is measured from the TERRITORY, with hysteresis; a hit keeps it on him
      if (!hit && territoryDistance(m.spec, h) > m.spec.leashTiles) {
        giveUp(state, m, p, events);
        return;
      }
      if (!sees && T - m.lastSeenTick > cfg.awareness.loseTicks) {
        setState(m, 'investigate', T);
        m.target = m.lastSeen ? { ...m.lastSeen } : { x: p.x, y: p.y };
        m.pauseUntil = -1;
      }
      return;
    }
    case 'investigate': {
      const t = m.target ?? { x: p.x, y: p.y };
      if (m.pauseUntil < 0 && (chebyshev(p, t) <= 1 || T - m.since > cfg.awareness.investigateTimeoutTicks))
        m.pauseUntil = T + cfg.awareness.searchTicks;
      if (m.pauseUntil >= 0 && T >= m.pauseUntil) {
        setState(m, 'return', T);
        m.watchUntil = T;
        let best = m.spec.anchors[0]!;
        for (const a of m.spec.anchors) if (manhattan(a, p) < manhattan(best, p)) best = a;
        m.target = { x: best.x, y: best.y };
      }
      return;
    }
    case 'return': {
      if (T < m.watchUntil) {
        face(p, h ?? m.lastSeen);
        // the human came back inside its pursuit range while it watches: it takes up the chase at once
        if (h && sees && territoryDistance(m.spec, h) <= m.spec.pursuitTiles)
          alert(state, m, p, h, events, null);
        return;
      }
      const t = m.target ?? m.spec.centre;
      if (chebyshev(p, t) <= 0) {
        if (m.spec.patrol.length > 0) {
          setState(m, 'patrol', T);
          m.waypoint = nearestWaypoint(m.spec.patrol, p);
        } else setState(m, 'watch', T);
        m.target = null;
      }
      return;
    }
    case 'patrol': {
      const route = m.spec.patrol;
      if (route.length === 0) {
        setState(m, 'watch', T);
        return;
      }
      if (T < m.pauseUntil) return;
      const wp = route[m.waypoint % route.length]!;
      if (p.x === wp.x && p.y === wp.y && p.stepRemaining === 0) {
        const pause =
          cfg.territory.patrolPauseTicks + jitter(p.id, m.lap, m.waypoint, cfg.territory.patrolJitterTicks);
        m.pauseUntil = T + Math.max(0, pause);
        const n = route.length;
        const next = m.waypoint + m.dirSign;
        if (next >= n || next < 0) {
          m.lap++;
          if (cfg.territory.reversePatrol && m.lap % 2 === 1) {
            m.dirSign = m.dirSign === 1 ? -1 : 1;
            m.waypoint = (m.waypoint + m.dirSign + n) % n;
          } else m.waypoint = (next + n) % n;
        } else m.waypoint = next;
      }
      return;
    }
    case 'watch': {
      // it scans: a quarter turn every `lookAroundTicks` while it stands
      const every = cfg.territory.lookAroundTicks;
      if (
        every > 0 &&
        T > m.since &&
        (T - m.since) % every === 0 &&
        p.stepRemaining === 0 &&
        p.attack === null
      )
        p.facing = DIRS[(DIRS.indexOf(p.facing) + 1) % 4]!;
      return;
    }
  }
}

function nearestWaypoint(route: readonly TilePos[], p: TilePos): number {
  let best = 0;
  for (let i = 1; i < route.length; i++) if (manhattan(route[i]!, p) < manhattan(route[best]!, p)) best = i;
  return best;
}

// ------------------------------------------------------------------ directives (what the bot is asked to do)

/** A floor tile within `radius` steps from which `h` is NOT visible (cover), nearest first; null when none. */
export function coverTile(
  state: GameState,
  p: Readonly<Player>,
  h: Readonly<Player>,
  radius: number,
): TilePos | null {
  const w = state.width;
  const seen = new Set<number>([p.y * w + p.x]);
  let frontier: TilePos[] = [{ x: p.x, y: p.y }];
  for (let d = 1; d <= radius; d++) {
    const next: TilePos[] = [];
    for (const t of frontier) {
      for (const dir of DIRS) {
        const x = t.x + DIR_VEC[dir].dx;
        const y = t.y + DIR_VEC[dir].dy;
        const i = y * w + x;
        if (seen.has(i) || !floor(state, x, y)) continue;
        seen.add(i);
        if (state.players.some((o) => o.alive && o.x === x && o.y === y)) continue;
        next.push({ x, y });
      }
    }
    for (const t of next) {
      const probe = { ...p, x: t.x, y: t.y } as Player;
      if (manhattan(t, h) > 1 && !canSeePlayer(state, probe, h, 99)) return t;
    }
    frontier = next;
  }
  return null;
}

/** A throwing slot `preferredRange` tiles from the human in a clear line (the nearest free one), or null. */
function throwSlot(
  state: GameState,
  p: Readonly<Player>,
  h: Readonly<Player>,
  range: number,
): TilePos | null {
  const cfg = state.config.enemyAttacks;
  const slots = standoffSlots(state, h, throwReach(state.config, p) || range, range, cfg.minRange);
  let best: TilePos | null = null;
  for (const s of slots) {
    if (state.players.some((o) => o.alive && o.id !== p.id && o.x === s.x && o.y === s.y)) continue;
    if (best === null || manhattan(s, p) < manhattan(best, p)) best = s;
  }
  return best;
}

/** The directive of a minded enemy, or undefined (no mind, not alive, no tactics layer). Pure. */
export function territoryDirective(state: GameState, id: number): NpcDirective | undefined {
  const m = state.territory?.minds[id];
  const p = state.players[id];
  const cfg = state.config.campaignTactics;
  if (!m || !p || !p.alive || !cfg) return undefined;
  const leash = m.spec.escape === 'territory' ? m.spec.radius : undefined;
  const here = (radius = 0): NpcDirective => ({ kind: 'hold', x: p.x, y: p.y, radius });
  switch (m.state) {
    case 'watch':
      return { kind: 'hold', x: m.spec.centre.x, y: m.spec.centre.y, radius: leash ?? 1 };
    case 'alert':
      return here();
    case 'patrol': {
      if (state.tick < m.pauseUntil || m.spec.patrol.length === 0) return here(leash ?? 0);
      const wp = m.spec.patrol[m.waypoint % m.spec.patrol.length]!;
      return { kind: 'patrol', x: wp.x, y: wp.y, ...(leash !== undefined ? { radius: leash } : {}) };
    }
    case 'investigate': {
      const t = m.target ?? { x: p.x, y: p.y };
      return m.pauseUntil >= 0 ? here() : { kind: 'investigate', x: t.x, y: t.y };
    }
    case 'return': {
      if (state.tick < m.watchUntil) return here();
      const t = m.target ?? m.spec.centre;
      return { kind: 'return', x: t.x, y: t.y, ...(leash !== undefined ? { radius: leash } : {}) };
    }
    case 'pursue': {
      const h = quarry(state, p);
      if (!h) return here();
      const near = state.tick - m.lastSeenTick <= 1;
      if (!near) return m.lastSeen ? { kind: 'investigate', x: m.lastSeen.x, y: m.lastSeen.y } : here();
      if (state.tick < m.coverUntil && state.tick >= p.rootedUntil) {
        const c = coverTile(state, p, h, cfg.territory.coverTiles);
        if (c) return { kind: 'hold', x: c.x, y: c.y, radius: 0 };
      }
      if (m.spec.preferredRange > 0) {
        const slot = throwSlot(state, p, h, m.spec.preferredRange);
        if (slot) return { kind: 'standoff', x: slot.x, y: slot.y, radius: 0 };
      }
      if (cfg.territory.groupTactics) {
        const d = enemyGroupDirective(state, id, (o) => state.territory?.minds[o.id]?.state === 'pursue');
        if (d && d.kind !== 'hold' && d.kind !== 'reinforce') return d;
      }
      return { kind: 'chase', x: h.x, y: h.y };
    }
  }
}

/** The readable state of an enemy for presentation and tests (decision SA6): the sim's overlay first, then the mind. */
export type EnemyMindViewState = MindState | 'defeated' | 'stagger' | AttackPhase;

/**
 * What an enemy is doing, readably (the renderer's "!" / "?" / swing / planted poses; docs/CAMPAIGN_SECTOR_AI.md):
 * defeated, then stagger (reeling), then the attack phases (`enemyAttackPhase`: windup / attack / recovery), then the
 * territorial state. Null for a seat without a mind. Generator evasion is the bot's (it shows as movement).
 */
export function enemyMindView(state: GameState, id: number): EnemyMindViewState | null {
  const m = state.territory?.minds[id];
  const p = state.players[id];
  if (!m || !p) return null;
  if (!p.alive) return 'defeated';
  if (state.tick < p.dazedUntil) return 'stagger';
  const phase = enemyAttackPhase(state, p);
  return phase === 'idle' ? m.state : phase;
}
