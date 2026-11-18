/**
 * The boss recipe and its exposure loop (decisions BX1-BX8, docs/CAMPAIGN_SECTOR_AI.md "Bosses"): every broken phase
 * exposes the boss; he walks to his anchor and is committed there while he restores his shield; a blast that reaches
 * him costs one hit (three in all, the last eliminates him); a punch only interrupts the restore; a missed window
 * rebuilds the same phase; the level sets the window, the crew he calls and whether his escorts cover him. Unit
 * scenarios run with the crew idle (no bot intents); the fights at the end use the real boss and crew bots.
 */
import { describe, expect, it } from 'vitest';
import {
  ENEMY_VARIANTS,
  MISSION_DEFS,
  MISSION_IDS,
  observe,
  buildMissionGame,
  createGame,
  missionView,
  tick,
  tuningFor,
} from '../src/sim';
import type { CampaignLevel, GameState, MissionId, SimEvent } from '../src/sim';
import { DEFAULT_BOSS_RECIPE } from '../src/sim/mission/boss';
import { directiveFor } from '../src/sim/mission/directives';
import { Tile } from '../src/sim/types';
import { addGenerator } from './helpers';
import { advance, blastAt, hitBoss, newMission, of, put } from './mission-helpers';
import { SeatPerception } from '../src/ai/seatPerception';

const AWAY = { x: 30, y: 30 };
const LEVELS: CampaignLevel[] = ['easy', 'normal', 'hard'];

/** A mission at a campaign level, crates cleared, stage off, playing (as `newMission`, with the level's layers). */
function missionAt(id: MissionId, level: CampaignLevel, seed = 3): GameState {
  const options = buildMissionGame({ spec: { id }, humanCharacter: 'streetBaller', seed, level });
  options.settings = { ...options.settings, stageHazards: false };
  const state = createGame(options);
  state.tiles = state.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  state.hidden = {};
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  return state;
}

/** Breaks Oshodi's current phase with blasts (every live relay, the human well away). */
function breakPhase(state: GameState, sink: SimEvent[] = []): SimEvent[] {
  const m = state.mission!;
  for (const n of m.nodes) if (m.phaseState === 'active' && !n.done) blastAt(state, n.x, n.y, AWAY, sink);
  return sink;
}

// ------------------------------------------------------------------ the recipe

describe('the boss recipe (data, BX1/BX6)', () => {
  it('every boss has one: three hits, a window per level (Easy longest), windows to spare, an anchor', () => {
    for (const id of MISSION_IDS) {
      const r = MISSION_DEFS[id].recipe;
      expect(r.hits, id).toBe(3);
      expect(r.exposeSec.easy).toBeGreaterThan(r.exposeSec.normal);
      expect(r.exposeSec.normal).toBeGreaterThan(r.exposeSec.hard);
      expect(r.exposeSec.hard).toBeGreaterThanOrEqual(12); // fair: travel plus a fuse fits
      expect(r.maxExposures).toBeGreaterThan(r.hits);
      expect(r.maxExposures).toBeLessThanOrEqual(5);
      expect(['post', 'lastBroken']).toContain(r.anchor);
      expect(r.interruptMax).toBeGreaterThan(0);
    }
    // distinct identities: two bosses come to the node broken last, the rest restore at their post
    expect(MISSION_IDS.filter((id) => MISSION_DEFS[id].recipe.anchor === 'lastBroken')).toEqual([
      'mushin',
      'lekki',
    ]);
  });

  it('resolved per level: the window shrinks, the call grows, escorts cover only on Hard', () => {
    for (const id of MISSION_IDS) {
      const [e, n, h] = LEVELS.map((l) => tuningFor({ id }, l));
      expect(e!.exposeTicks).toBeGreaterThan(n!.exposeTicks);
      expect(n!.exposeTicks).toBeGreaterThan(h!.exposeTicks);
      expect(e!.boss!.callCount).toBeLessThan(n!.boss!.callCount);
      expect(n!.boss!.callCount).toBeLessThanOrEqual(h!.boss!.callCount);
      expect([e!.boss!.escortCover, n!.boss!.escortCover, h!.boss!.escortCover]).toEqual([
        false,
        false,
        true,
      ]);
      // the default (no level) is Normal
      expect(tuningFor({ id })).toEqual(n);
    }
  });

  it('a mission reads its level from the campaign tactics layer it is built with', () => {
    for (const level of LEVELS) {
      const m = missionAt('oshodi', level).mission!;
      expect(m.tuning.boss!.level).toBe(level);
      expect(m.tuning.exposeTicks).toBe(60 * DEFAULT_BOSS_RECIPE.exposeSec[level]);
      expect(m.boss).toMatchObject({ hp: 3, maxHits: 3, shielded: true });
    }
  });
});

