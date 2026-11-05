/**
 * Crew directives (decision MS5): what each NPC role asks of its bot, computed from the mission state and handed to the
 * AI as `Observation.directive` (ai/directive.ts turns it into movement preferences; the bot still plays the ordinary
 * rules and sees only the observation).
 *
 *   meleeGuard         guard its post (radius 3) and fight whatever comes in; chases once the boss is exposed
 *   rangedAttacker     chase the human wherever they are (generators from range, never tied to a post)
 *   blocker            stand on its lane / choke tile
 *   runner             run to the objective's restock / re-arm tile (a destroyed stack, a jammed relay)
 *   escort             stay within radius 2 of the boss
 *   objectiveDefender  guard the node it is assigned to; chases the carrier in the evidence run
 *   supportUnit        stay near a runner / defender ally (else the boss)
 *   bossAssistant      interpose: stand on the tile two steps from the boss towards the human
 *   boss               guard its post (radius 3) while shielded; flee from the human while exposed
 */
import { tileIndex } from '../grid';
import { Tile } from '../types';
import type { GameState } from '../types';
import { makeCtx } from './ctx';
import { fieldDirective } from './field';
import { OBJECTIVES } from './objectives';
import { PRESS_ID } from './objectives/evidence';
import type { MissionSeat, NpcDirective } from './types';

const DEFAULT_RADIUS = 3;

/** The directive of seat `id`, or undefined (not a mission, the human, or someone who is out). */
export function directiveFor(state: GameState, id: number): NpcDirective | undefined {
  const m = state.mission;
  const seat = m?.seats[id];
  const p = state.players[id];
  if (!m || !seat || !p || !p.alive || seat.role === 'player' || m.outcome) return undefined;
  if (m.field) return fieldDirective(state, id);
  const boss = state.players[m.bossId]!;
  const human = state.players[0]!;
  const post = seat.post ?? { x: p.x, y: p.y };
  const exposed = !m.boss.shielded;
  const guard = (x: number, y: number, radius = seat.radius ?? DEFAULT_RADIUS): NpcDirective => ({
    kind: 'guard',
    x,
    y,
    radius,
  });
  const chase: NpcDirective = { kind: 'chase', x: human.x, y: human.y };

  switch (seat.role) {
    case 'boss':
      return exposed && human.alive ? { kind: 'flee', x: human.x, y: human.y } : guard(post.x, post.y);
    case 'meleeGuard':
      return exposed ? chase : guard(post.x, post.y);
    case 'rangedAttacker':
      return chase;
    case 'blocker':
      return { kind: 'block', x: post.x, y: post.y, radius: 0 };
    case 'runner': {
      const target = OBJECTIVES[m.objective].runnerTarget(makeCtx(state, []), p) ?? post;
      return { kind: 'run', x: target.x, y: target.y };
    }
    case 'escort':
      return boss.alive
        ? { kind: 'escort', x: boss.x, y: boss.y, radius: seat.radius ?? 2 }
        : guard(post.x, post.y);
    case 'objectiveDefender': {
      if (exposed || m.carry) return chase;
      const spots = m.nodes.filter((n) => !n.done && n.id !== PRESS_ID);
      const nodes = spots.length > 0 ? spots : m.nodes.filter((n) => n.id !== PRESS_ID);
      const node = nodes.length > 0 ? nodes[(seat.anchor ?? 0) % nodes.length]! : undefined;
      return node ? guard(node.x, node.y) : guard(post.x, post.y);
    }
    case 'supportUnit': {
      const ally = allyOf(state, seat);
      return ally
        ? { kind: 'support', x: ally.x, y: ally.y, radius: seat.radius ?? DEFAULT_RADIUS }
        : guard(post.x, post.y);
    }
    case 'bossAssistant': {
      if (!human.alive) return guard(boss.x, boss.y, 2);
      const [x, y] = interpose(state, boss, human);
      return { kind: 'block', x, y, radius: 0 };
    }
  }
}

/** A living crew ally to stay near: a runner or a defender first, else the boss. */
function allyOf(state: GameState, seat: MissionSeat): { x: number; y: number } | null {
  const m = state.mission!;
  let best: { x: number; y: number } | null = null;
  for (const s of m.seats) {
    if (s.playerId === seat.playerId || (s.role !== 'runner' && s.role !== 'objectiveDefender')) continue;
    const q = state.players[s.playerId];
    if (q?.alive) {
      best = q;
      break;
    }
  }
  const boss = state.players[m.bossId]!;
  return best ?? (boss.alive ? boss : null);
}

/** The floor tile two steps from `from` towards `to` (nearest open tile when that one is blocked). */
function interpose(
  state: GameState,
  from: { x: number; y: number },
  to: { x: number; y: number },
): [number, number] {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  const tx = from.x + (horizontal ? dx * 2 : 0);
  const ty = from.y + (horizontal ? 0 : dy * 2);
  for (const [ox, oy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
  ] as const) {
    const x = tx + ox;
    const y = ty + oy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    if (state.tiles[tileIndex(state, x, y)] === Tile.Empty) return [x, y];
  }
  return [from.x, from.y];
}
