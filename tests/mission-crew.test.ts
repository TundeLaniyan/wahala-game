/**
 * Crew behaviour: every NPC role turns into a directive (sim) and a visibly different way of playing (bots read the
 * directive from their Observation and nothing else).
 */
import { describe, expect, it } from 'vitest';
import { createGame, directiveFor, observe, tick } from '../src/sim';
import type { GameState } from '../src/sim';
import { advance, botIntents, makeBots, newMission, put, standOn } from './mission-helpers';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function runBots(state: GameState, n: number): void {
  const bots = makeBots(state, 'standard');
  for (let i = 0; i < n && state.match.phase !== 'ended'; i++) tick(state, botIntents(state, bots));
}

describe('directives from roles (pure sim)', () => {
  it('each role produces its own directive kind', () => {
    const state = newMission({ id: 'oshodi' });
    advance(state, 1);
    const kind = (id: number): string | undefined => directiveFor(state, id)?.kind;
    expect(state.mission!.seats.map((s) => s.role)).toEqual([
      'player',
      'boss',
      'meleeGuard',
      'rangedAttacker',
      'blocker',
      'runner',
      'runner',
      'escort',
    ]);
    expect(kind(0)).toBeUndefined(); // the human is never directed
    expect(kind(1)).toBe('guard'); // the shielded boss stays at its post
    expect(kind(2)).toBe('guard');
    expect(kind(3)).toBe('chase');
    expect(kind(4)).toBe('block');
    expect(kind(5)).toBe('run');
    expect(kind(7)).toBe('escort');
    const boss = state.players[1]!;
    expect(directiveFor(state, 7)).toMatchObject({ x: boss.x, y: boss.y });
    // the blocker's tile is its post, the guard's radius is three
    const post = state.mission!.seats[4]!.post!;
    expect(directiveFor(state, 4)).toMatchObject({ x: post.x, y: post.y });
    expect(directiveFor(state, 2)).toMatchObject({ radius: 3 });
    // a runner heads to the nearest relay, then to a jammed one
    const relay = state.mission!.nodes.reduce((best, n) => (dist(n, state.players[5]!) < dist(best, state.players[5]!) ? n : best));
    expect(directiveFor(state, 5)).toMatchObject({ x: relay.x, y: relay.y });
    // an eliminated bot has none
    state.players[3]!.alive = false;
    expect(directiveFor(state, 3)).toBeUndefined();
  });

  it('the exposed boss flees; guards chase once it is exposed', () => {
    const state = newMission({ id: 'oshodi' });
    advance(state, 1);
    const m = state.mission!;
    m.boss.shielded = false;
    m.phaseState = 'exposed';
    expect(directiveFor(state, 1)).toMatchObject({ kind: 'flee', x: state.players[0]!.x, y: state.players[0]!.y });
    expect(directiveFor(state, 2)?.kind).toBe('chase');
  });

  it('defenders are anchored to different nodes; auditors chase the carrier', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    advance(state, 1);
    const spots = [2, 3, 4].map((id) => directiveFor(state, id)!);
    expect(spots.every((d) => d.kind === 'guard')).toBe(true);
    expect(new Set(spots.map((d) => `${d.x},${d.y}`)).size).toBe(3);
    const lagos = newMission({ id: 'lagosIsland' });
    advance(lagos, 1);
    expect(directiveFor(lagos, 2)?.kind).toBe('guard');
    const l1 = lagos.mission!.nodes[0]!;
    standOn(lagos, l1.x, l1.y, 70);
    expect(lagos.mission!.carry).not.toBeNull();
    expect(directiveFor(lagos, 2)?.kind).toBe('chase');
    expect(directiveFor(lagos, 4)?.kind).toBe('guard'); // the records guard stays with the boss
  });

  it('bots see the directive only through observe(): crew yes, the human and normal matches no', () => {
    const state = newMission({ id: 'oshodi' });
    advance(state, 1);
    expect(observe(state, 3).directive).toMatchObject({ kind: 'chase' });
    expect(observe(state, 0).directive).toBeUndefined();
    const normal = createGame({
      seed: 1,
      players: [
        { name: 'a', characterId: 'streetBaller', isBot: true },
        { name: 'b', characterId: 'lekkiBoy', isBot: true },
      ],
    });
    expect('directive' in observe(normal, 0)).toBe(false);
  });
});

