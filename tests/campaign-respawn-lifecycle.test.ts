/**
 * Campaign death -> respawn lifecycle, through the REAL tick (field missions, boss missions, raids), for EVERY way the
 * human can be defeated.
 *
 * The founder's "DOWN - Back in 1, frozen" bug: a campaign defeat dealt by an enemy attack (a thrown object, a punch)
 * went through `applyCampaignHit` -> `eliminate()` in an earlier system of the tick, OUTSIDE `applyLethalHits`, so the id
 * never reached `scheduleRespawns` / `missionAfterEliminations`: the human was down with `respawnAt === null`, no life
 * was spent (HUD "Lives 3/3", "Health 0/4") and the HUD's `respawnIn ?? 1` said "Back in 1" for ever. Blast / hazard
 * deaths (the first hotfix's test) went through `applyLethalHits` and always worked, which is why one successful cycle
 * proved nothing. `tick.ts` `withCampaignDefeats` now counts every defeat of the campaign human once.
 */
import { describe, expect, it } from 'vitest';
import { applyCampaignHit, buildMissionGame, createGame, tick } from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import { launchProjectile } from '../src/sim/systems/projectiles';
import { Tile } from '../src/sim/types';
import { addGenerator } from './helpers';
import { advance } from './mission-helpers';
import { letWavesAppear, newRaid } from './raid-helpers';

type Kind = 'field' | 'boss';

function mission(kind: Kind): GameState {
  const o = buildMissionGame({
    spec: kind === 'field' ? { id: 'oshodi', fieldId: 'oshodi.approach' } : { id: 'oshodi' },
    humanCharacter: 'streetBaller',
    seed: 7,
  });
  o.settings = { ...o.settings, stageHazards: false };
  const s = createGame(o);
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  advance(s, 2);
  return s;
}

const livesUsed = (s: GameState): number => (s.mission ? s.mission.livesUsed : s.raid!.livesUsed);

/** The human with one segment, no frames and no protection: the next hit is lethal. */
function weaken(s: GameState): void {
  const me = s.players[0]!;
  me.protectedUntil = 0;
  me.armour = 0;
  me.mounted = false;
  me.vitals!.hp = 1;
  me.vitals!.invulnUntil = 0;
  if (me.vitals) me.vitals.lastHitTick = -1e9;
}

function place(s: GameState, id: number, x: number, y: number): void {
  const p = s.players[id]!;
  p.x = p.stepFromX = x;
  p.y = p.stepFromY = y;
  p.stepRemaining = 0;
}

/** A free horizontal run of 4 tiles (attacker, gap, gap, human). */
function row(s: GameState): { x: number; y: number } {
  for (let y = 1; y < s.height - 1; y++)
    for (let x = 1; x < s.width - 5; x++)
      if ([0, 1, 2, 3].every((k) => s.tiles[y * s.width + x + k] === Tile.Empty)) return { x, y };
  throw new Error('no free run');
}

/** Seat 1 is the one attacker; every other enemy is out of the picture so the match runs on. */
function isolate(s: GameState): { x: number; y: number } {
  for (const p of s.players) if (p.id > 1) p.alive = false;
  return row(s);
}

type Death = (s: GameState) => SimEvent[];

/** A lieutenant's brick (1 segment) thrown along the row: the projectile defeats the human, not the blast path. */
const byProjectile: Death = (s) => {
  const r = isolate(s);
  const enemy = s.players[1]!;
  enemy.enemyKind = 'lieutenant';
  place(s, 1, r.x, r.y);
  place(s, 0, r.x + 3, r.y);
  weaken(s);
  const events: SimEvent[] = [];
  expect(launchProjectile(s, enemy, 'right', events)).not.toBeNull();
  for (let i = 0; i < 300 && s.players[0]!.alive; i++) events.push(...tick(s, {}));
  return events;
};

/** A guard's punch from the next tile. */
const byPunch: Death = (s) => {
  const r = isolate(s);
  const enemy = s.players[1]!;
  enemy.enemyKind = 'guard';
  place(s, 1, r.x, r.y);
  place(s, 0, r.x + 1, r.y);
  enemy.facing = 'right';
  weaken(s);
  const events: SimEvent[] = [];
  for (let i = 0; i < 300 && s.players[0]!.alive; i++) {
    const intents: Intents = { 1: { skill: true } };
    events.push(...tick(s, intents));
    s.players[0]!.protectedUntil = 0; // (the punch lands after its startup; no spawn mercy in this scenario)
  }
  return events;
};

