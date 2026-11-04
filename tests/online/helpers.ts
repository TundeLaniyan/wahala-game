import { memoryStore } from '../../src/platform';
import { createMockOnline, manualClock } from '../../src/online/mock';
import type { MockOnline, MockOptions } from '../../src/online/mock';
import type { Result } from '../../src/online/result';
import { unwrap } from '../../src/online/result';
import type { Room } from '../../src/online/types';

export function mock(opts: MockOptions = {}) {
  const clock = manualClock();
  const store = memoryStore();
  const progressStore = memoryStore();
  const online = createMockOnline({ clock, seed: 7, store, progressStore, ...opts });
  /** Moves the clock and pumps the mock in `stepMs` slices (so scripted players act in order). */
  const wait = (ms: number, stepMs = 100): void => {
    for (let t = 0; t < ms; t += stepMs) {
      clock.advance(Math.min(stepMs, ms - t));
      online.control.pump();
    }
  };
  return { online, clock, store, progressStore, wait };
}

export const val = <T>(r: Result<T>): T => unwrap(r);

/** Signs in and plays a Quick Match up to the point where the room's ready check is running. */
export async function quickMatchRoom(
  m: ReturnType<typeof mock>,
  game: 'classic' | 'team' | 'deathmatch' | 'survival' = 'classic',
  arenaId = 'danfoBusPark',
): Promise<Room> {
  const o: MockOnline = m.online;
  val(await o.accounts.signInGuest());
  const t = val(await o.matchmaking.enqueue({ game, arenaId }));
  m.wait(2200);
  const status = val(await o.matchmaking.status(t.ticketId));
  return val(await o.lobbies.get(status.roomId!));
}