// ------------------------------------------------------------------ the exposure loop

describe('every broken phase exposes the boss (BX1)', () => {
  it('the window opens with an anchor and the hits; at his anchor he is committed until it closes', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const boss = state.players[1]!;
    const ev = breakPhase(state);
    const exposed = of(ev, 'bossExposed');
    expect(exposed).toHaveLength(1);
    const post = m.seats[1]!.post!;
    expect(exposed[0]).toMatchObject({ anchorX: post.x, anchorY: post.y, hitsLeft: 3 });
    advance(state, 2);
    const v = missionView(state)!;
    expect(v.phaseState).toBe('exposed');
    expect(v.boss).toMatchObject({
      exposed: true,
      hitsLeft: 3,
      maxHits: 3,
      anchor: post,
      restoring: true,
      exposeTotalTicks: m.tuning.exposeTicks,
    });
    expect(boss.rootedUntil).toBe(m.boss.exposedUntil); // committed: he can neither walk off nor plan an escape
    expect(v.callout).toMatch(/EXPOSED/);
    expect(v.callout).toMatch(/3 hits/);
  });

  it('the boss directive: hold the anchor while exposed, guard the post while shielded', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    expect(directiveFor(state, 1)!.kind).toBe('guard');
    breakPhase(state);
    expect(directiveFor(state, 1)).toMatchObject({ kind: 'block', x: m.boss.anchor!.x, y: m.boss.anchor!.y });
  });

  it('while he walks to his anchor the countdown waits, at most the walk grace', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    put(state, 1, 50, 5); // far from his post, and he stays put (no bot intents)
    breakPhase(state);
    const opened = m.boss.exposedAt!;
    const grace = m.tuning.boss!.walkGraceTicks;
    advance(state, opened + grace - 10 - state.tick);
    expect(m.boss.exposedUntil - state.tick).toBe(m.tuning.exposeTicks); // held while he walks
    expect(missionView(state)!.boss.restoring).toBe(false);
    advance(state, 60);
    expect(m.boss.exposedUntil).toBe(opened + grace + m.tuning.exposeTicks); // then it runs
  });
});

describe('a blast costs the exposed boss one hit; the last one eliminates him (BX2)', () => {
  it('hit: he survives, reels, re-shields and the next phase starts; three hits win', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const boss = state.players[1]!;
    breakPhase(state);
    const ev = hitBoss(state, AWAY);
    expect(boss.alive).toBe(true);
    expect(of(ev, 'bossHit')).toEqual([
      expect.objectContaining({ type: 'bossHit', byId: 0, hitsLeft: 2, maxHits: 3 }),
    ]);
    expect(of(ev, 'bossShielded').map((e) => e.reason)).toEqual(['phase']);
    expect(of(ev, 'missionPhase').map((e) => [e.phase, e.change])).toEqual([[1, 'started']]);
    expect(m.boss).toMatchObject({ hp: 2, shielded: true });
    expect(m.phase).toBe(1);
    expect(missionView(state)!.boss).toMatchObject({ hitsLeft: 2, exposed: false });
    // a shielded boss is untouchable again
    const again = hitBoss(state, AWAY);
    expect(of(again, 'bossHit')).toHaveLength(0);
    expect(m.boss.hp).toBe(2);
    // phases two and three, a hit each: the last one is the defeat
    breakPhase(state);
    hitBoss(state, AWAY);
    expect(m.phase).toBe(2);
    expect(m.boss.hp).toBe(1);
    breakPhase(state);
    expect(missionView(state)!.callout).toMatch(/One more blast/);
    const last = hitBoss(state, AWAY);
    expect(of(last, 'bossDefeated')).toHaveLength(1);
    expect(boss.alive).toBe(false);
    expect(m.outcome).toMatchObject({ result: 'won', phasesCleared: 3, defeat: 'eliminated' });
  });

  it('a hit is one per window: two blasts on the same tick cost one hit', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const boss = state.players[1]!;
    breakPhase(state);
    put(state, 0, AWAY.x, AWAY.y);
    addGenerator(state, { ownerId: 0, x: boss.x - 1, y: boss.y, timer: 1 });
    addGenerator(state, { ownerId: 0, x: boss.x + 1, y: boss.y, timer: 1 });
    const ev = advance(state, 45);
    expect(of(ev, 'bossHit')).toHaveLength(1);
    expect(m.boss.hp).toBe(2);
  });

  it('his own generator never costs him a hit', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const boss = state.players[1]!;
    breakPhase(state);
    const ev = blastAt(state, boss.x, boss.y, AWAY, [], 1);
    expect(of(ev, 'bossHit')).toHaveLength(0);
    expect(m.boss.hp).toBe(3);
    expect(m.phaseState).toBe('exposed');
  });
});

