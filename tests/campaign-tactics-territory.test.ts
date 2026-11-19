/**
 * The ONE territorial state machine (decision SA6, docs/CAMPAIGN_SECTOR_AI.md): patrol, watch, investigate, alert,
 * pursue, return - shared by every variant, driven through the directive pipeline, deterministic. Leash from the
 * territory (never the post alone) with hysteresis, a watch after giving up, and immediate re-engagement on a hit or a
 * return inside its range: an enemy walking home is not a free target at the boundary.
 */
import { describe, expect, it } from 'vitest';
import { observe, territoryDirective, tick } from '../src/sim';
import type { CampaignLevel, EnemyVariantId, GameState, SimEvent, TerritoryDef } from '../src/sim';
import { addGenerator, eventsOf } from './helpers';
import { stepScene, tacticsScene } from '../scripts/lib/sectorDrill';

function scene(o: {
  human: [number, number];
  enemies: { variant?: EnemyVariantId; at: [number, number]; territory?: TerritoryDef }[];
  level?: CampaignLevel;
  seed?: number;
}) {
  return tacticsScene({
    level: o.level ?? 'normal',
    seed: o.seed ?? 1,
    human: o.human,
    enemies: o.enemies.map((e) => ({ variant: e.variant ?? 'agbero', at: e.at, territory: e.territory })),
  });
}

const mind = (s: GameState, id = 1) => s.territory!.minds[id]!;
const put = (s: GameState, id: number, x: number, y: number) => {
  const p = s.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
};
/** Sim-only ticks (the minds update; nobody moves by intent). */
const wait = (s: GameState, n: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...tick(s, {}));
  return out;
};

describe('patrol: predictable on Easy, a little varied on Normal and Hard, one readable loop on every level', () => {
  /** The ticks at which the patroller started each pause, over `ticks`, with the human tucked away out of sight. */
  function pauses(level: CampaignLevel, ticks: number): { at: number[]; waypoints: number[] } {
    const { s, bots } = scene({
      level,
      human: [0, 10],
      enemies: [
        {
          at: [2, 2],
          territory: {
            patrol: [
              [2, 2],
              [8, 2],
              [8, 6],
            ],
          },
        },
      ],
    });
    const at: number[] = [];
    const waypoints: number[] = [];
    let was = -1;
    for (let i = 0; i < ticks; i++) {
      stepScene(s, bots, {});
      const m = mind(s);
      expect(m.state).toBe('patrol');
      if (m.pauseUntil > s.tick && m.pauseUntil !== was) {
        was = m.pauseUntil;
        at.push(s.tick);
        const p = s.players[1]!;
        waypoints.push(p.y * 100 + p.x);
      }
    }
    return { at, waypoints };
  }

  it('walks its waypoints in order, pausing at each (Normal)', () => {
    const { waypoints } = pauses('normal', 60 * 25);
    expect(waypoints.slice(0, 6)).toEqual([202, 208, 608, 202, 208, 608]);
  });

  it('Easy is clockwork (every pause the same); Normal varies it a little (deterministically)', () => {
    const lengths = (level: CampaignLevel) => {
      const { s, bots } = scene({
        level,
        human: [0, 10],
        enemies: [
          {
            at: [2, 2],
            territory: {
              patrol: [
                [2, 2],
                [8, 2],
              ],
            },
          },
        ],
      });
      const out: number[] = [];
      let was = -1;
      for (let i = 0; i < 60 * 25; i++) {
        stepScene(s, bots, {});
        const m = mind(s);
        if (m.pauseUntil > s.tick && m.pauseUntil !== was) {
          was = m.pauseUntil;
          out.push(m.pauseUntil - s.tick);
        }
      }
      return out;
    };
    const easy = lengths('easy');
    const normal = lengths('normal');
    expect(new Set(easy).size).toBe(1);
    expect(new Set(normal).size).toBeGreaterThan(1);
    expect(lengths('normal')).toEqual(normal); // deterministic
  });

  it('Hard keeps the same readable loop on every lap (decision RC2: no reversing laps) with a shorter pause', () => {
    const { waypoints } = pauses('hard', 60 * 40);
    const loop = [202, 208, 608];
    expect(waypoints.slice(0, 3)).toEqual(loop);
    // lap after lap the order is the same rotation: a route a player can learn
    expect(waypoints.slice(3, 6)).toEqual(loop);
    expect(waypoints.slice(6, 9)).toEqual(loop);
  });
});