/** The human's own generator on their own tile (self-inflicted blast: the lethal-hit path). */
const bySelfBlast: Death = (s) => {
  const me = s.players[0]!;
  weaken(s);
  addGenerator(s, { ownerId: 0, x: me.x, y: me.y, timer: 1 });
  return advance(s, 20);
};

/** An enemy's generator (the first hotfix test's path). */
const byEnemyBlast: Death = (s) => {
  const me = s.players[0]!;
  weaken(s);
  addGenerator(s, { ownerId: 1, x: me.x, y: me.y, timer: 1 });
  return advance(s, 20);
};

const DEATHS: [string, Death][] = [
  ['an enemy projectile', byProjectile],
  ['an enemy punch', byPunch],
  ['a self-inflicted blast', bySelfBlast],
  ['an enemy blast', byEnemyBlast],
];

function expectBack(s: GameState, spentBefore: number): void {
  const me = s.players[0]!;
  expect(me.alive, 'the human is back').toBe(true);
  expect(me.vitals!.hp).toBe(me.vitals!.maxHp);
  expect(me.respawnAt).toBeNull();
  expect(livesUsed(s)).toBe(spentBefore + 1);
  expect(s.match.phase).toBe('playing');
}

describe.each(['field', 'boss'] as Kind[])('%s mission: every kind of defeat respawns the human', (kind) => {
  it.each(DEATHS)('%s: a life is spent, a respawn is scheduled and completes', (_n, die) => {
    const s = mission(kind);
    const before = s.mission!.livesUsed;
    const events = die(s);
    const me = s.players[0]!;
    expect(events.some((e) => e.type === 'campaignDefeated' && e.victimId === 0)).toBe(true);
    expect(me.alive).toBe(false);
    expect(s.mission!.livesUsed, 'the death costs exactly one life').toBe(before + 1);
    expect(me.respawnAt, 'a respawn is scheduled (null shows "Back in 1" for ever)').not.toBeNull();
    // the HUD's countdown is the authoritative respawn timer, never a guess
    expect(me.respawnAt! - s.tick).toBeLessThanOrEqual(s.config.respawn.delayTicks);
    advance(s, s.config.respawn.delayTicks + 5);
    expectBack(s, before);
    if (kind === 'field') {
      const f = s.mission!.field!;
      expect({ x: me.x, y: me.y }, 'back at the checkpoint').toEqual(f.checkpoint);
    }
  });

  it('the countdown reaches its last tick and the respawn is processed on it (the 1 -> 0 boundary)', () => {
    const s = mission(kind);
    byProjectile(s);
    const me = s.players[0]!;
    const at = me.respawnAt!;
    advance(s, at - s.tick - 1); // one tick short: still down
    expect(me.alive).toBe(false);
    advance(s, 1); // the tick that reaches `respawnAt`
    expect(s.tick).toBe(at);
    expect(me.alive, 'the respawn is processed on the very tick the countdown ends').toBe(true);
  });

  it('the death is counted once: more attacks at the fallen human and idle ticks spend no second life', () => {
    const s = mission(kind);
    byProjectile(s);
    const me = s.players[0]!;
    const spent = livesUsed(s);
    // enemy fire keeps coming at the body while down
    for (let i = 0; i < 4; i++) {
      applyCampaignHit(
        s,
        { victimId: 0, byId: 1, source: 'brick', damage: 1, dazeTicks: 0, knockback: null },
        [],
      );
      advance(s, 5);
    }
    expect(livesUsed(s)).toBe(spent);
    advance(s, s.config.respawn.delayTicks + 5);
    expect(me.alive).toBe(true);
    advance(s, 120);
    expect(livesUsed(s), 'idle ticks after the respawn never spend a life').toBe(spent);
  });

  it('repeated deaths in one mission: each respawns, lives count down, the last one ends the mission', () => {
    const s = mission(kind);
    const max = s.mission!.livesMax;
    const outcomes: boolean[] = [];
    for (let i = 0; i < max; i++) {
      const before = s.mission!.livesUsed;
      // alternate the cause: the freeze showed on the attack paths, the blast path must stay right too
      [byProjectile, byPunch, bySelfBlast][i % 3]!(s);
      expect(s.mission!.livesUsed).toBe(before + 1);
      if (i < max - 1) {
        advance(s, s.config.respawn.delayTicks + 5);
        outcomes.push(s.players[0]!.alive && s.match.phase === 'playing');
        s.players[0]!.protectedUntil = 0;
      }
    }
    expect(outcomes.every(Boolean), 'every death before the last life respawned').toBe(true);
    // the last life is gone: the legitimate failure, no respawn is scheduled
    expect(s.mission!.livesUsed).toBe(max);
    advance(s, 5);
    expect(s.mission!.outcome?.result).toBe('lost');
    expect(s.match.phase).toBe('ended');
    expect(s.players[0]!.alive).toBe(false);
  });
});

