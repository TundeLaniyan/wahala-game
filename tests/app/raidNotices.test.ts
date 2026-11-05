import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim';
import { RAID_WAVE_INDEX_BASE, raidNotice, waveNotice } from '../../src/app/raidNotices';

describe('raid rail notices', () => {
  it('a wave is announced as a rail notice (event only), the last one says FINAL', () => {
    // the sim counts waves from 1 (`raidWaveStarted.index = main.indexOf(w) + 1`, src/sim/raid/waves.ts)
    expect(RAID_WAVE_INDEX_BASE).toBe(1);
    expect(waveNotice(1, 3).text).toBe('WAVE 1 OF 3');
    expect(waveNotice(2, 3).text).toBe('WAVE 2 OF 3');
    expect(waveNotice(3, 3).text).toBe('FINAL WAVE 3 OF 3');
    expect(waveNotice(1, 1).text).toBe('ENEMIES INCOMING');
    expect(waveNotice(9, 3).text).toBe('FINAL WAVE 3 OF 3'); // never past the total
    expect(raidNotice({ type: 'raidWaveStarted', index: 1, total: 3 })?.tone).toBe('bad');
  });

  it('doors, rooms, the exit and the marked cargo have a notice; plain cargo and other events do not', () => {
    expect(raidNotice({ type: 'raidDoorOpened', id: 'd', x: 1, y: 1 })?.text).toBe('A DOOR OPENED');
    expect(raidNotice({ type: 'raidRoomOpened', id: 'r' })?.text).toBe('SIDE ROOM OPEN');
    expect(raidNotice({ type: 'raidExtractionOpened', x: 1, y: 1 })?.text).toMatch(/EXIT OPEN/);
    const base = { type: 'cargoDestroyed', id: 'c', kind: 'cargo', x: 1, y: 1, byId: 0 } as const;
    expect(raidNotice({ ...base, marked: true })?.text).toBe('MARKED CARGO DOWN');
    expect(raidNotice({ ...base, marked: false })).toBeNull();
    const other: SimEvent = { type: 'cargoHit', id: 'c', x: 1, y: 1, hpAfter: 1, maxHp: 2, byId: 0 };
    expect(raidNotice(other)).toBeNull();
  });

  it('every notice is short enough for the rail', () => {
    const events: SimEvent[] = [
      { type: 'raidWaveStarted', index: 2, total: 3 },
      { type: 'raidDoorOpened', id: 'd', x: 1, y: 1 },
      { type: 'raidRoomOpened', id: 'r' },
      { type: 'raidExtractionOpened', x: 1, y: 1 },
      { type: 'cargoDestroyed', id: 'c', kind: 'cargo', x: 1, y: 1, marked: true, byId: 0 },
    ];
    for (const e of events) expect(raidNotice(e)!.text.length).toBeLessThanOrEqual(22);
  });
});
