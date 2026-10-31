/**
 * Rumble draw resolution and sudden death (decision SD1): kill totals decide a timeout and a simultaneous
 * final contest; equal totals play a sudden-death round (title card, then full-area blasts after 60 / 30 / 15
 * seconds that the existing Okada / Armour layers absorb one each); a draw only when the sequence is spent.
 * Classic is unchanged.
 */
import { describe, expect, it } from 'vitest';
import { CITY_RUMBLE_ID, createGame, tick } from '../src/sim';
import type { GameKind, GameState, MatchSettings } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addGenerator, eventsOf, put, run, runUntil } from './helpers';

function match(
  game: GameKind,
  n: number,
  settings: Partial<MatchSettings> = {},
  arenaId = CITY_RUMBLE_ID,
): GameState {
  const state = createGame({
    seed: 7,
    arenaId,
    players: Array.from({ length: n }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller',
      isBot: false,
    })),
    settings: { game, stageHazards: false, ...settings },
  });
  state.tiles = state.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  state.hidden = {};
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  // scenarios decide the end themselves: no closing city, no endgame traps
  state.crush = null;
  state.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
  return state;
}

const setKills = (s: GameState, kills: number[]): void =>
  kills.forEach((k, i) => (s.players[i]!.stats.kills = k));
const out = (s: GameState, id: number): void => {
  const p = s.players[id]!;
  p.alive = false;
  p.eliminatedTick = 1;
};

/** Ticks the clock to full time and returns that tick's events. */
function timeUp(s: GameState) {
  s.match.playTicks = s.config.match.durationTicks - 1;
  return run(s, 1);
}

/** Time up with the given kills; returns the events. */
function tiedFinish(game: GameKind, kills: number[], settings: Partial<MatchSettings> = {}) {
  const s = match(game, kills.length, settings);
  setKills(s, kills);
  const events = timeUp(s);
  return { s, events };
}

/** Plays out the title card and returns the state at the first countdown tick. */
function toCountdown(s: GameState): void {
  runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
}

/** Runs to the next blast and returns its events. */
function toBlast(s: GameState) {
  return runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 4000);
}

function sudden(kills = [2, 2]) {
  const { s } = tiedFinish('survival', kills);
  toCountdown(s);
  return s;
}

/** Four open tiles in a row, for staging a fight inside the area. */
function openRow(s: GameState): { x: number; y: number } {
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width - 4; x++)
      if ([0, 1, 2, 3].every((d) => s.tiles[y * s.width + x + d] === Tile.Empty)) return { x, y };
  throw new Error('no open row');
}

