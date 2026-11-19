/**
 * Wording of the raid status notices that go to the HUD rail as toasts (docs/RAID_PRESENTATION.md, decision RR8): a wave
 * arriving, a door or side room opening, the exit opening, the marked cargo going down. Pure and read-only: the sim
 * decides, these only say it. Never text over the board (CLAUDE.md HUD rule): the world markers (render/views/RaidViews.ts)
 * draw the same events without words.
 *
 * Integrator hook (one `case` group in `MatchController`'s event-to-toast switch):
 *   `const n = raidNotice(e); return n;`
 */
import type { RaidView, SimEvent } from '../sim';
import type { Toast } from './store';

export type RaidNotice = Pick<Toast, 'text' | 'tone'> & { ttlMs: number };

/**
 * Whether `raidWaveStarted.index` counts from 0 (the first wave is index 0) or from 1. The contract does not say, so it is
 * one constant: a test pins it, and the wording follows it.
 */
export const RAID_WAVE_INDEX_BASE: 0 | 1 = 1;

export function waveNotice(index: number, total: number): RaidNotice {
  const n = Math.min(total, Math.max(1, index + (RAID_WAVE_INDEX_BASE === 0 ? 1 : 0)));
  if (total <= 1) return { text: 'ENEMIES INCOMING', tone: 'bad', ttlMs: 2800 };
  return {
    text: n >= total ? `FINAL WAVE ${n} OF ${total}` : `WAVE ${n} OF ${total}`,
    tone: 'bad',
    ttlMs: 2800,
  };
}

/**
 * "MARKED CARGO DOWN 1/3 ✓ · NEXT: MARKED CARGO" / "... 3/3 ✓ · NEXT: REACH THE EXIT" (decision MG7): the success notice
 * with the counter and the pointer to what comes next, from the raid's view after the hit.
 */
export function cargoDownNotice(view: RaidView): RaidNotice {
  const { done, goal } = view.progress;
  const next = done >= goal ? 'REACH THE EXIT' : 'MARKED CARGO';
  return { text: `MARKED CARGO DOWN ${done}/${goal} ✓ · NEXT: ${next}`, tone: 'good', ttlMs: 3000 };
}

/**
 * One blast can take two marked crates in the same tick: only the LAST marked `cargoDestroyed` of a batch gets the
 * notice (it already carries the final count), so the rail never shows the same line twice (decision MG7).
 */
export function supersededCargoNotice(e: SimEvent, batch: readonly SimEvent[]): boolean {
  if (e.type !== 'cargoDestroyed' || !e.marked) return false;
  const at = batch.indexOf(e);
  return at >= 0 && batch.slice(at + 1).some((o) => o.type === 'cargoDestroyed' && o.marked);
}

/**
 * The rail notice for a raid event, or null when the event has none (most are drawn in the world only). With the raid's
 * view (the HUD passes it) the marked-cargo notice carries the counter and the next step.
 */
export function raidNotice(e: SimEvent, view: RaidView | null = null): RaidNotice | null {
  switch (e.type) {
    case 'raidWaveStarted':
      return waveNotice(e.index, e.total);
    case 'raidDoorOpened':
      return { text: 'A DOOR OPENED', tone: 'good', ttlMs: 2400 };
    case 'raidRoomOpened':
      return { text: 'SIDE ROOM OPEN', tone: 'good', ttlMs: 2400 };
    case 'raidExtractionOpened':
      return { text: 'EXIT OPEN: GET OUT!', tone: 'good', ttlMs: 3400 };
    case 'cargoDestroyed':
      if (!e.marked) return null;
      return view ? cargoDownNotice(view) : { text: 'MARKED CARGO DOWN', tone: 'good', ttlMs: 2200 };
    default:
      return null;
  }
}
