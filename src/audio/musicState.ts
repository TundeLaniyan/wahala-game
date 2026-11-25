/**
 * Which music variant the current game state calls for. Pure and read-only: the authoritative simulation decides, the
 * audio layer only looks (no game rules here).
 *
 *  - `suddenDeath`: a Rumble sudden-death round is on (`state.match.suddenDeath`).
 *  - `boss1..3`: a campaign boss mission that is not over. The level follows the encounter itself: the mission phase
 *    (0-2) and the blast hits the boss has already taken, whichever is further on.
 *  - otherwise `normal`.
 */
import type { GameState } from '../sim';

export type MusicVariant = 'normal' | 'suddenDeath' | 'boss1' | 'boss2' | 'boss3';

export function musicVariantFor(state: Readonly<GameState>): MusicVariant {
  if (state.match.phase === 'ended') return 'normal';
  const m = state.mission;
  if (m && m.boss.maxHits !== undefined && !m.boss.defeated && m.outcome === null) {
    const taken = Math.max(0, m.boss.maxHits - (m.boss.hp ?? m.boss.maxHits));
    const level = Math.min(3, Math.max(m.phase + 1, taken + 1));
    return level >= 3 ? 'boss3' : level === 2 ? 'boss2' : 'boss1';
  }
  if (state.match.suddenDeath) return 'suddenDeath';
  return 'normal';
}
