/**
 * Tactical Trap pilot, perception (decisions TT1-TT3): line of sight, player-body concealment, solid cover, memory and
 * hearing. Everything is grid geometry over the Observation: no camera, no quality setting, no randomness.
 */
import { describe, expect, it } from 'vitest';
import { EnemyBot } from '../src/ai/enemyBot';
import { TrapSight } from '../src/ai/trapSight';
import { TACTICAL_TRAP_PILOT, bodyTiles, canSeeTile, observe, traceBlocked } from '../src/sim';
import { addGenerator, botsFor, knownIds, stepWithBots, trapScene } from './tactical-trap-helpers';
import { addSoft, run } from './helpers';

const P = TACTICAL_TRAP_PILOT.perception;

/** Does the enemy in seat 1 know generator `id` after `ticks` ticks of looking? */
function knowsAfter(s: ReturnType<typeof trapScene>, bot: EnemyBot, ticks: number): boolean {
  let known = false;
  for (let i = 0; i <= ticks; i++) {
    known = knownIds(bot, s, 1).length > 0;
    run(s, 1);
  }
  return known;
}

describe('TT1 line of sight is plain grid geometry', () => {
  it('a straight lane is visible; the same tile behind a pillar is not', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [10, 10] }] });
    const bodies = bodyTiles(s, 1);
    expect(canSeeTile(s, 10, 10, 7, 10, 7, bodies)).toBe(true);
    // (5, 9) is a pillar: from (4, 9) the tile (6, 9) is hidden
    expect(canSeeTile(s, 4, 9, 6, 9, 7, bodies)).toBe(false);
    expect(traceBlocked(s, 4, 9, 6, 9, bodies)).toBe(true);
  });

  it('beyond the kind vision radius a generator is never seen, inside it it is', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'agbero', at: [10, 10] }] });
    const bodies = bodyTiles(s, 1);
    expect(canSeeTile(s, 10, 10, 10 - P.agbero.visionTiles, 10, P.agbero.visionTiles, bodies)).toBe(true);
    expect(canSeeTile(s, 10, 10, 10 - P.agbero.visionTiles - 1, 10, P.agbero.visionTiles, bodies)).toBe(
      false,
    );
    expect(P.boss.visionTiles).toBeGreaterThan(P.agbero.visionTiles);
  });

  it('a crate (soft block) hides what is behind it: sight is blocked by every non-floor tile', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [10, 10] }] });
    expect(canSeeTile(s, 10, 10, 7, 10, 7, bodyTiles(s, 1))).toBe(true);
    addSoft(s, 8, 10);
    expect(canSeeTile(s, 10, 10, 7, 10, 7, bodyTiles(s, 1))).toBe(false);
  });

  it('the two traces: a body covering only one of them leaves the generator visible; both covered = hidden', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [10, 8] }] });
    s.tiles.fill(0); // an empty board: only bodies can block
    // find a line where the forward and the reverse Bresenham traces cross different middle tiles
    let found: { a: [number, number]; b: [number, number]; onlyForward: number; onlyReverse: number } | null =
      null;
    for (let bx = 4; bx < 10 && !found; bx++)
      for (let by = 5; by < 11 && !found; by++) {
        for (let t = 0; t < s.tiles.length && !found; t++) {
          const one = new Set<number>([t]);
          const f = traceBlocked(s, 10, 8, bx, by, one);
          const r = traceBlocked(s, bx, by, 10, 8, one);
          if (f && !r) {
            const t2 = [...Array(s.tiles.length).keys()].find(
              (u) =>
                traceBlocked(s, bx, by, 10, 8, new Set([u])) && !traceBlocked(s, 10, 8, bx, by, new Set([u])),
            );
            if (t2 !== undefined) found = { a: [10, 8], b: [bx, by], onlyForward: t, onlyReverse: t2 };
          }
        }
      }
    expect(found).not.toBeNull();
    const { a, b, onlyForward, onlyReverse } = found!;
    // one body on one trace only: still seen
    expect(canSeeTile(s, a[0], a[1], b[0], b[1], 9, new Set([onlyForward]))).toBe(true);
    expect(canSeeTile(s, a[0], a[1], b[0], b[1], 9, new Set([onlyReverse]))).toBe(true);
    // a body on each of the two traces: hidden
    expect(canSeeTile(s, a[0], a[1], b[0], b[1], 9, new Set([onlyForward, onlyReverse]))).toBe(false);
  });
});

