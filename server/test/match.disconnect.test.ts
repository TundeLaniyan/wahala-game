/**
 * The disconnect policy at the match level (no sockets, no clocks: time is simulation ticks, 60 per second).
 * docs/CITY_RUMBLE_ONLINE.md section 8, decisions ON6-ON8:
 *  grace (the fighter stands) -> a bot plays it without pausing the match -> the human may take the SAME fighter back
 *  -> after the window the bot keeps it; personal stats count human-controlled time only.
 */
import { describe, expect, it } from 'vitest';
import { matchResultFrom } from '../../src/progression/matchResult';
import { CHARACTER_IDS } from '../../src/sim';
import type { GameState } from '../../src/sim';
import { addGenerator } from '../../tests/helpers';
import { RumbleMatch } from '../src/core/RumbleMatch';
import type { RumbleMatchOptions, SeatSpec } from '../src/core/RumbleMatch';

const GRACE_SEC = 1;
const GRACE_TICKS = GRACE_SEC * 60;

function seatList(humans: number, bots: number): SeatSpec[] {
  const out: SeatSpec[] = [];
  for (let i = 0; i < humans + bots; i++) {
    out.push({
      name: i < humans ? `Human${i}` : `BOT ${i}`,
      characterId: CHARACTER_IDS[i % CHARACTER_IDS.length]!,
      kind: i < humans ? 'human' : 'bot',
    });
  }
  return out;
}

/** A playing match with `humans` connected human seats first. */
function make(
  over: Partial<RumbleMatchOptions> & { humans?: number; bots?: number; durationSec?: number } = {},
): RumbleMatch {
  const { humans = 2, bots = 6, ...rest } = over;
  const m = new RumbleMatch({
    matchId: 'm-disconnect',
    arenaId: 'rumbleOshodi',
    game: 'deathmatch',
    durationSec: 120,
    seats: seatList(humans, bots),
    seed: 777,
    graceSeconds: GRACE_SEC,
    ...rest,
  });
  for (let i = 0; i < humans; i++) m.connect(i);
  for (let i = 0; i < 600 && m.state.match.phase !== 'playing'; i++) m.step();
  expect(m.state.match.phase).toBe('playing');
  return m;
}

const steps = (m: RumbleMatch, n: number): void => {
  for (let i = 0; i < n; i++) m.step();
};
const where = (m: RumbleMatch, seat: number): string => {
  const p = m.state.players[seat]!;
  return `${p.x},${p.y}`;
};

/** Spawn protection and every pending effect off, so a scripted blast is lethal. */
function exposed(state: GameState, ...ids: number[]): void {
  for (const id of ids) state.players[id]!.protectedUntil = 0;
}

/** A generator of `owner` that explodes on the next tick on top of `victim` (who stands still). */
function blastOn(m: RumbleMatch, owner: number, victim: number): void {
  const v = m.state.players[victim]!;
  exposed(m.state, owner, victim);
  addGenerator(m.state, { ownerId: owner, x: v.x, y: v.y, timer: 1, range: 1 });
}