describe('roles play differently (bots, 15 seconds)', () => {
  it('oshodi: guard holds, blocker stands, escort follows, runners reach relays, the spotter hunts', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const start = state.players.map((p) => ({ x: p.x, y: p.y }));
    runBots(state, 900);
    const post = (id: number): { x: number; y: number } => m.seats[id]!.post!;
    const p = state.players;
    expect(p[1]!.alive).toBe(true);
    expect(dist(p[1]!, post(1))).toBeLessThanOrEqual(4); // boss stays near its post
    expect(dist(p[2]!, post(2))).toBeLessThanOrEqual(5); // melee guard holds its post
    expect(dist(p[4]!, post(4))).toBeLessThanOrEqual(1); // blocker stands on its tile
    expect(dist(p[7]!, p[1]!)).toBeLessThanOrEqual(4); // escort stays with the boss
    // runners are at the relays nearest to them
    const near = (id: number): { x: number; y: number } =>
      m.nodes.reduce((best, n) => (dist(n, start[id]!) < dist(best, start[id]!) ? n : best));
    expect(dist(p[5]!, near(5))).toBeLessThanOrEqual(1);
    expect(dist(p[6]!, near(6))).toBeLessThanOrEqual(1);
    // the ranged attacker left its start and went for the human (or got them)
    const human = p[0]!;
    expect(dist(p[3]!, start[3]!)).toBeGreaterThan(15);
    expect(!human.alive || dist(p[3]!, human) < dist(start[3]!, start[0]!) - 15).toBe(true);
  });

  it('fadeyi: each marshal stays at its own junction', () => {
    const state = newMission({ id: 'fadeyiSomolu' });
    const m = state.mission!;
    runBots(state, 900);
    const nodes = m.nodes;
    [2, 3, 4].forEach((id, i) => {
      const node = nodes[i % nodes.length]!;
      expect(dist(state.players[id]!, node), `marshal ${id}`).toBeLessThanOrEqual(5);
    });
    // and a marshal in a zone stops the human holding it
    expect(new Set([2, 3, 4].map((id) => nodes.findIndex((n) => dist(state.players[id]!, n) <= 5))).size).toBe(3);
  });

  it('lagos: the boss assistant stands between the boss and the human; the clerk stays with an ally', () => {
    const state = newMission({ id: 'lagosIsland' });
    put(state, 0, 33, 24); // the human is not far
    const bots = makeBots(state, 'standard');
    for (let i = 0; i < 600; i++) {
      const intents = botIntents(state, bots);
      delete intents[0];
      tick(state, intents);
    }
    const [human, boss] = [state.players[0]!, state.players[1]!];
    const assistant = state.players[5]!;
    if (human.alive && assistant.alive) {
      expect(dist(assistant, boss)).toBeLessThanOrEqual(4);
      expect(dist(assistant, human)).toBeLessThanOrEqual(dist(boss, human));
    }
    const clerk = state.players[6]!;
    const ally = state.players[2]!.alive ? state.players[2]! : boss;
    if (clerk.alive) expect(dist(clerk, ally)).toBeLessThanOrEqual(6);
  });

  it('the exposed boss runs away from the human', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    advance(state, 1);
    const boss = state.players[1]!;
    put(state, 0, boss.x - 5, boss.y);
    const before = dist(state.players[0]!, boss);
    m.boss.shielded = false;
    m.phaseState = 'exposed';
    m.boss.exposedUntil = state.tick + 100000;
    const bots = makeBots(state, 'standard');
    for (let i = 0; i < 400; i++) {
      const intents = botIntents(state, bots);
      delete intents[0]; // the human stands still
      tick(state, intents);
    }
    expect(boss.alive).toBe(true);
    expect(dist(state.players[0]!, boss)).toBeGreaterThan(before + 4);
  });
});