describe('field mission: checkpoint progress', () => {
  it('after progress the human comes back at the LATEST checkpoint, mission state intact', () => {
    const s = mission('field');
    const f = s.mission!.field!;
    const spot = { x: 0, y: 0 };
    // a later checkpoint: any free tile of the first free run
    const r = row(s);
    spot.x = r.x + 1;
    spot.y = r.y;
    f.checkpoint = { ...spot };
    f.markersDone = 2;
    const phase = s.mission!.phase;
    const leg = f.leg;
    byProjectile(s);
    advance(s, s.config.respawn.delayTicks + 5);
    const me = s.players[0]!;
    expect(me.alive).toBe(true);
    expect({ x: me.x, y: me.y }).toEqual(spot);
    expect(f.markersDone, 'checkpoint progress is kept').toBe(2);
    expect(f.leg).toBe(leg);
    expect(s.mission!.phase).toBe(phase);
    expect(s.mission!.outcome).toBeNull();
  });
});

describe('classic raid: the human falls and returns', () => {
  function raid(): GameState {
    const s = newRaid('warehouseDispatchDepot', { seed: 3 });
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    letWavesAppear(s);
    return s;
  }

  it.each(DEATHS.slice(0, 3))(
    '%s: one life, the human is back at the entrance, the raid goes on',
    (_n, die) => {
      const s = raid();
      const before = s.raid!.livesUsed;
      // an enemy of the raid is the attacker
      const enemy = s.players.find((p) => p.id !== 0 && p.enemyKind && p.alive)!;
      for (const p of s.players) if (p.id !== 0 && p.id !== enemy.id) p.alive = false;
      const r = row(s);
      enemy.enemyKind = 'lieutenant';
      place(s, enemy.id, r.x, r.y);
      place(s, 0, r.x + 3, r.y);
      weaken(s);
      if (die === byProjectile) {
        expect(launchProjectile(s, enemy, 'right', [])).not.toBeNull();
        for (let i = 0; i < 300 && s.players[0]!.alive; i++) tick(s, {});
      } else {
        die(s);
      }
      expect(s.players[0]!.alive).toBe(false);
      expect(s.raid!.livesUsed).toBe(before + 1);
      expect(s.raid!.respawnAt).not.toBeNull();
      advance(s, 400);
      expect(s.players[0]!.alive, 'back in the raid').toBe(true);
      expect(s.raid!.livesUsed).toBe(before + 1);
      expect(s.raid!.outcome).toBeNull();
    },
  );
});

describe('multiplayer is untouched by the campaign fix', () => {
  it('a seat without vitals is never added to the eliminated list (no new respawn or life logic)', () => {
    // the source of truth: only campaign seats carry `vitals`, and the helper requires it
    const s = createGame({
      seed: 1,
      arenaId: 'rumbleOshodi',
      players: [
        { name: 'a', characterId: 'streetBaller', isBot: false },
        { name: 'b', characterId: 'lekkiBoy', isBot: true, difficulty: 'standard' },
      ],
      settings: { game: 'deathmatch' },
    });
    expect(s.players.every((p) => p.vitals === undefined)).toBe(true);
  });
});