describe('grace period, then a bot plays the seat', () => {
  it('stands for exactly the grace period (it may be hit), then the bot takes over, announced once', () => {
    const takeovers: number[] = [];
    const m = make({ onBotTakeover: (s) => takeovers.push(s) });
    const before = where(m, 0);
    const tickAtDrop = m.state.tick;
    m.disconnect(0);
    expect(m.controlOf(0)).toBe('absent');

    for (let i = 0; i < GRACE_TICKS; i++) {
      expect(m.controlOf(0), `tick ${i}`).toBe('absent');
      expect(m.botControlledSeats(), `tick ${i}`).toEqual([]);
      m.step();
    }
    // the whole grace period: nobody moved the seat, no bot exists for it, the match kept stepping
    expect(where(m, 0)).toBe(before);
    expect(takeovers).toEqual([]);
    expect(m.state.tick).toBe(tickAtDrop + GRACE_TICKS);
    expect(m.seatStats(0)).toMatchObject({ autopilotTicks: 0, absentTicks: GRACE_TICKS, drops: 1 });

    expect(m.controlOf(0)).toBe('bot');
    m.step();
    expect(takeovers).toEqual([0]);
    expect(m.botControlledSeats()).toEqual([0]);
    steps(m, 900);
    expect(takeovers).toEqual([0]); // once per drop
    const moved = new Set<string>();
    for (let i = 0; i < 600; i++) {
      m.step();
      moved.add(where(m, 0));
    }
    expect(moved.size).toBeGreaterThan(1); // the bot really plays the fighter
    expect(m.seatStats(0)!.autopilotTicks).toBe(1 + 900 + 600);
    expect(m.state.match.phase).toBe('playing'); // the match never paused for anyone
    expect(m.controlOf(1)).toBe('human'); // the other human is untouched
  });

  it('grace 0 hands the seat to the bot on the very next tick', () => {
    const m = make({ graceSeconds: 0 });
    m.disconnect(0);
    expect(m.controlOf(0)).toBe('bot');
  });

  it('policy idle: the seat keeps standing until the window ends, then a bot takes it for good', () => {
    const takeovers: number[] = [];
    const m = make({ dropPolicy: 'idle', onBotTakeover: (s) => takeovers.push(s) });
    const before = where(m, 0);
    m.disconnect(0);
    steps(m, GRACE_TICKS * 3);
    expect(m.controlOf(0)).toBe('absent');
    expect(where(m, 0)).toBe(before);
    expect(takeovers).toEqual([]);
    m.replaceWithBot(0); // what the room does when the reconnection window ends
    expect(m.controlOf(0)).toBe('bot');
    expect(takeovers).toEqual([0]);
  });

  it('the legacy name `autopilot` still means the bot policy', () => {
    const m = make({ dropPolicy: 'autopilot', graceSeconds: 0 });
    m.disconnect(0);
    expect(m.controlOf(0)).toBe('bot');
  });
});