describe('noticing the human: sight in the calm cone, closeness, the alert beat', () => {
  it('a watcher facing the human notices him after the notice time, then pursues after the alert beat', () => {
    // (decision RC4: a calm walker notices within `calmNoticeTiles`, 5 for an agbero on Normal: he stands 4 tiles off)
    const { s } = scene({ human: [8, 6], enemies: [{ at: [4, 6], territory: { radius: 2 } }] });
    s.players[1]!.facing = 'right';
    const ev = wait(s, 40);
    const alert = eventsOf(ev, 'enemyCue').find((e) => e.cue === 'alert')!;
    expect(alert).toMatchObject({ playerId: 1, x: 8, y: 6, byId: null });
    expect(alert.fromTick).toBeGreaterThanOrEqual(s.config.campaignTactics!.awareness.noticeTicks - 1);
    expect(mind(s).state).toBe('pursue');
    expect(territoryDirective(s, 1)?.kind).not.toBe('hold');
  });

  it('not through concrete, not behind its back (the calm cone), but always within two tiles', () => {
    const wall = scene({ human: [6, 4], enemies: [{ at: [4, 6], territory: { radius: 2 } }] });
    wall.s.players[1]!.facing = 'right';
    wait(wall.s, 60);
    expect(mind(wall.s).state).toBe('watch'); // (5,5) is concrete

    const behind = scene({ human: [1, 6], enemies: [{ at: [4, 6], territory: { radius: 2 } }] });
    behind.s.players[1]!.facing = 'right';
    wait(behind.s, 60);
    expect(mind(behind.s).state).toBe('watch');

    const close = scene({ human: [2, 6], enemies: [{ at: [4, 6], territory: { radius: 2 } }] });
    close.s.players[1]!.facing = 'right';
    wait(close.s, 2);
    expect(mind(close.s).state).toBe('alert');
  });

  it('a watching guard sweeps its view: someone behind it is noticed within a sweep', () => {
    const { s } = scene({ human: [0, 6], enemies: [{ at: [4, 6], territory: { radius: 2 } }] });
    s.players[1]!.facing = 'right';
    wait(s, 400);
    expect(mind(s).state).not.toBe('watch');
  });

  it('a route marshal calls the crew within its radius; on Easy nobody calls', () => {
    const crew = (level: CampaignLevel) => {
      const { s } = scene({
        level,
        human: [8, 2],
        enemies: [
          { variant: 'routeMarshal', at: [4, 2], territory: { radius: 2 } },
          { variant: 'agbero', at: [4, 8], territory: { radius: 2 } },
        ],
      });
      s.players[1]!.facing = 'right';
      s.players[2]!.facing = 'left'; // looking away: only the call can alert it
      const ev = wait(s, 50);
      return eventsOf(ev, 'enemyCue').filter((e) => e.cue === 'alert');
    };
    const normal = crew('normal');
    expect(normal.map((e) => [e.playerId, e.byId])).toEqual([
      [1, null],
      [2, 1],
    ]);
    expect(crew('easy').map((e) => e.playerId)).toEqual([1]);
  });
});