describe('melee interrupts, never decides (BX3)', () => {
  it('a punch on the exposed boss lengthens the window a bounded number of times; it never costs a hit', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const boss = state.players[1]!;
    breakPhase(state);
    put(state, 0, boss.x - 1, boss.y);
    state.players[0]!.facing = 'right';
    const before = m.boss.exposedUntil;
    const events: SimEvent[] = [];
    // punch whenever possible for the whole window
    for (let i = 0; i < m.tuning.exposeTicks + 400 && m.phaseState === 'exposed'; i++) {
      events.push(...tick(state, { 0: { special: true } }));
    }
    const interrupts = of(events, 'bossInterrupted');
    expect(interrupts.length).toBe(m.tuning.boss!.interruptMax);
    expect(interrupts[0]!.untilTick).toBe(before + m.tuning.boss!.interruptTicks);
    expect(of(events, 'attackResolved').filter((e) => e.hit && e.targetId === 1).length).toBeGreaterThan(
      m.tuning.boss!.interruptMax,
    );
    expect(of(events, 'bossHit')).toHaveLength(0);
    expect(m.boss.hp).toBe(3);
    expect(boss.alive).toBe(true);
    // the punches alone never finished the window: it ran out and the phase was rebuilt
    expect(of(events, 'bossShielded').map((e) => e.reason)).toEqual(['expired']);
    expect(m.phaseState).toBe('active');
  });
});

describe('a missed window rebuilds the same phase; the windows are bounded (BX1)', () => {
  it('phase two missed: phase two again, with fresh relays; the window count ends the mission', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    breakPhase(state);
    hitBoss(state, AWAY);
    breakPhase(state);
    const ev = advance(state, m.tuning.exposeTicks + 5);
    expect(of(ev, 'bossShielded').map((e) => e.reason)).toEqual(['expired']);
    expect(m.phase).toBe(1);
    expect(m.phasesCleared).toBe(1);
    expect(m.nodes.every((n) => !n.done)).toBe(true);
    expect(m.boss.hp).toBe(2);
    expect(state.players[1]!.rootedUntil).toBeLessThanOrEqual(state.tick);
    // spend the remaining windows: the boss gets away
    while (!m.outcome) {
      breakPhase(state);
      advance(state, m.tuning.exposeTicks + 5);
    }
    expect(m.outcome).toMatchObject({ result: 'lost', stars: 0 });
    expect(m.boss.exposures).toBe(m.tuning.maxExposures);
  });

  it('the clock still ends a mission inside a window; lives still end it', () => {
    const timed = newMission({ id: 'oshodi', timeLimitSec: 30 });
    breakPhase(timed);
    expect(timed.mission!.phaseState).toBe('exposed');
    advance(timed, 60 * 30);
    expect(timed.mission!.outcome).toMatchObject({ result: 'timeout' });
    const lives = newMission({ id: 'oshodi', lives: 1 });
    breakPhase(lives);
    const human = lives.players[0]!;
    addGenerator(lives, { ownerId: 2, x: human.x, y: human.y, timer: 1 });
    human.vitals!.hp = 1;
    advance(lives, 60);
    expect(lives.mission!.outcome).toMatchObject({ result: 'lost' });
  });
});

