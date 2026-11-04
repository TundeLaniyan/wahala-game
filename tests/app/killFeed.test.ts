/**
 * The kill feed (decision HC1): the sentences, the cause words, assists, newest-first ordering, the four-line cap,
 * expiry, and the throttle that keeps a 16-32 fighter City Rumble readable (the local player's kills, deaths and
 * assists always show; everybody else's are low priority). Also: a shield that absorbs a hit is not a death, so it
 * produces no elimination line (decision HC2).
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim';
import type { EliminationCause, GameState } from '../../src/sim';
import {
  KILL_CAUSE_WORD,
  KILL_FEED_FRESH_TICKS,
  KILL_FEED_MAX,
  KILL_FEED_OTHER_GAP_MS,
  KILL_FEED_OTHER_TTL_MS,
  KILL_FEED_TTL_MS,
  assistLine,
  eliminationLine,
  expireKillLines,
  isCrowded,
  killCause,
  newKillLines,
  pushKillLines,
} from '../../src/app/killFeed';
import type { KillFeed } from '../../src/app/killFeed';
import {
  protectionNotice,
  quickHandsResumedNotice,
  quickHandsStoredNotice,
} from '../../src/app/combatNotices';
import { RUMBLE_FIXTURE, addGenerator, eventsOf, put, run } from '../helpers';

function game(n = 8, mode: 'survival' | 'deathmatch' | 'team' = 'survival'): GameState {
  const s = createGame({
    seed: 3,
    arenaId: RUMBLE_FIXTURE,
    players: Array.from({ length: n }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller' as const,
      isBot: i > 0,
    })),
    settings: { game: mode, stageHazards: false },
  });
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  s.tick = 1000;
  return s;
}

/** Marks `victim` eliminated this tick, credited to `by` (null = nobody). */
function down(s: GameState, victim: number, by: number | null, cause?: EliminationCause): void {
  const v = s.players[victim]!;
  v.alive = false;
  v.eliminatedTick = s.tick;
  v.eliminatedBy = by;
  v.elimination = cause ?? { kind: 'flame', ownerId: by ?? victim, eventId: 1 };
}

const textOf = (s: GameState, victim: number): string => eliminationLine(s, s.players[victim]!, 0).text;

describe('kill feed sentences', () => {
  it('the local player eliminates, is eliminated, or watches two others', () => {
    const s = game();
    down(s, 3, 0);
    expect(textOf(s, 3)).toBe('YOU ELIMINATED P3');
    expect(eliminationLine(s, s.players[3]!, 0)).toMatchObject({ kind: 'kill', mine: true, cause: 'blast' });

    down(s, 0, 4);
    expect(textOf(s, 0)).toBe('P4 ELIMINATED YOU');
    expect(eliminationLine(s, s.players[0]!, 0)).toMatchObject({ kind: 'death', mine: true });

    down(s, 5, 6);
    expect(textOf(s, 5)).toBe('P6 ELIMINATED P5');
    expect(eliminationLine(s, s.players[5]!, 0)).toMatchObject({ kind: 'other', mine: false });
  });

  it('nobody credited: the sentence names the victim only, the cause says what happened', () => {
    const s = game();
    down(s, 2, null, { kind: 'crush', eventId: 1 });
    expect(textOf(s, 2)).toBe('P2 WAS ELIMINATED');
    down(s, 0, null, { kind: 'crush', eventId: 1 });
    expect(textOf(s, 0)).toBe('YOU WERE ELIMINATED');
  });

  it('every cause has its word', () => {
    const s = game(8, 'team');
    s.players[1]!.team = 0;
    s.players[2]!.team = 0;
    const cases: [EliminationCause, number | null, string][] = [
      [{ kind: 'flame', ownerId: 4, eventId: 1 }, 4, 'BLAST'],
      [{ kind: 'vehicle', ownerId: 4, vehicleKind: 'danfo', eventId: 1 }, 4, 'VEHICLE'],
      [{ kind: 'crush', eventId: 1 }, null, 'CRUSH'],
      [{ kind: 'hazard', style: 'sweep', eventId: 1 } as unknown as EliminationCause, null, 'HAZARD'],
      [{ kind: 'crowd', eventId: 1 }, null, 'CROWD'],
      [{ kind: 'suddenDeath', eventId: 1 }, null, 'SUDDEN DEATH'],
      [{ kind: 'flame', ownerId: 1, eventId: 1 }, null, 'OWN BLAST'], // victim 1 blew itself up
      [{ kind: 'flame', ownerId: 2, eventId: 1 }, null, 'FRIENDLY FIRE'], // a teammate's blast, nobody credited
      [{ kind: 'spectator', ownerId: 5, eventId: 1 }, null, 'SIDELINE'],
    ];
    for (const [cause, by, word] of cases) {
      down(s, 1, by, cause);
      expect(eliminationLine(s, s.players[1]!, 0).causeWord, word).toBe(word);
    }
    expect(Object.values(KILL_CAUSE_WORD)).toHaveLength(9);
    expect(killCause(s, s.players[1]!)).toBe('sideline');
  });

  it('"ASSIST ON <name>" is a local-only line without a cause', () => {
    const s = game();
    down(s, 3, 4);
    const a = assistLine(s.players[3]!);
    expect(a).toMatchObject({
      text: 'ASSIST ON P3',
      kind: 'assist',
      mine: true,
      cause: null,
      causeWord: null,
    });
  });
});