describe('timeout: credited kills decide', () => {
  it('a unique highest-kill player wins immediately (Survival, only the standing are eligible)', () => {
    const s = match('survival', 4);
    setKills(s, [1, 3, 2, 9]);
    out(s, 3); // the leader on kills already fell: not eligible
    const events = timeUp(s);
    expect(s.match.phase).toBe('ended');
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 1, decidedBy: 'timeoutKills' });
    expect(eventsOf(events, 'matchEnded')).toHaveLength(1);
    expect(s.match.suddenDeath).toBeNull();
  });

  it('the winner follows the kills, never the player id (mirrored totals, mirrored winner)', () => {
    const a = tiedFinish('survival', [3, 1, 1]).s;
    const b = tiedFinish('survival', [1, 1, 3]).s;
    expect(a.match.result).toMatchObject({ kind: 'win', winnerId: 0 });
    expect(b.match.result).toMatchObject({ kind: 'win', winnerId: 2 });
  });

  it('a tied top starts sudden death for exactly the tied fighters; the others stand down', () => {
    const { s, events } = tiedFinish('survival', [2, 2, 1]);
    expect(s.match.phase).toBe('playing');
    expect(s.match.result).toBeNull();
    const sd = s.match.suddenDeath!;
    expect(sd.cause).toBe('timeout');
    expect(sd.stage).toBe('transition');
    expect(sd.contenders).toEqual([
      { playerId: 0, kills: 2 },
      { playerId: 1, kills: 2 },
    ]);
    const started = eventsOf(events, 'suddenDeathStarted');
    expect(started).toHaveLength(1);
    expect(started[0]!.contenders.map((c) => c.kills)).toEqual([2, 2]);
    expect(s.players[2]!.alive).toBe(false);
    expect(s.players[2]!.stats.deaths).toBe(0); // standing down is not a death
    expect(s.players[2]!.elimination).toMatchObject({ kind: 'suddenDeath' });
    expect(s.players.slice(0, 2).every((p) => p.alive)).toBe(true);
  });

  it('three-way tie at the top: all three contend', () => {
    const { s } = tiedFinish('survival', [4, 4, 4, 0]);
    expect(s.match.suddenDeath!.contenders.map((c) => c.playerId)).toEqual([0, 1, 2]);
    expect(s.players[3]!.alive).toBe(false);
  });

  it('Deathmatch: the unique top wins; a tie (even on equal deaths) plays sudden death, fallen leaders return', () => {
    const win = match('deathmatch', 3);
    setKills(win, [1, 5, 2]);
    timeUp(win);
    expect(win.match.result).toEqual({ kind: 'win', winnerId: 1, decidedBy: 'timeoutKills' });

    const { s } = tiedFinish('deathmatch', [3, 3, 1]);
    expect(s.match.result).toBeNull();
    expect(s.match.suddenDeath!.contenders.map((c) => c.playerId)).toEqual([0, 1]);

    const down = match('deathmatch', 3);
    setKills(down, [3, 3, 1]);
    out(down, 1);
    down.players[1]!.respawnAt = down.tick + 100;
    timeUp(down);
    expect(down.players[1]!.alive).toBe(true); // brought back for the round
    expect(down.players[2]!.alive).toBe(false);
    expect(down.players[2]!.respawnAt).toBeNull();
  });

  it('Team Rumble: team kills add up; a level lead brings both teams into sudden death', () => {
    const win = match('team', 4);
    const side = (t: number) => win.players.filter((p) => p.team === t);
    side(0)[0]!.stats.kills = 2;
    side(1)[0]!.stats.kills = 1;
    timeUp(win);
    expect(win.match.result).toEqual({ kind: 'teamWin', team: 0, decidedBy: 'timeoutKills' });

    const tie = match('team', 4);
    const t = (n: number) => tie.players.filter((p) => p.team === n);
    t(0)[0]!.stats.kills = 2;
    t(1)[0]!.stats.kills = 1;
    t(1)[1]!.stats.kills = 1;
    timeUp(tie);
    expect(tie.match.result).toBeNull();
    expect(tie.match.suddenDeath!.contenders).toHaveLength(4);
  });
});

describe('simultaneous final elimination: kills of those involved decide', () => {
  /** Players 0 and 1 stand together and a dead rival's generator takes both down in one blast. */
  function bothFall(kills: [number, number]) {
    const s = match('survival', 3);
    out(s, 2);
    const { x, y } = openRow(s);
    put(s, 0, x, y);
    put(s, 1, x + 1, y);
    setKills(s, [kills[0], kills[1], 0]);
    addGenerator(s, { ownerId: 2, x, y, timer: 1, range: 3 });
    const events = run(s, 3);
    return { s, events };
  }

  it('the unique highest kill total among the fallen wins', () => {
    const { s } = bothFall([3, 1]);
    expect(s.players[0]!.alive || s.players[1]!.alive).toBe(false);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'simultaneousKills' });
    expect(bothFall([1, 4]).s.match.result).toEqual({
      kind: 'win',
      winnerId: 1,
      decidedBy: 'simultaneousKills',
    });
  });

  it('equal totals bring the tied fighters back for sudden death, never a draw or an id-picked winner', () => {
    const { s, events } = bothFall([2, 2]);
    expect(s.match.phase).toBe('playing');
    expect(s.match.result).toBeNull();
    expect(s.match.suddenDeath).toMatchObject({ cause: 'simultaneous', stage: 'transition' });
    expect(s.players[0]!.alive && s.players[1]!.alive).toBe(true);
    expect(eventsOf(events, 'suddenDeathStarted')).toHaveLength(1);
    expect(eventsOf(events, 'matchEnded')).toHaveLength(0);
  });
});