describe('pursuit, the leash and the return: no farming at the boundary', () => {
  const chase = () => {
    const r = scene({
      human: [6, 6],
      enemies: [
        {
          at: [4, 6],
          territory: {
            patrol: [
              [4, 6],
              [12, 6],
            ],
          },
        },
      ],
    });
    r.s.players[1]!.facing = 'right';
    wait(r.s, 20);
    expect(mind(r.s).state).toBe('pursue');
    return r;
  };

  it('the leash is measured from the TERRITORY (its whole patrol), not the post', () => {
    const { s } = chase();
    const spec = mind(s).spec;
    // far from the post (4,6) but close to the patrol's far end (12,6): still in range
    put(s, 0, 12, 10);
    wait(s, 10);
    expect(mind(s).state).toBe('pursue');
    expect(spec.leashTiles).toBe(spec.pursuitTiles + s.config.campaignTactics!.territory.leashSlack);
  });

  it('beyond the leash it gives up, watches the human (facing him), then walks back', () => {
    const { s } = chase();
    put(s, 0, 0, 0); // still within 8: hysteresis keeps the chase
    const far = { x: 0, y: 6 };
    wait(s, 5);
    expect(mind(s).state).toBe('pursue');
    // a human far from every anchor (more than pursuit + slack = 10 tiles)
    // (the board is 15 x 11: shrink the territory to provoke it)
    mind(s).spec.anchors = [{ x: 12, y: 6 }];
    mind(s).spec.pursuitTiles = 4;
    mind(s).spec.leashTiles = 6;
    put(s, 0, far.x, far.y);
    const ev = wait(s, 3);
    expect(eventsOf(ev, 'enemyCue').some((e) => e.cue === 'lost')).toBe(true);
    expect(mind(s).state).toBe('return');
    expect(territoryDirective(s, 1)?.kind).toBe('hold'); // the watch
    expect(s.players[1]!.facing).toBe('left'); // facing the human
    wait(s, s.config.campaignTactics!.territory.returnWatchTicks);
    expect(territoryDirective(s, 1)?.kind).toBe('return');
  });

  it('a hit while it walks back re-engages it at once; so does the human stepping back into its range', () => {
    const { s } = chase();
    mind(s).spec.anchors = [{ x: 12, y: 6 }];
    mind(s).spec.pursuitTiles = 4;
    mind(s).spec.leashTiles = 6;
    put(s, 0, 0, 0);
    wait(s, 2);
    expect(mind(s).state).toBe('return');
    // a blast catches it: straight back on the human
    const e = s.players[1]!;
    addGenerator(s, { x: e.x, y: e.y, ownerId: 0, timer: 1 });
    e.vitals!.hp = e.vitals!.maxHp = 9; // survives to show it
    s.config.campaignTactics!.armoured.agbero = true;
    wait(s, 3);
    expect(['alert', 'pursue']).toContain(mind(s).state);
    wait(s, 30);
    expect(mind(s).state).toBe('pursue'); // no leash for a while after a hit: it comes for him
    wait(s, s.config.campaignTactics!.territory.hitChaseTicks);
    expect(['investigate', 'return']).toContain(mind(s).state); // it lets go only once that has run out

    const again = chase();
    const m = mind(again.s);
    m.spec.anchors = [{ x: 12, y: 6 }];
    m.spec.pursuitTiles = 4;
    m.spec.leashTiles = 6;
    put(again.s, 0, 0, 0);
    wait(again.s, 2);
    expect(m.state).toBe('return');
    put(again.s, 0, 9, 6); // back inside its range, in plain sight
    wait(again.s, 12);
    expect(['alert', 'pursue']).toContain(m.state);
  });
});

describe('investigation after a noise, and determinism', () => {
  it('a blast heard out of sight sends it to look, search a while and go back', () => {
    const { s, bots } = scene({ human: [14, 10], enemies: [{ at: [6, 6], territory: { radius: 2 } }] });
    s.players[1]!.facing = 'left';
    addGenerator(s, { x: 10, y: 4, ownerId: 0, timer: 2 });
    const ev: SimEvent[] = [];
    for (let i = 0; i < 600; i++) ev.push(...stepScene(s, bots, {}));
    const cues = eventsOf(ev, 'enemyCue').map((e) => e.cue);
    expect(cues[0]).toBe('investigate');
    expect(['return', 'watch']).toContain(mind(s).state);
  });

  it('two identical matches give identical minds and directives (no RNG, no clock)', () => {
    const play = () => {
      const { s, bots } = scene({
        human: [12, 8],
        enemies: [
          {
            at: [2, 2],
            territory: {
              patrol: [
                [2, 2],
                [8, 2],
              ],
            },
          },
          { variant: 'routeMarshal', at: [6, 8], territory: { radius: 2 } },
        ],
      });
      const trace: string[] = [];
      for (let i = 0; i < 900; i++) {
        stepScene(s, bots, i % 90 < 45 ? { move: 'left' } : { move: 'up' });
        trace.push(JSON.stringify([s.territory, observe(s, 1).directive, observe(s, 2).directive]));
      }
      return trace;
    };
    expect(play()).toEqual(play());
  });
});
