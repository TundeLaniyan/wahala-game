/**
 * "What do I do next?" for a classic raid (decision TN4): the current objective as one plain line, the way to it (an
 * arrow and the distance in tiles) and up to two short notes (enemies, the next wave, the door that is still locked).
 * A pure function of the sim's read-only `RaidView` and the fighter's tile; it invents no rule and no number. It is shown
 * in the HUD rail (`ui/RaidGoal.tsx`), never over the board; the world markers (render/views/RaidViews.ts) point at the
 * same targets without words.
 */
import type { RaidView } from '../sim';

export type RaidVerb = 'destroy' | 'exit';

/** Eight compass points, as the arrow glyph and a spoken word ("up and right"). */
export interface RaidCue {
  /** "↗". */
  arrow: string;
  /** "UP-RIGHT" - the same thing in words (screen readers, tests). */
  word: string;
  /** Straight grid distance in tiles (|dx| + |dy|): what a walker needs on open floor; walls may add some. */
  tiles: number;
  /** "↗ 6 TILES", or "HERE" when standing on it. */
  text: string;
}

export interface RaidHud {
  verb: RaidVerb;
  /** "DESTROY", "EXIT". */
  tag: string;
  /** "MARKED CARGO", "REACH THE EXIT". */
  target: string;
  /** "2 OF 3 DOWN", null when there is no count. */
  step: string | null;
  /** The way to the nearest target; null when there is none to point at. */
  cue: RaidCue | null;
  /** At most two short notes. */
  notes: string[];
}

const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'] as const;
const WORDS = ['RIGHT', 'DOWN-RIGHT', 'DOWN', 'DOWN-LEFT', 'LEFT', 'UP-LEFT', 'UP', 'UP-RIGHT'] as const;

/** The eight-way direction from (x, y) to (tx, ty) on a grid whose y grows downwards, and the distance in tiles. */
export function raidCue(from: { x: number; y: number }, to: { x: number; y: number }): RaidCue {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const tiles = Math.abs(dx) + Math.abs(dy);
  if (tiles === 0) return { arrow: '•', word: 'HERE', tiles: 0, text: 'HERE' };
  // angle with 0 = right, positive = down (screen); eight sectors of 45 degrees centred on the compass points
  const angle = Math.atan2(dy, dx);
  const i = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  const arrow = ARROWS[i]!;
  return { arrow, word: WORDS[i]!, tiles, text: `${arrow} ${tiles} ${tiles === 1 ? 'TILE' : 'TILES'}` };
}

/** Within this many ticks the next wave is announced in the notes (10 s). */
export const WAVE_NOTE_TICKS = 600;

const nearest = <T extends { x: number; y: number }>(
  me: { x: number; y: number },
  list: readonly T[],
): T | null => {
  let best: T | null = null;
  let score = Infinity;
  for (const t of list) {
    const d = Math.abs(t.x - me.x) + Math.abs(t.y - me.y);
    if (d < score) {
      score = d;
      best = t;
    }
  }
  return best;
};

/** The guidance for this moment of the raid, or null when it is over (the outcome screen takes the stage). */
export function raidGuidance(view: RaidView | null, me: { x: number; y: number } | null): RaidHud | null {
  if (!view || view.outcome || view.stage === 'done' || view.stage === 'failed') return null;
  const notes: string[] = [];
  const enemies = view.wave.enemiesAlive;
  const secondsToWave =
    view.wave.nextInTicks !== null && view.wave.index < view.wave.total
      ? Math.ceil(view.wave.nextInTicks / 60)
      : null;
  const lockedDoor = view.doors.find((d) => d.locked && !d.optionalRoom);
  const openBonus = view.rooms.find((r) => r.opened && !r.completed);

  if (view.stage === 'extract') {
    if (enemies > 0) notes.push(`${enemies} ${enemies === 1 ? 'ENEMY' : 'ENEMIES'} ON THE BOARD`);
    if (openBonus) notes.push('BONUS ROOM OPEN');
    const open = view.extraction.open;
    return {
      verb: 'exit',
      tag: 'EXIT',
      target: open ? 'REACH THE EXIT' : 'EXIT OPENS SOON',
      step: null,
      cue: me && open ? raidCue(me, view.extraction) : null,
      notes: notes.slice(0, 2),
    };
  }

  // the cargo stage: the marked cargo still standing, nearest first
  const left = view.cargo.filter((c) => c.marked && c.state !== 'destroyed');
  const target = me ? nearest(me, left) : (left[0] ?? null);
  if (secondsToWave !== null && secondsToWave <= WAVE_NOTE_TICKS / 60)
    notes.push(`WAVE ${view.wave.index + 1} IN ${secondsToWave}s`);
  if (enemies > 0) notes.push(`${enemies} ${enemies === 1 ? 'ENEMY' : 'ENEMIES'} ON THE BOARD`);
  if (lockedDoor) notes.push(`DOOR LOCKED: ${lockedDoor.opensWhen.toUpperCase()}`);
  else if (openBonus) notes.push('BONUS ROOM OPEN');
  return {
    verb: 'destroy',
    tag: 'DESTROY',
    target: 'MARKED CARGO',
    step: `${view.progress.done} OF ${view.progress.goal} DOWN`,
    cue: target && me ? raidCue(me, target) : null,
    notes: notes.slice(0, 2),
  };
}