describe('sudden death: transition and countdown', () => {
  it('seats the contenders inside the compacted core, apart, with input held and protection on', () => {
    const { s } = tiedFinish('survival', [2, 2]);
    const sd = s.match.suddenDeath!;
    expect(sd.transitionEndTick - s.tick).toBe(s.config.suddenDeath.transitionTicks);
    const a = s.players[0]!;
    const b = s.players[1]!;
    for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(sd.area.x0);
      expect(p.x).toBeLessThanOrEqual(sd.area.x1);
      expect(p.y).toBeGreaterThanOrEqual(sd.area.y0);
      expect(p.y).toBeLessThanOrEqual(sd.area.y1);
      expect(s.tiles[p.y * s.width + p.x]).toBe(Tile.Empty);
      expect(p.protectedUntil).toBeGreaterThan(sd.transitionEndTick);
    }
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(8);
    // movement is held during the title card
    const before = { x: a.x, y: a.y };
    run(s, 30, { 0: { move: 'right', place: true } });
    expect({ x: a.x, y: a.y }).toEqual(before);
    expect(s.generators).toHaveLength(0);
  });

  it('the countdown starts after the title card with the first blast 60 s away', () => {
    const { s } = tiedFinish('survival', [2, 2]);
    const events = runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    const cd = eventsOf(events, 'suddenDeathCountdown')[0]!;
    expect(s.match.suddenDeath!.stage).toBe('countdown');
    expect(s.tick).toBe(s.match.suddenDeath!.transitionEndTick);
    expect(cd).toMatchObject({ blast: 1, of: 3 });
    expect(cd.blastTick - s.tick).toBe(60 * 60);
    // input works again
    const p = s.players[0]!;
    run(s, 1, { 0: { place: true } });
    expect(s.generators.some((g) => g.ownerId === p.id)).toBe(true);
  });
});

describe('sudden death: the full-area blast', () => {
  it('drops after 60 s, eliminates an unprotected contender and spares one protected by Armour', () => {
    const s = sudden();
    s.players[1]!.armour = 1;
    const events = toBlast(s);
    expect(s.tick - s.match.suddenDeath!.startedTick).toBe(240 + 3600);
    const blast = eventsOf(events, 'suddenDeathBlast')[0]!;
    expect(blast).toMatchObject({ blast: 1, of: 3, survivors: [1], eliminated: [0] });
    expect(s.players[1]!.armour).toBe(0); // the layer was spent
    expect(s.players[0]!.elimination).toMatchObject({ kind: 'suddenDeath' });
    expect(s.players[0]!.eliminatedBy).toBeNull(); // the blast credits nobody
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 1, decidedBy: 'suddenDeath' });
  });

  it('is never shrunk: it reaches a contender across the board and through spawn protection', () => {
    const s = sudden();
    const far = s.players[0]!;
    far.protectedUntil = Infinity;
    s.players[1]!.armour = 1;
    toBlast(s);
    expect(far.alive).toBe(false);
    expect(s.match.result).toMatchObject({ kind: 'win', winnerId: 1 });
  });

  it('spends the Okada first, then Armour, one layer per blast; 30 s follow-up decides', () => {
    const s = sudden();
    const [a, b] = [s.players[0]!, s.players[1]!];
    a.mounted = true;
    a.armour = 1;
    b.mounted = true;
    const first = toBlast(s);
    expect(
      eventsOf(first, 'okadaBroken')
        .map((e) => e.playerId)
        .sort(),
    ).toEqual([0, 1]);
    expect(eventsOf(first, 'suddenDeathBlast')[0]).toMatchObject({ survivors: [0, 1], eliminated: [] });
    expect(a.mounted).toBe(false);
    expect(a.armour).toBe(1); // one layer per blast
    expect(s.match.result).toBeNull();
    const next = eventsOf(first, 'suddenDeathCountdown').find((e) => e.blast === 2)!;
    expect(next.blastTick - s.tick).toBe(30 * 60);

    const second = toBlast(s);
    expect(eventsOf(second, 'suddenDeathBlast')[0]).toMatchObject({
      blast: 2,
      survivors: [0],
      eliminated: [1],
    });
    expect(a.armour).toBe(0);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'suddenDeath' });
  });

  it('a 15 s third blast decides when protection runs out between the contenders', () => {
    const s = sudden();
    s.players[0]!.armour = 3;
    s.players[1]!.armour = 2;
    toBlast(s);
    const second = toBlast(s);
    const next = eventsOf(second, 'suddenDeathCountdown').find((e) => e.blast === 3)!;
    expect(next.blastTick - s.tick).toBe(15 * 60);
    expect(s.match.result).toBeNull();
    const third = toBlast(s);
    expect(eventsOf(third, 'suddenDeathBlast')[0]).toMatchObject({
      blast: 3,
      survivors: [0],
      eliminated: [1],
    });
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'suddenDeath' });
  });

  it('delays are 60, 30 and 15 seconds in order, and the sequence is exactly three blasts', () => {
    const s = sudden();
    s.players[0]!.armour = 9;
    s.players[1]!.armour = 9;
    const gaps: number[] = [];
    let last = s.match.suddenDeath!.transitionEndTick;
    for (let i = 0; i < 3; i++) {
      toBlast(s);
      gaps.push(s.tick - last);
      last = s.tick;
    }
    expect(gaps).toEqual([3600, 1800, 900]);
  });

  it('a genuinely exhausted sequence (both still standing after the last blast) is the only draw', () => {
    const s = sudden();
    s.players[0]!.armour = 9;
    s.players[1]!.armour = 9;
    toBlast(s);
    toBlast(s);
    expect(s.match.phase).toBe('playing');
    const events = toBlast(s);
    expect(s.match.phase).toBe('ended');
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'suddenDeathExhausted' });
    expect(eventsOf(events, 'matchEnded')).toHaveLength(1);
    expect(s.players[0]!.alive && s.players[1]!.alive).toBe(true);
  });

  it('nobody protected: the fallen are compared on kills (a draw only when those are level too)', () => {
    const s = sudden();
    toBlast(s);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'suddenDeathMutual' });

    const t = sudden();
    t.players[0]!.stats.kills++; // earned during the round
    toBlast(t);
    expect(t.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'simultaneousKills' });
  });

  it('a fight inside the area ends the round before any blast', () => {
    const s = sudden();
    const [a, b] = [s.players[0]!, s.players[1]!];
    run(s, s.config.protection.spawnProtectionTicks + 60); // the settle window is over
    const { x, y } = openRow(s);
    put(s, 0, x, y);
    put(s, 1, x + 1, y);
    addGenerator(s, { ownerId: 0, x: x + 1, y, timer: 1, range: 2 });
    run(s, 3);
    expect(a.alive).toBe(false); // own blast reaches both; protection absent
    expect(b.alive).toBe(false);
    expect(s.match.phase).toBe('ended');
    expect(s.match.suddenDeath!.blastsFired).toBe(0);
  });

  it('a kill during the round wins outright', () => {
    const s = sudden();
    run(s, 120);
    const { x, y } = openRow(s);
    put(s, 0, x, y);
    put(s, 1, x + 3, y);
    addGenerator(s, { ownerId: 0, x: x + 3, y, timer: 1, range: 1 });
    run(s, 3);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'suddenDeath' });
  });

  it('Team Rumble: the surviving side wins as a team', () => {
    const s = match('team', 4);
    for (const p of s.players) p.stats.kills = 1;
    timeUp(s);
    expect(s.match.suddenDeath!.contenders).toHaveLength(4);
    toCountdown(s);
    for (const p of s.players) if (p.team === 1) p.armour = 1;
    toBlast(s);
    expect(s.match.result).toEqual({ kind: 'teamWin', team: 1, decidedBy: 'suddenDeath' });
  });

  it('is deterministic: the same scenario ends the same way every time', () => {
    const play = () => {
      const s = sudden([2, 2, 2].slice(0, 3));
      s.players[2]!.armour = 1;
      toBlast(s);
      return JSON.stringify([s.tick, s.match.result, s.players.map((p) => [p.x, p.y, p.alive])]);
    };
    expect(play()).toBe(play());
  });
});