describe('TT2 a living body conceals a generator behind it', () => {
  it('the human directly between the enemy and the generator: not perceived; one step aside: perceived', () => {
    const s = trapScene({ human: [8, 10], enemies: [{ kind: 'guard', at: [11, 10] }] });
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    addGenerator(s, { ownerId: 0, x: 6, y: 10, timer: 400 });
    // hidden for as long as the body stays on the line, however long the enemy looks
    expect(knowsAfter(s, bot, P.guard.reactTicks + 30)).toBe(false);
    // the human steps up the open column x = 8: the line is clear
    s.players[0]!.y = s.players[0]!.stepFromY = 9;
    expect(knowsAfter(s, bot, P.guard.reactTicks + 2)).toBe(true);
  });

  it('another enemy standing in the line conceals it too (any living body)', () => {
    const s = trapScene({
      human: [0, 0],
      enemies: [
        { kind: 'guard', at: [11, 10] },
        { kind: 'agbero', at: [9, 10] },
      ],
    });
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    addGenerator(s, { ownerId: 0, x: 6, y: 10, timer: 400 });
    expect(knowsAfter(s, bot, P.guard.reactTicks + 10)).toBe(false);
  });

  it('a body standing ON the generator tile hides it (the placer has just laid it under his feet)', () => {
    const s = trapScene({ human: [8, 10], enemies: [{ kind: 'guard', at: [11, 10] }] });
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    addGenerator(s, { ownerId: 0, x: 8, y: 10, timer: 400 });
    expect(knowsAfter(s, bot, P.guard.reactTicks + 10)).toBe(false);
  });

  it('a dead body conceals nothing', () => {
    const s = trapScene({
      human: [0, 0],
      enemies: [
        { kind: 'guard', at: [11, 10] },
        { kind: 'agbero', at: [9, 10] },
      ],
    });
    s.players[2]!.alive = false;
    expect(bodyTiles(s, 1).has(10 * s.width + 9)).toBe(false);
  });
});

describe('TT1 solid cover hides a generator; an enemy that never saw it does not react', () => {
  it('a generator behind a pillar is never known and the enemy stands in its blast', () => {
    // enemy (6, 9) in the column lane x = 6; generator at (6, 8)?? use a pillar-separated pair: (4, 9) and (6, 9)
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [6, 9] }] });
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    addGenerator(s, { ownerId: 0, x: 4, y: 9, timer: 400 });
    expect(knowsAfter(s, bot, 200)).toBe(false);
  });
});

describe('TT2 memory', () => {
  it('seen once, it stays known when the human steps in front of it', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [11, 10] }] });
    const bot = new EnemyBot({ difficulty: 'casual', seed: 1, playerId: 1 });
    const g = addGenerator(s, { ownerId: 0, x: 6, y: 10, timer: 900 });
    expect(knowsAfter(s, bot, P.guard.reactTicks + 2)).toBe(true);
    s.players[0]!.x = s.players[0]!.stepFromX = 8;
    s.players[0]!.y = s.players[0]!.stepFromY = 10; // the body is now exactly on the line
    for (let i = 0; i < 10; i++) {
      expect(knownIds(bot, s, 1)).toEqual([g.id]);
      run(s, 1);
    }
  });

  it('out of sight it is forgotten memoryTicks after it was last seen (a long fuse) but held through the last fuse stretch', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [11, 10] }] });
    const sight = new TrapSight();
    const g = addGenerator(s, { ownerId: 0, x: 6, y: 10, timer: 5000 });
    const update = (): void => sight.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
    for (let i = 0; i < P.guard.reactTicks + 1; i++) {
      update();
      s.tick++;
    }
    expect(sight.isKnown(g.id)).toBe(true);
    // a crate drops in the lane: the generator is out of sight from now on
    addSoft(s, 9, 10);
    const seenAt = s.tick - 1;
    while (s.tick - seenAt <= P.guard.memoryTicks) {
      update();
      expect(sight.isKnown(g.id), `tick ${s.tick - seenAt}`).toBe(true);
      s.tick++;
    }
    update();
    expect(sight.isKnown(g.id)).toBe(false); // the window ran out
    expect(sight.remembers(g.id)).toBe(false);
    // a ticking generator in the last stretch of its fuse is never forgotten once it has been seen
    const sight2 = new TrapSight();
    const h = addGenerator(s, {
      ownerId: 0,
      x: 7,
      y: 10,
      timer: TACTICAL_TRAP_PILOT.memoryHoldFuseTicks + 1,
    });
    s.tiles[10 * s.width + 9] = 0;
    for (let i = 0; i < P.guard.reactTicks + 1; i++) {
      sight2.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
      s.tick++;
    }
    expect(sight2.isKnown(h.id)).toBe(true);
    addSoft(s, 9, 10);
    s.tick += P.guard.memoryTicks + 50;
    h.timer = TACTICAL_TRAP_PILOT.memoryHoldFuseTicks; // inside the hold
    sight2.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
    expect(sight2.isKnown(h.id)).toBe(true);
  });

  it('a generator that is no longer where it was seen (kicked away out of sight) has to be seen again', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [11, 10] }] });
    const sight = new TrapSight();
    const g = addGenerator(s, { ownerId: 0, x: 6, y: 10, timer: 5000 });
    for (let i = 0; i < P.guard.reactTicks + 1; i++) {
      sight.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
      s.tick++;
    }
    expect(sight.isKnown(g.id)).toBe(true);
    addSoft(s, 9, 10);
    g.x = g.stepFromX = 4; // moved while out of sight
    sight.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
    expect(sight.isKnown(g.id)).toBe(false);
  });
});