describe('what enters the feed', () => {
  it('only fresh, unseen eliminations, oldest first; the assist follows its kill', () => {
    const s = game();
    down(s, 3, 0);
    s.tick += 5;
    down(s, 4, 5);
    const old = s.players[6]!;
    down(s, 6, 5);
    old.eliminatedTick = s.tick - KILL_FEED_FRESH_TICKS - 1; // long ago: never listed
    const lines = newKillLines(s, 0, new Set(), [4]);
    expect(lines.map((l) => l.text)).toEqual(['YOU ELIMINATED P3', 'P5 ELIMINATED P4', 'ASSIST ON P4']);
    const seen = new Set(lines.map((l) => l.key));
    expect(newKillLines(s, 0, seen, [4])).toEqual([]); // already listed
  });
});

describe('feed ordering, cap, expiry and throttle', () => {
  const mk = (n: number, mine: boolean) => ({
    key: `k${n}`,
    kind: mine ? ('kill' as const) : ('other' as const),
    text: `L${n}`,
    cause: 'blast' as const,
    causeWord: 'BLAST',
    mine,
  });

  it('newest first, at most four lines', () => {
    let feed: KillFeed = [];
    for (let i = 0; i < 6; i++) feed = pushKillLines(feed, [mk(i, true)], i * 100, false);
    expect(feed).toHaveLength(KILL_FEED_MAX);
    expect(feed.map((l) => l.text)).toEqual(['L5', 'L4', 'L3', 'L2']);
  });

  it('lines expire: the local player is told for about 4 s, others for less', () => {
    let feed: KillFeed = [];
    feed = pushKillLines(feed, [mk(1, true), mk(2, false)], 0, false);
    expect(feed).toHaveLength(2);
    expect(KILL_FEED_TTL_MS).toBe(4000);
    expect(KILL_FEED_OTHER_TTL_MS).toBeLessThan(KILL_FEED_TTL_MS);
    expect(expireKillLines(feed, KILL_FEED_OTHER_TTL_MS - 1)).toHaveLength(2);
    expect(expireKillLines(feed, KILL_FEED_OTHER_TTL_MS).map((l) => l.text)).toEqual(['L1']);
    expect(expireKillLines(feed, KILL_FEED_TTL_MS)).toEqual([]);
    const same = expireKillLines(feed, 10);
    expect(same).toBe(feed); // nothing expired: the same array, so the store is not touched
  });

  it('crowded: another fighters lines are let in one per gap; the local player is never throttled', () => {
    let feed: KillFeed = [];
    feed = pushKillLines(feed, [mk(1, false), mk(2, false), mk(3, false)], 0, true);
    expect(feed.map((l) => l.text)).toEqual(['L1']); // the burst lets one through
    feed = pushKillLines(feed, [mk(4, false)], KILL_FEED_OTHER_GAP_MS - 1, true);
    expect(feed.map((l) => l.text)).toEqual(['L1']);
    feed = pushKillLines(feed, [mk(5, false)], KILL_FEED_OTHER_GAP_MS, true);
    expect(feed.map((l) => l.text)).toEqual(['L5', 'L1']);
    feed = pushKillLines(feed, [mk(6, true), mk(7, true)], KILL_FEED_OTHER_GAP_MS + 1, true);
    expect(feed.map((l) => l.text)).toEqual(['L7', 'L6', 'L5', 'L1']);
  });

  it('a standard match (few fighters) lists everything', () => {
    expect(isCrowded(game(4))).toBe(false);
    expect(isCrowded(game(5))).toBe(true);
    const feed = pushKillLines([], [mk(1, false), mk(2, false)], 0, false);
    expect(feed).toHaveLength(2);
  });

  it('a full feed gives way to the local player: the oldest other line goes first', () => {
    let feed: KillFeed = [];
    feed = pushKillLines(feed, [mk(1, true), mk(2, false), mk(3, false), mk(4, true)], 0, false);
    expect(feed.map((l) => l.text)).toEqual(['L4', 'L3', 'L2', 'L1']);
    feed = pushKillLines(feed, [mk(5, true)], 10, false);
    expect(feed.map((l) => l.text)).toEqual(['L5', 'L4', 'L3', 'L1']); // L2 (oldest other) made room
    feed = pushKillLines(feed, [mk(6, true)], 20, false);
    expect(feed.map((l) => l.text)).toEqual(['L6', 'L5', 'L4', 'L1']); // L3 went
    feed = pushKillLines(feed, [mk(7, true)], 30, false);
    expect(feed.map((l) => l.text)).toEqual(['L7', 'L6', 'L5', 'L4']); // all local: the oldest local line goes
  });

  it('a full feed of local lines drops another fighter line instead of a local one', () => {
    let feed: KillFeed = [];
    feed = pushKillLines(feed, [mk(1, true), mk(2, true), mk(3, true), mk(4, true)], 0, false);
    feed = pushKillLines(feed, [mk(5, false)], 10, false);
    expect(feed.map((l) => l.text)).toEqual(['L4', 'L3', 'L2', 'L1']);
  });

  it('the same elimination is never listed twice', () => {
    let feed: KillFeed = pushKillLines([], [mk(1, true)], 0, false);
    feed = pushKillLines(feed, [mk(1, true)], 50, false);
    expect(feed).toHaveLength(1);
  });
});

