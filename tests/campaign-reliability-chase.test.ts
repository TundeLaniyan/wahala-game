/**
 * Campaign combat reliability, part 3: a chase can be broken, a patrol walks its route (decisions RC2, RC3,
 * docs/CAMPAIGN_COMBAT_RELIABILITY.md). On the Academy pillar board with the layer of the level, real enemy bots and a scripted
 * runner using ordinary intents only:
 *   - an unprovoked patroller walks its whole route in order, lap after lap, slower than it chases, at every level;
 *   - it notices at range, pursues, and BREAKS OFF within the limits when the human keeps running (the walking gap rule and the
 *     maximum chase), goes to look where it last saw him, returns and resumes its route;
 *   - a re-notice cooldown after a break-off (a human within `closeTiles` or a hit still engages it at once);
 *   - a hit or a blast restarts a bounded chase, never a forever-chase; the leash is measured from the territory, never the post.
 */
import { describe, expect, it } from 'vitest';
import { campaignTacticsFor, enemyMindView, tick } from '../src/sim';
import type { CampaignLevel, GameState, SimEvent } from '../src/sim';
import { eventsOf } from './helpers';
import { stepScene, tacticsScene } from '../scripts/lib/sectorDrill';

const LEVELS: readonly CampaignLevel[] = ['easy', 'normal', 'hard'];
const ROUTE = [
  [2, 2],
  [12, 2],
  [12, 8],
] as const;