describe('reconnecting', () => {
  it('inside the grace period: the same fighter, no bot ever played it', () => {
    const takeovers: number[] = [];
    const m = make({ onBotTakeover: (s) => takeovers.push(s) });
    const fighter = m.state.players[0]!;
    const lives = { deaths: fighter.stats.deaths, kills: fighter.stats.kills };
    m.disconnect(0);
    steps(m, GRACE_TICKS - 30);
    const at = where(m, 0);
    m.connect(0);
    expect(m.controlOf(0)).toBe('human');
    expect(m.state.players[0]).toBe(fighter);
    expect(where(m, 0)).toBe(at);
    steps(m, GRACE_TICKS * 3);
    expect(takeovers).toEqual([]);
    expect(m.seatStats(0)).toMatchObject({ autopilotTicks: 0, botKills: 0, botDeaths: 0, drops: 1 });
    expect(m.seatStats(0)!.absentTicks).toBe(GRACE_TICKS - 30);
    expect(fighter.stats.deaths).toBe(lives.deaths);
    expect(m.results().players[0]!.controlledByBotAtEnd).toBe(false);
    // and the human's input works again
    expect(m.input(0, { s: 5, m: 'left', h: false, b: 0 }, 1000)).toBe('ok');
  });

  it('after the bot took over: the SAME living fighter at its current place, no new life, no state reset', () => {
    const takeovers: number[] = [];
    const m = make({ onBotTakeover: (s) => takeovers.push(s) });
    const fighter = m.state.players[0]!;
    m.disconnect(0);
    steps(m, GRACE_TICKS + 600);
    expect(takeovers).toEqual([0]);

    const snap = {
      x: fighter.x,
      y: fighter.y,
      stepFromX: fighter.stepFromX,
      stepFromY: fighter.stepFromY,
      stepRemaining: fighter.stepRemaining,
      alive: fighter.alive,
      stats: { ...fighter.stats },
      protectedUntil: fighter.protectedUntil,
      respawnAt: fighter.respawnAt,
      capacity: fighter.capacity,
    };
    expect(fighter.alive).toBe(true);
    m.connect(0);
    // nothing about the fighter changed by reconnecting: same object, same place, same counters
    expect(m.state.players[0]).toBe(fighter);
    expect({
      x: fighter.x,
      y: fighter.y,
      stepFromX: fighter.stepFromX,
      stepFromY: fighter.stepFromY,
      stepRemaining: fighter.stepRemaining,
      alive: fighter.alive,
      stats: { ...fighter.stats },
      protectedUntil: fighter.protectedUntil,
      respawnAt: fighter.respawnAt,
      capacity: fighter.capacity,
    }).toEqual(snap);
    expect(m.controlOf(0)).toBe('human');
    expect(m.botControlledSeats()).toEqual([]);

    // continuity on the next tick: at most one step away, never a respawn jump
    const px = fighter.x;
    const py = fighter.y;
    m.step();
    expect(Math.abs(fighter.x - px) + Math.abs(fighter.y - py)).toBeLessThanOrEqual(1);
    expect(m.seatStats(0)).toMatchObject({ drops: 1, autopilotTicks: 600 + 0 });

    // a second drop gets a fresh bot and a second announcement
    m.disconnect(0);
    steps(m, GRACE_TICKS + 5);
    expect(takeovers).toEqual([0, 0]);
    expect(m.seatStats(0)!.drops).toBe(2);
  });

  it('after the window the bot keeps the seat for good: input refused, connect ignored', () => {
    const m = make();
    m.disconnect(0);
    steps(m, GRACE_TICKS + 10);
    m.replaceWithBot(0); // window over
    m.connect(0);
    expect(m.controlOf(0)).toBe('bot');
    expect(m.input(0, { s: 9, m: 'up', h: false, b: 0 }, 5000)).toBe('notYours');
    steps(m, 300);
    expect(m.controlOf(0)).toBe('bot');
    expect(m.results().players[0]!.controlledByBotAtEnd).toBe(true);
  });

  it('a fighter who fell while the human was away returns as the same down / respawning fighter, never a fresh one', () => {
    const m = make({ graceSeconds: 60 }); // grace outlasts the test: nobody plays the seat
    const fighter = m.state.players[1]!;
    m.disconnect(1);
    steps(m, 30);
    blastOn(m, 0, 1);
    steps(m, 2);
    expect(fighter.alive).toBe(false);
    expect(fighter.stats.deaths).toBe(1);
    const respawnAt = fighter.respawnAt;
    expect(respawnAt).not.toBeNull();

    m.connect(1);
    expect(m.state.players[1]).toBe(fighter);
    expect(fighter.alive).toBe(false); // still down: reconnecting is not a respawn
    expect(fighter.respawnAt).toBe(respawnAt);
    expect(fighter.stats.deaths).toBe(1);

    // the mode's own respawn rules then bring the same fighter back (spawn protection, one death on the sheet)
    let respawned = false;
    for (let i = 0; i < 600 && !respawned; i++) {
      const frame = m.step();
      respawned = (frame[2] ?? []).some((e) => e.type === 'playerRespawned' && e.playerId === 1);
    }
    expect(respawned).toBe(true);
    expect(m.state.players[1]).toBe(fighter);
    expect(fighter.alive).toBe(true);
    expect(fighter.stats.deaths).toBe(1);
    // the death while standing in the grace period is the human's, not the bot's
    expect(m.seatStats(1)).toMatchObject({ humanDeaths: 1, botDeaths: 0, absentTicks: 32 });
  });
});