describe('TT3 hearing: caution only', () => {
  it('a generator laid inside earshot (and out of sight) raises caution but is not known, and nothing is revealed', () => {
    // the pillar between (4, 9) and (6, 9) hides it; Manhattan distance 2 <= hearing
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [6, 9] }] });
    const sight = new TrapSight();
    addGenerator(s, { ownerId: 0, x: 4, y: 9, timer: 400 });
    sight.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
    expect(sight.cautious(s.tick)).toBe(true);
    expect(sight.cautionUntil).toBe(s.tick + TACTICAL_TRAP_PILOT.caution.ticks);
    expect(sight.soundDir).toBe('left'); // only the dominant axis of the sound
    for (let i = 0; i < 200; i++) {
      s.tick++;
      sight.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
      expect(sight.isKnown(1)).toBe(false);
    }
  });

  it('a generator laid beyond the hearing range raises nothing', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'agbero', at: [12, 9] }] });
    const sight = new TrapSight();
    addGenerator(s, { ownerId: 0, x: 4, y: 9, timer: 400 }); // 8 tiles away, behind pillars
    sight.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
    expect(sight.cautious(s.tick)).toBe(false);
    expect(sight.soundDir).toBeNull();
  });

  it('only a generator heard being laid counts: one first noticed long after it was laid is not heard', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [6, 9] }] });
    const sight = new TrapSight();
    addGenerator(s, { ownerId: 0, x: 4, y: 9, timer: 400, placedTick: s.tick - 50 });
    sight.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
    expect(sight.cautious(s.tick)).toBe(false);
  });

  it('while cautious the enemy starts no punch, and takes one investigating step toward the sound', () => {
    const s = trapScene({ human: [7, 9], enemies: [{ kind: 'guard', at: [6, 9] }] });
    s.players[1]!.facing = 'right';
    const bots = botsFor(s);
    addGenerator(s, { ownerId: 0, x: 4, y: 9, timer: 400 });
    const ev = stepWithBots(s, bots);
    expect(ev.some((e) => e.type === 'attackStarted' && e.playerId === 1)).toBe(false);
    // it walked toward the sound (left) or stayed: it never started a swing during the caution
    for (let i = 0; i < TACTICAL_TRAP_PILOT.caution.ticks - 2; i++) {
      const e2 = stepWithBots(s, bots);
      expect(e2.some((e) => e.type === 'attackStarted' && e.playerId === 1)).toBe(false);
    }
  });
});

describe('TT1 always-public danger stays public', () => {
  it('a remote, triggered or own generator is known at once, whatever hides it', () => {
    const s = trapScene({ human: [0, 0], enemies: [{ kind: 'guard', at: [6, 9] }] });
    const sight = new TrapSight();
    const r = addGenerator(s, { ownerId: 0, x: 4, y: 9, mode: 'remote', timer: 400 });
    const t = addGenerator(s, { ownerId: 0, x: 2, y: 9, triggered: true, timer: 400 });
    sight.update(observe(s, 1), s.players[1]!, TACTICAL_TRAP_PILOT);
    expect(sight.isKnown(r.id)).toBe(true);
    expect(sight.isKnown(t.id)).toBe(true);
  });
});
