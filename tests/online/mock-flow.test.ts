import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../../src/online/schema';
import { mock, quickMatchRoom, val } from './helpers';

describe('mock quick match end to end', () => {
  it('queue fills with mock players, ready check, countdown, server-run match, results, progression', async () => {
    const m = mock();
    const events: ServerEvent[] = [];
    m.online.events.subscribe((e) => events.push(e));
    const room = await quickMatchRoom(m);
    expect(room.state).toBe('readyCheck');
    expect(room.members).toHaveLength(4);
    const ready = val(await m.online.lobbies.setReady(room.id, true));
    expect(ready.members.every((x) => x.ready)).toBe(false); // bots ready on their own clock
    m.wait(2000);
    const r2 = val(await m.online.lobbies.get(room.id));
    expect(r2.state).toBe('starting');
    m.wait(4000);
    const r3 = val(await m.online.lobbies.get(room.id));
    expect(r3.state).toBe('inProgress');
    const matchId = r3.matchId!;
    const done = val(m.online.control.fastForward(matchId));
    expect(done.players).toHaveLength(4);
    const update = val(await m.online.progression.settle(matchId));
    expect(update.xpGained).toBeGreaterThan(0);
    const again = val(await m.online.progression.settle(matchId));
    expect(again.duplicate).toBe(true);
    expect(events.some((e) => e.type === 'match.results')).toBe(true);
    expect(events.some((e) => e.type === 'progress.update')).toBe(true);
    const board = val(await m.online.ranking.leaderboard('global'));
    expect(board.rows.some((r) => r.isYou)).toBe(true);
  });
});