function scene(level: CampaignLevel, human: [number, number], at: [number, number] = [2, 2], patrol = true) {
  return tacticsScene({
    level,
    seed: 1,
    human,
    enemies: [
      {
        variant: 'agbero',
        at,
        territory: patrol ? { patrol: ROUTE.map(([x, y]) => [x, y] as [number, number]) } : { radius: 2 },
      },
    ],
  });
}
const mind = (s: GameState) => s.territory!.minds[1]!;
const put = (s: GameState, id: number, x: number, y: number): void => {
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

describe('patrol: the whole route in order, lap after lap, at a walk (RC2)', () => {
  for (const level of LEVELS) {
    it(`${level}: visits every waypoint in order and loops; the walk is slower than its chase`, () => {
      const { s, bots } = scene(level, [0, 10]);
      const visits: number[] = [];
      const stepAt: number[] = [];
      let last = '';
      let lastPause = -1;
      for (let i = 0; i < 60 * 90; i++) {
        stepScene(s, bots, {});
        const p = s.players[1]!;
        const m = mind(s);
        expect(m.state, `${level} stays on patrol`).toBe('patrol');
        const here = `${p.x},${p.y}`;
        // ticks between two consecutive steps along the first straight stretch (2,2) -> (12,2)
        if (here !== last && p.y === 2 && p.x > 2 && p.x < 12 && last !== '') stepAt.push(s.tick);
        last = here;
        // it pauses at each waypoint it reaches: that is a visit
        if (m.pauseUntil > s.tick && m.pauseUntil !== lastPause) {
          lastPause = m.pauseUntil;
          visits.push(ROUTE.findIndex(([x, y]) => p.x === x && p.y === y));
        }
      }
      // every waypoint, in order, round and round
      expect(visits.length).toBeGreaterThanOrEqual(7);
      visits.forEach((v, i) => expect(v, `visit ${i}`).toBe((visits[0]! + i) % 3));
      // the pace of a calm walk: the level's chase step plus the calm extra, on every tile of the stretch
      const t = campaignTacticsFor(level);
      const gaps = stepAt
        .slice(1)
        .map((x, i) => x - stepAt[i]!)
        .filter((g) => g < 40);
      expect(gaps.length).toBeGreaterThan(8);
      for (const g of gaps)
        expect(g, `${level} step interval`).toBe(t.enemyStepTicks.agbero + t.territory.patrolStepExtraTicks);
      expect(t.enemyStepTicks.agbero + t.territory.patrolStepExtraTicks).toBeGreaterThan(
        t.enemyStepTicks.agbero,
      );
    });
  }
});

describe('a chase ends: the gap rule and the maximum chase (RC3)', () => {
  /** A pursuing agbero with the human `gap` walking tiles away along the top lane. */
  function pursuing(level: CampaignLevel, humanAt: [number, number]) {
    const r = scene(level, humanAt, [2, 2], true);
    const m = mind(r.s);
    m.state = 'pursue';
    m.since = r.s.tick;
    m.chaseSince = r.s.tick;
    m.lastSeen = { x: humanAt[0], y: humanAt[1] };
    m.lastSeenTick = r.s.tick;
    return r;
  }

  for (const level of LEVELS) {
    it(`${level}: out of reach (farther than the gap) for the break-off time and it breaks off, looks where it saw him, and says so`, () => {
      const t = campaignTacticsFor(level).chase;
      const { s } = pursuing(level, [2 + t.breakOffGapTiles + 4, 2]);
      const ev: SimEvent[] = [];
      let brokeAt = -1;
      for (let i = 0; i < t.breakOffTicks + 40 && brokeAt < 0; i++) {
        ev.push(...tick(s, {}));
        if (mind(s).state !== 'pursue') brokeAt = i;
      }
      expect(brokeAt, 'it broke off').toBeGreaterThan(-1);
      expect(brokeAt, 'not before the break-off time').toBeGreaterThanOrEqual(t.breakOffTicks - 1);
      expect(mind(s).state).toBe('investigate');
      expect(eventsOf(ev, 'enemyCue').some((e) => e.cue === 'lost')).toBe(true);
      expect(mind(s).target).toMatchObject({ x: 2 + t.breakOffGapTiles + 4, y: 2 });
    });

    it(`${level}: a human who stays within reach is chased no longer than the maximum chase without a hit`, () => {
      const t = campaignTacticsFor(level).chase;
      const { s } = pursuing(level, [4, 2]);
      s.players[1]!.facing = 'right';
      // keep the human the same 2 tiles away: close, in reach, never hit (nothing swings: no bots here)
      let brokeAt = -1;
      for (let i = 0; i < t.maxChaseTicks + 60 && brokeAt < 0; i++) {
        tick(s, {});
        put(s, 0, 4, 2);
        if (mind(s).state !== 'pursue') brokeAt = i;
      }
      expect(brokeAt).toBeGreaterThanOrEqual(t.maxChaseTicks - 1);
      expect(brokeAt).toBeLessThan(t.maxChaseTicks + 60);
    });
  }

  it('a hit LANDED on the human restarts the maximum chase clock', () => {
    const t = campaignTacticsFor('normal').chase;
    const { s } = pursuing('normal', [4, 2]);
    for (let i = 0; i < t.maxChaseTicks - 30; i++) {
      tick(s, {});
      put(s, 0, 4, 2);
    }
    expect(mind(s).state).toBe('pursue');
    s.players[0]!.vitals!.hp -= 1; // it hurt him
    tick(s, {});
    for (let i = 0; i < 100; i++) {
      tick(s, {});
      put(s, 0, 4, 2);
    }
    expect(mind(s).state, 'the clock restarted: still on him past the old limit').toBe('pursue');
  });

  it('after a break-off it goes back to its route and is on patrol again within 12 s (the human has left the area)', () => {
    for (const level of LEVELS) {
      const { s, bots } = scene(level, [0, 10]);
      wait(s, 1000); // a few laps in
      const m = mind(s);
      m.state = 'pursue';
      m.since = s.tick;
      m.chaseSince = s.tick - campaignTacticsFor(level).chase.maxChaseTicks; // the maximum chase has run out
      m.lastSeen = { x: 12, y: 8 };
      m.lastSeenTick = s.tick;
      let brokeOff = -1;
      let backOnRoute = -1;
      for (let i = 0; i < 60 * 40 && backOnRoute < 0; i++) {
        stepScene(s, bots, {});
        put(s, 0, 0, 10); // he is gone: far away, out of sight
        const st = enemyMindView(s, 1);
        if (brokeOff < 0 && st !== 'pursue' && st !== 'alert') brokeOff = i;
        if (brokeOff >= 0 && (st === 'patrol' || st === 'watch')) backOnRoute = i;
      }
      expect(brokeOff, `${level} broke off at once`).toBeLessThanOrEqual(2);
      expect(backOnRoute, `${level} back on its route`).toBeGreaterThan(brokeOff);
      expect((backOnRoute - brokeOff) / 60, `${level} seconds back on route`).toBeLessThanOrEqual(12);
    }
  });
});

describe('after a break-off: the re-notice cooldown (RC3)', () => {
  const broken = (level: CampaignLevel) => {
    const r = scene(level, [0, 10]);
    wait(r.s, 1000);
    const m = mind(r.s);
    m.state = 'pursue';
    m.chaseSince = r.s.tick - campaignTacticsFor(level).chase.maxChaseTicks; // the maximum chase has run out
    m.lastSeen = { x: 6, y: 2 };
    m.lastSeenTick = r.s.tick;
    tick(r.s, {});
    expect(mind(r.s).state, 'it broke off').toBe('investigate');
    return r;
  };

  it('does not notice him by sight during the cooldown, then does', () => {
    const level: CampaignLevel = 'normal';
    const cd = campaignTacticsFor(level).chase.reNoticeCooldownTicks;
    const { s } = broken(level);
    put(s, 1, 2, 2);
    s.players[1]!.facing = 'right';
    put(s, 0, 7, 2); // in its cone, 5 tiles, in sight, not close
    mind(s).target = { x: 2, y: 2 };
    const ev = wait(s, cd - 10);
    expect(
      eventsOf(ev, 'enemyCue').some((e) => e.cue === 'alert'),
      'no alert in the cooldown',
    ).toBe(false);
    const later = wait(s, 80);
    expect(
      eventsOf(later, 'enemyCue').some((e) => e.cue === 'alert'),
      'it notices once the cooldown is over',
    ).toBe(true);
  });

  it('a human within closeTiles engages it at once, cooldown or not', () => {
    const { s } = broken('normal');
    put(s, 1, 2, 2);
    put(s, 0, 4, 2);
    const ev = wait(s, 3);
    expect(eventsOf(ev, 'enemyCue').some((e) => e.cue === 'alert')).toBe(true);
  });

  it('a hit on it engages it at once, cooldown or not (a blast, a punch)', () => {
    const { s } = broken('normal');
    put(s, 1, 2, 2);
    put(s, 0, 0, 10);
    s.players[1]!.vitals!.hp -= 1;
    const ev = wait(s, 3);
    expect(eventsOf(ev, 'enemyCue').some((e) => e.cue === 'alert')).toBe(true);
  });
});

describe("a hit restarts a BOUNDED chase; the leash is the territory's, not the post's (RC3, SA6)", () => {
  it('hit from far beyond the leash: it comes for him, but only for the bounded hit chase, then gives up', () => {
    const level: CampaignLevel = 'normal';
    const cfg = campaignTacticsFor(level);
    const { s } = scene(level, [0, 10], [2, 2], false);
    s.players[1]!.vitals!.hp -= 1; // a blast from afar
    let pursuing = 0;
    for (let i = 0; i < 60 * 30; i++) {
      tick(s, {});
      put(s, 0, 0, 10); // he stays far away (a long lane)
      const st = mind(s).state;
      if (st === 'pursue' || st === 'alert') pursuing++;
    }
    expect(pursuing, 'it did chase').toBeGreaterThan(0);
    expect(pursuing, 'but never longer than the bounded hit chase + the alert beat').toBeLessThanOrEqual(
      cfg.territory.hitChaseTicks + cfg.awareness.alertTicks + 10,
    );
  });

  it('the leash is measured from the territory (patrol waypoints), not from the post', () => {
    const level: CampaignLevel = 'normal';
    const cfg = campaignTacticsFor(level);
    const { s } = scene(level, [0, 10], [2, 2], true);
    const m = mind(s);
    // a point near the FAR waypoint (12, 8) is inside the territory although it is far from the post (2, 2)
    expect(m.spec.anchors.some((a) => a.x === 12 && a.y === 8)).toBe(true);
    const nearPost = Math.max(...[[12, 8]].map(([x, y]) => Math.max(Math.abs(x! - 2), Math.abs(y! - 2))));
    expect(nearPost).toBeGreaterThan(m.spec.leashTiles - 4);
    expect(m.spec.leashTiles).toBe(m.spec.pursuitTiles + cfg.territory.leashSlack);
  });
});
