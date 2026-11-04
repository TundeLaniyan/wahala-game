/**
 * Leaderboard model and the LOCAL MOCK board: a seeded list of fictional players plus the local player's score.
 * There is no real ranking service behind it.
 */
import { createRng, nextInt, shuffle } from '../sim';

export interface BoardScore {
  accountId: string;
  displayName: string;
  points: number;
}

export interface BoardRow extends BoardScore {
  /** 1-based, ties share the better rank. */
  rank: number;
  isYou: boolean;
}

const FIRST = ['Ada', 'Femi', 'Zainab', 'Tunde', 'Ngozi', 'Kunle', 'Amaka', 'Bode', 'Sade', 'Emeka', 'Yemi', 'Chidi', 'Halima', 'Dayo', 'Ife', 'Musa', 'Titi', 'Obi', 'Funmi', 'Segun'];
const TAG = ['Danfo', 'Keke', 'Okada', 'Spark', 'Fuse', 'Blast', 'Lagos', 'Ajah', 'Yaba', 'Eko', 'Gen', 'Volt'];

/** `size` fictional players with deterministic names and scores (descending-ish, no real person's name). */
export function seedLeaderboard(seed: number, size = 40): BoardScore[] {
  const rng = createRng(seed || 1);
  const names = new Set<string>();
  const out: BoardScore[] = [];
  const firsts = shuffle(rng, FIRST);
  for (let i = 0; out.length < size && i < size * 4; i++) {
    const name = `${firsts[i % firsts.length]}_${TAG[nextInt(rng, TAG.length)]}${nextInt(rng, 90) + 10}`;
    if (names.has(name)) continue;
    names.add(name);
    const points = Math.round(1500 * Math.pow(1 - out.length / (size + 8), 1.6)) + nextInt(rng, 40);
    out.push({ accountId: `mock-${out.length + 1}`, displayName: name, points });
  }
  return out;
}

/** Sorted rows with ranks; `you` is merged in (replacing any row with the same account id). */
export function rankBoard(scores: readonly BoardScore[], you: BoardScore | null, limit = 10): BoardRow[] {
  const all = [...scores.filter((s) => !you || s.accountId !== you.accountId), ...(you ? [you] : [])].sort(
    (a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName),
  );
  const rows: BoardRow[] = [];
  all.forEach((s, i) => {
    const prev = rows[i - 1];
    rows.push({ ...s, rank: prev && prev.points === s.points ? prev.rank : i + 1, isYou: !!you && s.accountId === you.accountId });
  });
  if (limit >= rows.length) return rows;
  const top = rows.slice(0, limit);
  const mine = rows.find((r) => r.isYou);
  return mine && !top.includes(mine) ? [...top.slice(0, limit - 1), mine] : top;
}