describe('a shield that absorbs a lethal hit is not a death (decision HC2)', () => {
  it('Armour used: protectionBroken, no elimination, no kill-feed line; one plate fewer', () => {
    const s = game(3);
    s.tiles = s.tiles.map((t) => (t === 2 ? 0 : t));
    s.hidden = {};
    const me = s.players[0]!;
    me.armour = 2;
    me.protectedUntil = 0;
    put(s, 0, 1, 1);
    addGenerator(s, { ownerId: 1, x: 1, y: 1, timer: 1, range: 2 });
    const events = run(s, 4);
    expect(eventsOf(events, 'protectionBroken').find((e) => e.playerId === 0)?.layer).toBe('armour');
    expect(eventsOf(events, 'playerEliminated').filter((e) => e.playerId === 0)).toHaveLength(0);
    expect(me.alive).toBe(true);
    expect(me.armour).toBe(1);
    expect(newKillLines(s, 0, new Set())).toEqual([]);
    expect(protectionNotice('armour', me.armour).text).toBe('ARMOUR USED · 1 LEFT');
  });

  it('notice wording', () => {
    expect(protectionNotice('okada', 0).text).toBe('OKADA SAVED YOU');
    expect(protectionNotice('armour', 0).text).toBe('ARMOUR USED');
    expect(quickHandsStoredNotice(11 * 60 - 3).text).toBe('QUICK HANDS STORED · 11s');
    expect(quickHandsResumedNotice(9 * 60).text).toBe('QUICK HANDS RESUMED · 9s');
  });
});
