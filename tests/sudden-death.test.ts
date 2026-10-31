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
import { buildHud } from '../src/app/hud';
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
  it('every player counts, the fallen too: a dead player with the highest kills wins at time up (Survival)', () => {
    const s = match('survival', 4);
    setKills(s, [1, 3, 2, 9]);
    out(s, 3); // the leader on kills already fell: still counted
    const events = timeUp(s);
    expect(s.match.phase).toBe('ended');
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 3, decidedBy: 'timeoutKills' });
    expect(eventsOf(events, 'matchEnded')).toHaveLength(1);
    expect(s.match.suddenDeath).toBeNull();
  });

  it('a clear leader among the standing wins immediately', () => {
    const s = match('survival', 3);
    setKills(s, [1, 3, 2]);
    timeUp(s);
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 1, decidedBy: 'timeoutKills' });
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

  it('only the tied leaders contend, and a fallen leader is brought back for the round', () => {
    const s = match('survival', 4);
    setKills(s, [2, 5, 5, 1]);
    out(s, 1); // fell earlier with the joint-highest total
    timeUp(s);
    const sd = s.match.suddenDeath!;
    expect(sd.contenders).toEqual([
      { playerId: 1, kills: 5 },
      { playerId: 2, kills: 5 },
    ]);
    expect(s.players[1]!.alive).toBe(true); // revived into the compacted arena
    expect(s.players[0]!.alive).toBe(false); // standing, but fewer kills: not a contender
    expect(s.players[3]!.alive).toBe(false);
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

describe("a blast takes down everyone still active: every player's kills decide", () => {
  /** Players 0 and 1 stand together and a dead rival's generator takes both down in one blast. */
  function bothFall(kills: [number, number, number]) {
    const s = match('survival', 3);
    out(s, 2);
    const { x, y } = openRow(s);
    put(s, 0, x, y);
    put(s, 1, x + 1, y);
    setKills(s, kills);
    addGenerator(s, { ownerId: 2, x, y, timer: 1, range: 3 });
    const events = run(s, 3);
    return { s, events };
  }

  it('the unique highest total among ALL players wins, including those who just fell', () => {
    // the dead owner of the blast is credited two eliminations (kills 1 -> 3) and leads
    const a = bothFall([2, 2, 1]).s;
    expect(a.match.result).toEqual({ kind: 'win', winnerId: 2, decidedBy: 'simultaneousKills' });
    const b = bothFall([6, 1, 0]).s;
    expect(b.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'simultaneousKills' });
  });

  it('players tied on the highest total (a fallen one included) are the only contenders of sudden death', () => {
    const { s, events } = bothFall([4, 1, 1]); // fighter 2 is credited both kills: 3 -> not the leader; 0 leads alone
    expect(s.match.result).toMatchObject({ winnerId: 0 });
    expect(eventsOf(events, 'suddenDeathStarted')).toHaveLength(0);
    const t = bothFall([3, 3, 1]); // fighter 2 reaches 3 as well: a three-way tie
    expect(t.s.match.result).toBeNull();
    expect(t.s.match.suddenDeath).toMatchObject({ cause: 'simultaneous', stage: 'transition' });
    expect(t.s.match.suddenDeath!.contenders.map((c) => c.kills)).toEqual([3, 3, 3]);
    expect(t.s.players.every((p) => p.alive)).toBe(true);
    expect(eventsOf(t.events, 'suddenDeathStarted')).toHaveLength(1);
    expect(eventsOf(t.events, 'matchEnded')).toHaveLength(0);
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
    expect(cd).toMatchObject({ blast: 1 });
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
    expect(blast).toMatchObject({ blast: 1, survivors: [1], eliminated: [0] });
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

  it('blasts come 60 s, then 30 s, then every 15 s, with no limit while protection lasts', () => {
    const s = sudden();
    s.players[0]!.armour = 5;
    s.players[1]!.armour = 5;
    const gaps: number[] = [];
    let last = s.match.suddenDeath!.transitionEndTick;
    for (let i = 0; i < 5; i++) {
      toBlast(s);
      gaps.push(s.tick - last);
      last = s.tick;
      expect(s.match.phase).toBe('playing');
    }
    expect(gaps).toEqual([3600, 1800, 900, 900, 900]); // a fourth and a fifth blast follow the third
    toBlast(s); // both are out of protection now
    expect(s.match.phase).toBe('ended');
  });

  it('one layer per blast: three layers survive three blasts and fall to the fourth', () => {
    const s = sudden();
    s.players[0]!.armour = 2;
    s.players[0]!.mounted = true;
    s.players[1]!.armour = 2;
    s.players[1]!.mounted = true;
    for (let i = 1; i <= 3; i++) {
      toBlast(s);
      expect(s.players.every((p) => p.alive)).toBe(true);
      expect(s.players[0]!.armour + (s.players[0]!.mounted ? 1 : 0)).toBe(3 - i);
    }
    toBlast(s);
    expect(s.players.every((p) => !p.alive)).toBe(true);
  });

  it('a draw only when the sequence is exhausted: the blast takes the last protection of every contender', () => {
    const s = sudden();
    s.players[0]!.armour = 3;
    s.players[1]!.armour = 3;
    toBlast(s);
    toBlast(s);
    expect(s.match.phase).toBe('playing');
    expect(s.match.result).toBeNull();
    const last = toBlast(s); // third blast: both on zero layers and still standing
    expect(s.match.phase).toBe('playing');
    const events = toBlast(s); // fourth: nothing left to absorb it
    expect(s.match.phase).toBe('ended');
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'suddenDeathExhausted' });
    expect(eventsOf(events, 'matchEnded')).toHaveLength(1);
    expect(eventsOf(last, 'matchEnded')).toHaveLength(0);
    expect(eventsOf(events, 'suddenDeathBlast')[0]).toMatchObject({ survivors: [], eliminated: [0, 1] });
  });

  it('nobody protected: the kills of every player decide; only a still-shared lead is the draw', () => {
    const s = sudden();
    toBlast(s);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'suddenDeathExhausted' });

    const t = sudden();
    t.players[0]!.stats.kills++; // earned during the round
    toBlast(t);
    expect(t.match.result).toEqual({ kind: 'win', winnerId: 0, decidedBy: 'simultaneousKills' });
  });

  it('there is no separate mutual-elimination result: contenders falling together in a fight start a new round', () => {
    const s = sudden();
    const [a, b] = [s.players[0]!, s.players[1]!];
    run(s, s.config.protection.spawnProtectionTicks + 60); // the settle window is over
    const { x, y } = openRow(s);
    put(s, 0, x, y);
    put(s, 1, x, y);
    // an uncredited closing-city tile lands on both of them in the same tick
    const index = y * s.width + x;
    s.crush = {
      order: [index],
      next: 1,
      warnAt: [0],
      nextAtTick: Infinity,
      pending: [{ index, landTick: s.tick + 1 }],
    };
    const startedBefore = s.match.suddenDeath!.startedTick;
    const events = run(s, 3);
    expect(eventsOf(events, 'matchEnded')).toHaveLength(0);
    expect(s.match.result).toBeNull();
    expect(s.match.suddenDeath!.startedTick).toBeGreaterThan(startedBefore); // a fresh round for the tied pair
    expect(s.match.suddenDeath!.stage).toBe('transition');
    expect(a.alive && b.alive).toBe(true);
    expect(JSON.stringify(s.match.result)).not.toMatch(/Mutual/);
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

describe('the sudden-death HUD keeps the kill ranking', () => {
  it('lists every player by credited kills (the fallen too), with the contenders flagged and live totals', () => {
    const s = match('survival', 4);
    setKills(s, [3, 1, 3, 0]);
    out(s, 2);
    timeUp(s);
    const hud = buildHud(s, 0, null).suddenDeath!;
    expect(hud.ranking.map((r) => [r.id, r.kills, r.contender])).toEqual([
      [0, 3, true],
      [2, 3, true],
      [1, 1, false],
      [3, 0, false],
    ]);
    expect(hud.contenders.map((c) => c.kills)).toEqual([3, 3]);
    s.players[0]!.stats.kills++; // a kill earned during the round shows at once
    expect(buildHud(s, 0, null).suddenDeath!.ranking[0]).toMatchObject({ id: 0, kills: 4 });
    expect(hud.blast).toBe(1);
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