describe('Classic is unchanged', () => {
  it('a timeout with several standing is a draw whatever their kills', () => {
    const s = match('classic', 3, {}, 'danfoBusPark');
    setKills(s, [5, 0, 0]);
    s.match.playTicks = s.config.match.durationTicks - 1;
    run(s, 1);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'timeout' });
    expect(s.match.suddenDeath).toBeNull();
  });

  it('everybody falling together is a draw whatever their kills', () => {
    const s = match('classic', 3, {}, 'danfoBusPark');
    out(s, 2);
    setKills(s, [4, 1, 0]);
    const { x, y } = openRow(s);
    put(s, 0, x, y);
    put(s, 1, x + 1, y);
    addGenerator(s, { ownerId: 2, x, y, timer: 1, range: 3 });
    run(s, 3);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
    expect(s.match.suddenDeath).toBeNull();
  });

  it('last standing still wins plainly (no decidedBy)', () => {
    const s = match('classic', 2, {}, 'danfoBusPark');
    out(s, 1);
    run(s, 1);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0 });
  });
});

describe('the tick function stays pure', () => {
  it('tick() on an ended sudden-death match changes nothing but time', () => {
    const s = sudden();
    s.players[1]!.armour = 1;
    toBlast(s);
    const result = s.match.result;
    tick(s);
    expect(s.match.result).toBe(result);
  });
});
