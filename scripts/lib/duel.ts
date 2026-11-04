/**
 * Close-combat duel harness shared by `scripts/combat-balance.ts` and `tests/attack-catalogue.test.ts`: two fighters
 * with chosen attacks play through the real simulation (no rendering). Both walk up to each other and press B whenever
 * B would throw an attack; nobody can die (the measurement is control, not elimination).
 */
import { chooseAttack, createGame, tick } from '../../src/sim';
import type { AttackKind, DeepPartial, GameConfig, GameState, Intents } from '../../src/sim';
import { Tile } from '../../src/sim/types';

export const HZ = 60;
/** The length of an ENGAGEMENT: the first exchanges of a fight (startup, reach, interrupts) before the long game. */
export const ENGAGEMENT_SECONDS = 5;

export interface DuelSide {
  hits: number;
  whiffs: number;
  /** Seconds the fighter lost: dazed, being pushed, or slowed (the slow counted as the walking time it costs). */
  controlSeconds: number;
}

/** A corridor-free open board with the fighters on the middle row, `gap` tiles apart (1 = adjacent). */
export function duelState(
  a: AttackKind,
  b: AttackKind,
  gap: number,
  config?: DeepPartial<GameConfig>,
): GameState {
  const s = createGame({
    seed: 7,
    players: [a, b].map((primary, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller' as const,
      isBot: false,
      attacks: { primary, secondary: null },
    })),
    settings: { stageHazards: false },
    config,
  });
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  const left = 3;
  for (const [i, x, f] of [
    [0, left, 'right'],
    [1, left + gap, 'left'],
  ] as const) {
    const p = s.players[i]!;
    p.x = p.stepFromX = x;
    p.y = p.stepFromY = 4;
    p.facing = f;
  }
  // nothing can kill anyone here
  for (const p of s.players) {
    p.armour = 99;
    p.protectedUntil = 0;
  }
  return s;
}

function intentFor(s: GameState, me: 0 | 1): Intents[number] {
  const a = s.players[me]!;
  const b = s.players[me === 0 ? 1 : 0]!;
  // next to the rival (even while the attack is locked out or recovering) stand and press; in reach-2 range press; else close in
  if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1 || chooseAttack(s, a)) return { special: true };
  if (a.x !== b.x) return { move: a.x < b.x ? 'right' : 'left' };
  return { move: a.y < b.y ? 'down' : 'up' };
}

/** One duel of `seconds`, fighter 0 vs fighter 1, starting `gap` tiles apart (`foe`: the rival fights back, stands still or runs). */
export function playDuel(
  a: AttackKind,
  b: AttackKind,
  gap: number,
  seconds = 60,
  foe: 'duel' | 'still' | 'flee' = 'duel',
  config?: DeepPartial<GameConfig>,
): [DuelSide, DuelSide] {
  const s = duelState(a, b, gap, config);
  const out: [DuelSide, DuelSide] = [
    { hits: 0, whiffs: 0, controlSeconds: 0 },
    { hits: 0, whiffs: 0, controlSeconds: 0 },
  ];
  const m = s.config.movement;
  for (let t = 0; t < seconds * HZ; t++) {
    const intents: Intents = { 0: intentFor(s, 0) };
    if (foe === 'duel') intents[1] = intentFor(s, 1);
    else if (foe === 'flee') intents[1] = { move: s.players[1]!.x < 13 ? 'right' : 'left' };
    for (const e of tick(s, intents)) {
      if (e.type === 'attackResolved') out[e.playerId]![e.hit ? 'hits' : 'whiffs']++;
      if (e.type === 'playerPushed') {
        // a displaced fighter loses the push itself and the walk back into the fight
        const v = s.players[e.playerId]!;
        const tiles = Math.round(v.stepRemaining / m.pushStepTicks);
        out[e.playerId as 0 | 1].controlSeconds +=
          (v.stepRemaining + tiles * m.stepTicksBySpeedLevel[0]!) / HZ;
      }
    }
    for (const v of [0, 1] as const) {
      const p = s.players[v]!;
      if (s.tick < p.dazedUntil) out[v].controlSeconds += 1 / HZ;
      else if (p.slow && s.tick < p.slow.until)
        out[v].controlSeconds +=
          p.slow.extraStepTicks / (m.stepTicksBySpeedLevel[0]! + p.slow.extraStepTicks) / HZ;
    }
  }
  return out;
}

export interface Matchup {
  /** Hits landed and control seconds INFLICTED by the row attack and by the column attack, summed over every start. */
  hitsRow: number;
  hitsCol: number;
  controlRow: number;
  controlCol: number;
  /** Share of all the control in the fight that the ROW attack inflicted (0.5 = even). */
  share: number;
}

/** The starts every pairing is played from: adjacent, and 4 tiles apart (so reach-2 attacks can open). */
export const DUEL_GAPS = [1, 4] as const;

/**
 * Row attack vs column attack, played from every start with the fighters on both sides of the board (the lower
 * player id acts first within a tick, so seating is swapped to cancel that edge).
 */
export function matchup(
  row: AttackKind,
  col: AttackKind,
  seconds = 60,
  config?: DeepPartial<GameConfig>,
): Matchup {
  const m: Matchup = { hitsRow: 0, hitsCol: 0, controlRow: 0, controlCol: 0, share: 0.5 };
  for (const gap of DUEL_GAPS) {
    const [x, y] = playDuel(row, col, gap, seconds, 'duel', config);
    m.hitsRow += x.hits;
    m.hitsCol += y.hits;
    // control INFLICTED by the row attack = what the column fighter lost
    m.controlRow += y.controlSeconds;
    m.controlCol += x.controlSeconds;
    const [y2, x2] = playDuel(col, row, gap, seconds, 'duel', config);
    m.hitsRow += x2.hits;
    m.hitsCol += y2.hits;
    m.controlRow += y2.controlSeconds;
    m.controlCol += x2.controlSeconds;
  }
  const total = m.controlRow + m.controlCol;
  m.share = total > 0 ? m.controlRow / total : 0.5;
  return m;
}