describe('levels: the crew he calls and escorts that cover him (BX6)', () => {
  it('Easy calls nobody, Normal one, Hard two fallen crew members when the window opens', () => {
    const called = LEVELS.map((level) => {
      const state = missionAt('oshodi', level);
      for (const id of [2, 5, 6, 7]) state.players[id]!.alive = false; // guard, two runners, the escort
      const ev = breakPhase(state);
      return of(ev, 'missionWarning').filter((e) => e.warning.kind === 'reinforce').length;
    });
    expect(called).toEqual([0, 1, 2]);
  });

  it('the window is the fairness lever: a generator laid 14 s into the window lands on Easy and Normal, not on Hard', () => {
    const landed = LEVELS.map((level) => {
      const state = missionAt('oshodi', level);
      const m = state.mission!;
      breakPhase(state);
      const boss = state.players[1]!;
      // the human arrives 14 s after the window opened and lays a generator beside the committed boss (3 s fuse)
      advance(state, m.boss.exposedAt! + 60 * 14 - state.tick);
      put(state, 0, boss.x + 1, boss.y);
      tick(state, { 0: { place: true } });
      put(state, 0, AWAY.x, AWAY.y);
      const ev = advance(state, 60 * 4);
      return of(ev, 'bossHit').length;
    });
    expect(landed).toEqual([1, 1, 0]);
  });

  it('Hard: the escort body-blocks the line between the exposed boss and the human; Normal: it follows him', () => {
    for (const level of ['normal', 'hard'] as const) {
      const state = missionAt('oshodi', level);
      breakPhase(state);
      put(state, 0, 40, 12);
      const escort = state.mission!.seats.find((s) => s.role === 'escort')!.playerId;
      const d = directiveFor(state, escort)!;
      if (level === 'hard') {
        expect(d.kind).toBe('block');
        expect(d.x).toBeGreaterThan(state.players[1]!.x); // towards the human (east of the boss)
      } else expect(d.kind).toBe('escort');
    }
  });
});

// ------------------------------------------------------------------ crew variants (BX8)

describe('crew variants: readable roles, perception only (BX8)', () => {
  it('every crew seat of every boss names a variant; the tactics layer carries them, the boss is a boss', () => {
    for (const id of MISSION_IDS) {
      for (const c of MISSION_DEFS[id].crew) expect(c.variant, `${id} ${c.name}`).toBeDefined();
      const t = createGame(buildMissionGame({ spec: { id }, humanCharacter: 'streetBaller', seed: 1 })).config
        .campaignTactics!;
      expect(t.seatVariant?.[1]).toBe('boss');
      expect(t.seatVariant?.[0]).toBeUndefined();
      MISSION_DEFS[id].crew.forEach((c, i) => {
        expect(t.seatVariant?.[2 + i]).toBe(c.variant);
        expect(t.seatPerception?.[2 + i]).toBe(ENEMY_VARIANTS[c.variant!].base);
      });
    }
  });

  it('a placement watcher (Ring security on Normal) notices a generator laid under the placer in its sight; a plain seat does not', () => {
    const s = newMission({ id: 'oshodi' });
    const escort = s.mission!.seats.find((x) => x.role === 'escort')!.playerId;
    const e = s.players[escort]!;
    // in plain sight, two tiles away along open floor with nobody in between
    const free = (x: number, y: number): boolean =>
      s.tiles[y * s.width + x] === Tile.Empty && !s.players.some((p) => p.alive && p.x === x && p.y === y);
    const [dx, dy] = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const
    ).find(([a, b]) => free(e.x + a, e.y + b) && free(e.x + 2 * a, e.y + 2 * b))!;
    put(s, 0, e.x + 2 * dx, e.y + 2 * dy);
    const g = addGenerator(s, { ownerId: 0, x: e.x + 2 * dx, y: e.y + 2 * dy, timer: 170 });
    g.placedTick = s.tick;
    const watcher = new SeatPerception('guard', 'ringSecurity');
    const plain = new SeatPerception('guard');
    // the human's body covers the generator: only the one who watched it laid knows it is there
    expect(watcher.perceive(observe(s, escort), () => undefined).generators.some((o) => o.id === g.id)).toBe(
      true,
    );
    expect(plain.perceive(observe(s, escort), () => undefined).generators.some((o) => o.id === g.id)).toBe(
      false,
    );
    // after its (keen) reaction it plans on the real fuse
    s.tick += 40;
    const later = watcher.perceive(observe(s, escort), () => undefined);
    expect(later.generators.find((o) => o.id === g.id)?.timer).toBe(170);
  });
});
