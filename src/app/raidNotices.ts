/**
 * Wording of the raid status notices that go to the HUD rail as toasts (docs/RAID_PRESENTATION.md, decision RR8): a wave
 * arriving, a door or side room opening, the exit opening, the marked cargo going down. Pure and read-only: the sim
 * decides, these only say it. Never text over the board (CLAUDE.md HUD rule): the world markers (render/views/RaidViews.ts)
 * draw the same events without words.
 *
 * Integrator hook (one `case` group in `MatchController`'s event-to-toast switch):
 *   `const n = raidNotice(e); return n;`
 */
import type { SimEvent } from '../sim';
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

/** The rail notice for a raid event, or null when the event has none (most are drawn in the world only). */
export function raidNotice(e: SimEvent): RaidNotice | null {
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
      return e.marked ? { text: 'MARKED CARGO DOWN', tone: 'good', ttlMs: 2200 } : null;
    default:
      return null;
  }
}
