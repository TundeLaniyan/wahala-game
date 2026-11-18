/**
 * Campaign tactics PERCEPTION (decisions SA4-SA5, docs/CAMPAIGN_SECTOR_AI.md): what an enemy knows about generators and
 * the human, from the grid alone. Line of sight blocked by concrete, crates and other bodies (player-body
 * concealment), memory that stepping in front never erases, the calm view cone, watching a placement (trap sense),
 * hearing that only ever yields a coarse direction band, and the boss missions' generator bots. No omniscience.
 */
import { describe, expect, it } from 'vitest';
import { EnemyBot, UNHEEDED_FUSE } from '../src/ai/enemyBot';
import { SeatPerception } from '../src/ai/seatPerception';
import { buildMissionGame, createGame, investigateSpot, noiseBand, observe, tick } from '../src/sim';
import type { CampaignLevel, EnemyVariantId, GameState, TerritoryDef } from '../src/sim';
import { Tile } from '../src/sim/types';
import { addGenerator } from './helpers';
import { tacticsScene } from '../scripts/lib/sectorDrill';

/** A tactics scene (pillar board, radial blasts) with the human at `human` and one enemy, plus its own EnemyBot. */
function scene(o: {
  human: [number, number];
  enemy: [number, number];
  variant?: EnemyVariantId;
  level?: CampaignLevel;
  territory?: TerritoryDef;
  mind?: boolean;
}): { s: GameState; bot: EnemyBot } {
  const { s } = tacticsScene({
    level: o.level ?? 'normal',
    seed: 1,
    human: o.human,
    enemies: [{ variant: o.variant ?? 'agbero', at: o.enemy, territory: o.territory }],
  });
  if (o.mind === false) delete s.territory; // no territory: the group tactic (a brawler engaged on the human)
  const bot = new EnemyBot({ difficulty: 'casual', seed: 5, playerId: 1 });
  return { s, bot };
}

/** What the enemy's planner is shown: 'known' (real fuse), 'obstacle' (seen, not reacted yet) or 'absent'. */
function shown(bot: EnemyBot, s: GameState, genId: number): 'known' | 'obstacle' | 'absent' {
  const g = bot.perceive(observe(s, 1)).generators.find((o) => o.id === genId);
  if (!g) return 'absent';
  return g.timer >= UNHEEDED_FUSE ? 'obstacle' : 'known';
}

/** Lets the enemy look for `n` ticks without anything moving (the bot perceives, nobody acts). */
function look(bot: EnemyBot, s: GameState, genId: number, n: number): ReturnType<typeof shown> {
  let last = shown(bot, s, genId);
  for (let i = 0; i < n; i++) {
    s.tick++;
    last = shown(bot, s, genId);
  }
  return last;
}

const gen = (s: GameState, x: number, y: number, ownerId = 0) =>
  addGenerator(s, { x, y, ownerId, timer: 170, placedTick: s.tick - 10 });