describe('statistics split: human versus replacement bot', () => {
  it("a kill credited on a human tick is the human's; on a replacement-bot tick it is the bot's, and the sim still counts both", () => {
    const m = make({ humans: 3, bots: 5 });
    // seat 0 connected, seat 1 connected (the victim, standing still), seat 2 about to drop
    blastOn(m, 0, 1);
    steps(m, 2);
    expect(m.state.players[0]!.stats.kills).toBe(1);
    expect(m.seatStats(0)).toMatchObject({ humanKills: 1, botKills: 0 });

    m.disconnect(0);
    steps(m, GRACE_TICKS + 2); // the bot plays seat 0
    expect(m.controlOf(0)).toBe('bot');
    // the replacement bot's blast kills seat 2 (a connected human standing still)
    exposed(m.state, 2);
    const victim = m.state.players[2]!;
    addGenerator(m.state, { ownerId: 0, x: victim.x, y: victim.y, timer: 1, range: 1 });
    // seat 0 might itself stand in the blast: the test is about the credit, so only count the kill
    expect(victim.alive).toBe(true);
    steps(m, 2);
    expect(victim.alive).toBe(false);
    const sim = m.state.players[0]!.stats;
    expect(sim.kills).toBeGreaterThanOrEqual(2); // the match outcome sees every credited kill
    const split = m.seatStats(0)!;
    expect(split.humanKills).toBe(1);
    expect(split.botKills).toBe(sim.kills - 1);

    const row = m.results().players[0]!;
    expect(row.kills).toBe(1); // personal: only what the human did
    expect(row.botKills).toBeGreaterThanOrEqual(1);
    expect(row.kills + row.botKills!).toBe(sim.kills);
    expect(row.deaths + row.botDeaths!).toBe(sim.deaths);
    expect(row.drops).toBe(1);
    expect(row.autopilotSeconds).toBeGreaterThan(0);
    expect(row.controlledByBotAtEnd).toBe(true);
    // placement is the sim's: unchanged by the split
    expect(typeof row.placement).toBe('number');
    // the victim's seat shows a human death
    expect(m.seatStats(2)).toMatchObject({ humanDeaths: 1, botDeaths: 0 });
  });

  it("a whole match with a mid-match drop: for every human seat, human + bot always equals the simulation's totals", () => {
    const takeovers: number[] = [];
    const m = make({ humans: 4, bots: 4, durationSec: 30, onBotTakeover: (s) => takeovers.push(s) });
    const dirs = ['up', 'right', 'down', 'left'] as const;
    let seq = 0;
    for (let t = 0; t < 6000 && !m.ended; t++) {
      if (t % 25 === 0) {
        for (const seat of [0, 1, 2, 3]) {
          if (m.controlOf(seat) === 'human')
            m.input(
              seat,
              { s: ++seq, m: dirs[(t / 25 + seat) % 4]!, h: false, b: t % 100 === 0 ? 1 : 0 },
              t * 16,
            );
        }
      }
      if (t === 300) m.disconnect(1);
      if (t === 900) m.connect(1); // back after the bot played for a while
      if (t === 500) m.disconnect(2); // never returns
      if (t === 800) m.replaceWithBot(2);
      m.step();
    }
    expect(m.ended).toBe(true);
    expect(takeovers.sort()).toEqual([1, 2]);
    const res = m.results();
    for (const seat of [0, 1, 2, 3]) {
      const sim = m.state.players[seat]!.stats;
      const row = res.players[seat]!;
      expect(row.kills + row.botKills!, `seat ${seat} kills`).toBe(sim.kills);
      expect(row.deaths + row.botDeaths!, `seat ${seat} deaths`).toBe(sim.deaths);
      expect(row.assists + row.botAssists!, `seat ${seat} assists`).toBe(sim.assists);
    }
    expect(res.players[0]!).toMatchObject({
      botKills: 0,
      botDeaths: 0,
      autopilotSeconds: 0,
      drops: 0,
      controlledByBotAtEnd: false,
    });
    expect(res.players[1]!).toMatchObject({ drops: 1, controlledByBotAtEnd: false });
    expect(res.players[1]!.autopilotSeconds).toBeGreaterThan(5);
    expect(res.players[2]!).toMatchObject({ drops: 1, controlledByBotAtEnd: true });
    // server bots keep the sim totals and carry no split fields
    const serverBot = res.players[6]!;
    expect(serverBot.isBot).toBe(true);
    expect(serverBot.kills).toBe(m.state.players[6]!.stats.kills);
    expect(serverBot).not.toHaveProperty('botKills');
    expect(serverBot).not.toHaveProperty('drops');
  });

  it("the match result is the simulation's alone: placement, winner and team come from state, not from the split", () => {
    const m = make({ humans: 2, bots: 6, durationSec: 20 });
    m.disconnect(0);
    for (let t = 0; t < 6000 && !m.ended; t++) m.step();
    expect(m.ended).toBe(true);
    const res = m.results();
    const r = m.state.match.result;
    expect(res.winnerSeat).toBe(r?.kind === 'win' ? r.winnerId : null);
    expect(res.winnerTeam).toBe(r?.kind === 'teamWin' ? r.team : null);
    expect(res.draw).toBe(r?.kind === 'draw');
    for (const row of res.players) {
      expect(row.placement).toBe(matchResultFrom(m.state, row.seat).placement);
    }
    // the replacement bot played seat 0 for the whole match; its credited kills still count in the sim's totals
    expect(m.seatStats(0)!.autopilotTicks).toBeGreaterThan(1000);
    expect(res.players[0]!.kills).toBe(0);
    expect(res.players[0]!.botKills).toBe(m.state.players[0]!.stats.kills);
  });
});