describe('sight: grid line of sight, independent of the camera and graphics quality', () => {
  it('a generator in a clear lane is seen and, after the reaction time, known; behind concrete it is never seen', () => {
    // engaged (no territory: the group tactic chases the human), so the full vision radius applies
    const { s, bot } = scene({ human: [10, 6], enemy: [4, 6], mind: false });
    const open = gen(s, 7, 6);
    const hidden = gen(s, 6, 4); // (5,5) is a pillar: the diagonal from (4,6) is blocked both ways
    expect(look(bot, s, open.id, 1)).toBe('obstacle'); // seen: an obstacle on its route, not yet a threat
    expect(look(bot, s, open.id, 60)).toBe('known');
    expect(shown(bot, s, hidden.id)).toBe('absent'); // never seen: not even an obstacle
  });

  it('a crate blocks sight like concrete', () => {
    const { s, bot } = scene({ human: [12, 8], enemy: [4, 6], mind: false });
    s.tiles[6 * s.width + 6] = Tile.Soft;
    const g = gen(s, 8, 6);
    expect(look(bot, s, g.id, 90)).toBe('absent');
    s.tiles[6 * s.width + 6] = Tile.Empty; // the crate burns: now it is in plain view
    expect(look(bot, s, g.id, 60)).toBe('known');
  });

  it('player-body concealment: the human standing on his generator hides it; another body on the line hides it', () => {
    const { s, bot } = scene({ human: [7, 6], enemy: [4, 6], mind: false });
    const under = gen(s, 7, 6);
    expect(look(bot, s, under.id, 90)).toBe('absent');
    // the human steps off: in plain view
    s.players[0]!.x = s.players[0]!.stepFromX = 8;
    expect(look(bot, s, under.id, 60)).toBe('known');
  });

  it('memory: once seen, a body stepping in front never erases it; a generator moved while unseen is forgotten', () => {
    const { s, bot } = scene({ human: [12, 8], enemy: [4, 6], mind: false });
    const g = gen(s, 8, 6);
    expect(look(bot, s, g.id, 60)).toBe('known');
    s.players[0]!.x = s.players[0]!.stepFromX = 6; // the human steps onto the line between them
    s.players[0]!.y = s.players[0]!.stepFromY = 6;
    expect(look(bot, s, g.id, 60)).toBe('known');
    g.x = 10; // kicked along while hidden behind the human: it has to be seen again
    expect(shown(bot, s, g.id)).toBe('absent');
  });

  it('perception reads no graphics quality and no camera: the config has no such field', () => {
    const { s } = scene({ human: [12, 8], enemy: [4, 6] });
    expect(JSON.stringify(s.config.campaignTactics)).not.toMatch(/quality|camera|screen/i);
  });
});

describe('the calm view cone and trap sense (SA5)', () => {
  it('a calm patroller sees only ahead and near: not a generator behind it, nor one far ahead', () => {
    const { s, bot } = scene({
      human: [12, 10],
      enemy: [6, 2],
      territory: {
        patrol: [
          [6, 2],
          [12, 2],
        ],
      },
    });
    s.players[1]!.facing = 'right';
    const behind = gen(s, 4, 2);
    const far = gen(s, 10, 2); // 4 tiles ahead: beyond a basic patroller's calm 3
    const near = gen(s, 8, 2); // 2 tiles ahead: noticed
    expect(look(bot, s, behind.id, 60)).toBe('absent');
    expect(shown(bot, s, far.id)).toBe('absent');
    expect(shown(bot, s, near.id)).toBe('known');
  });

  it('an engaged enemy uses its full vision all round', () => {
    const { s, bot } = scene({ human: [8, 6], enemy: [6, 2], mind: false });
    s.players[1]!.facing = 'right';
    const behind = gen(s, 2, 2);
    expect(look(bot, s, behind.id, 80)).toBe('known');
  });

  it('watching a placement: a keen guard sees a generator laid under the human in its sight; a basic one does not', () => {
    const lay = (variant: EnemyVariantId, level: CampaignLevel = 'normal') => {
      const { s, bot } = scene({ human: [7, 6], enemy: [4, 6], variant, level, mind: false });
      bot.perceive(observe(s, 1));
      tick(s, { 0: { place: true } });
      const g = s.generators.find((o) => o.ownerId === 0)!;
      return look(bot, s, g.id, 60);
    };
    expect(lay('ringSecurity')).toBe('known'); // keen: watched him lay it
    expect(lay('agbero')).toBe('absent'); // basic on Normal: the body still hides it
    expect(lay('agbero', 'hard')).toBe('known'); // Hard: basic enemies watch placements too
    expect(lay('areaBoy', 'hard')).toBe('absent'); // no trap sense at all
  });

  it('a reeling (staggered) enemy notices no placement, and nobody sees one through concrete', () => {
    const { s, bot } = scene({ human: [7, 6], enemy: [4, 6], variant: 'ringSecurity', mind: false });
    s.players[1]!.dazedUntil = s.tick + 20;
    bot.perceive(observe(s, 1));
    tick(s, { 0: { place: true } });
    const g = s.generators.find((o) => o.ownerId === 0)!;
    expect(look(bot, s, g.id, 40)).toBe('absent');
    const b = scene({ human: [6, 4], enemy: [4, 6], variant: 'ringSecurity', mind: false });
    b.bot.perceive(observe(b.s, 1));
    tick(b.s, { 0: { place: true } });
    const g2 = b.s.generators.find((o) => o.ownerId === 0)!;
    expect(look(b.bot, b.s, g2.id, 40)).toBe('absent'); // (5,5) is concrete
  });
});

describe('hearing never reveals the tile (SA4)', () => {
  it('the investigation spot depends on the coarse band only: two hidden tiles in one band send it to the same spot', () => {
    const { s } = scene({ human: [12, 10], enemy: [6, 6], territory: { radius: 2 } });
    const p = s.players[1]!;
    const spec = s.territory!.minds[1]!.spec;
    // two different hidden sources in the same (east) band, and in the same (south-east) band
    expect(noiseBand(p, 9, 6)).toEqual(noiseBand(p, 10, 7));
    expect(investigateSpot(s, p, spec, noiseBand(p, 9, 6))).toEqual(
      investigateSpot(s, p, spec, noiseBand(p, 10, 7)),
    );
    expect(noiseBand(p, 8, 8)).toEqual(noiseBand(p, 9, 8));
    expect(investigateSpot(s, p, spec, noiseBand(p, 8, 8))).toEqual(
      investigateSpot(s, p, spec, noiseBand(p, 9, 8)),
    );
    // a different band is a different direction
    expect(investigateSpot(s, p, spec, noiseBand(p, 6, 9))).not.toEqual(
      investigateSpot(s, p, spec, noiseBand(p, 9, 6)),
    );
  });

  it('end to end: a generator laid out of sight within earshot sends the enemy to the same coarse spot wherever it is', () => {
    const heardAt = (hx: number, hy: number) => {
      const { s } = scene({ human: [hx, hy], enemy: [6, 6], territory: { radius: 2 } });
      s.players[1]!.facing = 'left'; // looking away: it can only hear
      tick(s, { 0: { place: true } });
      const m = s.territory!.minds[1]!;
      return { state: m.state, target: m.target };
    };
    // east band: 3 and 4 tiles away; south-east band: two different tiles
    const a = heardAt(9, 6);
    const b = heardAt(10, 6);
    const c = heardAt(8, 8);
    const d = heardAt(7, 8);
    for (const r of [a, b, c, d]) expect(r.state).toBe('investigate');
    expect(a.target).toEqual(b.target);
    expect(c.target).toEqual(d.target);
    expect(a.target).not.toEqual(c.target);
    expect(b.target).not.toEqual({ x: 10, y: 6 }); // the spot is the band's, not the source's
  });

  it('hearing makes the bot cautious (no new wind-up) but never shows it the generator', () => {
    const { s, bot } = scene({ human: [12, 10], enemy: [6, 6], mind: false });
    s.players[1]!.facing = 'left';
    const g = gen(s, 8, 4); // laid behind concrete, within earshot
    g.placedTick = s.tick;
    expect(shown(bot, s, g.id)).toBe('absent');
  });
});

describe('boss missions: the generator bots plan only on what they saw (SA4)', () => {
  it('a human generator behind concrete is absent for the boss; its own crew generators are known', () => {
    const s = createGame(
      buildMissionGame({ spec: { id: 'oshodi' }, humanCharacter: 'streetBaller', seed: 4 }),
    );
    s.match.phase = 'playing';
    const boss = s.players[1]!;
    const seat = new SeatPerception('boss');
    // a human generator far beyond the boss's vision, and one of the crew's
    const far = addGenerator(s, { x: (boss.x + 20) % s.width, y: boss.y, ownerId: 0, timer: 170 });
    const crew = addGenerator(s, { x: boss.x, y: boss.y, ownerId: 2, timer: 170 });
    const seen = seat.perceive(observe(s, 1), () => undefined);
    expect(seen.generators.some((o) => o.id === far.id)).toBe(false);
    expect(seen.generators.find((o) => o.id === crew.id)?.timer).toBe(170);
  });
});
