/**
 * THE CAMPAIGN TACTICS LAYER: where it is and where it is not (decisions SA3, SA9; docs/CAMPAIGN_SECTOR_AI.md).
 *
 *   present   every campaign FIELD mission and every BOSS mission, at the save's level (Easy / Normal / Hard)
 *   absent    raids (Classic raids keep their rules), the Training Academy (its Tactical Trap pilot is untouched), Classic,
 *             City Rumble (Survival / Deathmatch / Team), multiplayer and online: no key, no runtime, no telegraph event
 *   numbers   the readable commitment of every level: wind-ups, recoveries, cooldowns with a response window, group limits
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import {
  CAMPAIGN_TACTICS,
  CAMPAIGN_TACTICS_ENEMY_ATTACKS,
  ENEMY_KIND_IDS,
  ENEMY_VARIANTS,
  FIELD_MISSION_IDS,
  buildMissionGame,
  buildRaidGame,
  campaignTacticsFor,
  campaignTacticsLayer,
  createGame,
  mergeConfig,
  observe,
  tick,
} from '../src/sim';
import type { DeepPartial, GameConfig, GameOptions, Intents, MissionId, SimEvent } from '../src/sim';
import { DEFAULT_CONFIG } from '../src/sim/config';
import { getFieldMission } from '../src/sim/mission/fieldDefs';
import { RAID_IDS } from '../src/sim/raid';
import { LESSONS } from '../src/tutorial';

const BOSS_IDS: readonly MissionId[] = [
  'oshodi',
  'mushin',
  'fadeyiSomolu',
  'ebuteMetta',
  'lagosIsland',
  'lekki',
];

const LEVELS = ['easy', 'normal', 'hard'] as const;

function field(id: string, level?: (typeof LEVELS)[number]): GameOptions {
  return buildMissionGame({
    spec: { id: getFieldMission(id).districtId, fieldId: id },
    humanCharacter: 'streetBaller',
    seed: 3,
    ...(level ? { level } : {}),
  });
}

/** Plays `ticks` with bots in every bot seat and returns the events (the absence checks look at them). */
function play(
  options: GameOptions,
  ticks: number,
): { events: SimEvent[]; state: ReturnType<typeof createGame> } {
  const state = createGame(options);
  const bots = state.players.map((p) => createBot({ difficulty: 'casual', seed: 11 + p.id, playerId: p.id }));
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const intents: Intents = {};
    for (const p of state.players)
      if (p.alive && (p.isBot || p.id > 0)) intents[p.id] = bots[p.id]!.decide(observe(state, p.id));
    events.push(...tick(state, intents));
  }
  return { events, state };
}

describe('present in every campaign field and boss mission (SA3)', () => {
  it('all field missions (eleven, and the finale’s two) carry the Normal layer, minds for their territorial enemies and variants', () => {
    expect(FIELD_MISSION_IDS).toHaveLength(13);
    for (const id of FIELD_MISSION_IDS) {
      const s = createGame(field(id));
      expect(s.config.campaignTactics?.id, id).toBe(CAMPAIGN_TACTICS.id);
      expect(s.config.campaignTactics?.level, id).toBe('normal');
      expect('combatPilot' in s.config, id).toBe(false);
      const def = getFieldMission(id);
      const pursuers = new Set(def.legs.flatMap((l) => (l.kind === 'escapeRoute' ? [l.group] : [])));
      const minded = def.enemies.filter((e) => !pursuers.has(e.group)).length;
      expect(Object.keys(s.territory?.minds ?? {}), id).toHaveLength(minded);
      for (const p of s.players.slice(1)) {
        expect(p.enemyVariant, `${id} seat ${p.id}`).toBeDefined();
        expect(ENEMY_VARIANTS[p.enemyVariant!].base).toBe(p.enemyKind);
        expect(p.vitals!.maxHp).toBe(s.config.campaignTactics!.enemyHp[p.enemyKind!]);
      }
    }
  });

  it('the level picks the layer: Easy / Hard replace the Normal numbers; Normal adds no level config', () => {
    for (const level of LEVELS) {
      const s = createGame(field('oshodi.approach', level));
      expect(s.config.campaignTactics).toEqual(campaignTacticsFor(level));
      const melee = CAMPAIGN_TACTICS_ENEMY_ATTACKS[level].melee!.guard!;
      expect(s.config.enemyAttacks.melee.guard!.extraStartupTicks).toBe(melee.extraStartupTicks);
      expect(s.config.enemyAttacks.melee.guard!.recoveryRootTicks).toBe(melee.recoveryRootTicks);
    }
    expect(field('oshodi.approach', 'normal').config).toBeUndefined();
  });

  it('all six boss missions carry the layer with the perception kind of every generator-bot seat', () => {
    for (const id of BOSS_IDS) {
      for (const level of LEVELS) {
        const s = createGame(buildMissionGame({ spec: { id }, humanCharacter: 'lekkiBoy', seed: 2, level }));
        const t = s.config.campaignTactics!;
        expect(t.level, id).toBe(level);
        expect(t.seatPerception?.[1], id).toBe('boss');
        for (const p of s.players.slice(2)) expect(t.seatPerception?.[p.id], `${id} ${p.id}`).toBeDefined();
        expect(t.seatPerception?.[0]).toBeUndefined(); // never the human
        expect(s.players.some((p) => p.enemyKind)).toBe(false); // the boss fight stays a generator fight
      }
    }
  });
});

describe('absent everywhere else (SA3): rules, state and events exactly as before', () => {
  it('every raid, standalone or behind a door, at every level', () => {
    for (const raidId of RAID_IDS) {
      for (const level of LEVELS) {
        const s = createGame(buildRaidGame({ raidId, humanCharacter: 'streetBaller', seed: 1, level }));
        expect('campaignTactics' in s.config, raidId).toBe(false);
        expect('territory' in s, raidId).toBe(false);
      }
    }
  });

  it('the Training Academy: the Generator Tactics lessons keep the pilot, no lesson carries the campaign layer', () => {
    for (const l of LESSONS) {
      const s = l.practice.build('streetBaller');
      expect('campaignTactics' in s.config, l.id).toBe(false);
      expect('territory' in s, l.id).toBe(false);
    }
  });

  it('Classic and the three City Rumble rulesets: no key, no minds, no enemyCue event while bots play', () => {
    const players = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `B${i}`,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
        isBot: true,
      }));
    const matches: GameOptions[] = [
      { seed: 12345, players: players(4), settings: { mode: 'crush' } },
      { seed: 5, arenaId: 'rumbleMushin', players: players(6), settings: { game: 'survival' } },
      { seed: 6, arenaId: 'rumbleOshodi', players: players(6), settings: { game: 'deathmatch' } },
      { seed: 7, arenaId: 'rumbleLagosIsland', players: players(6), settings: { game: 'team' } },
    ];
    for (const o of matches) {
      const { events, state } = play(o, 600);
      expect('campaignTactics' in state.config).toBe(false);
      expect('territory' in state).toBe(false);
      expect(events.some((e) => e.type === 'enemyCue')).toBe(false);
    }
  });

  it('the default config never names it (online and multiplayer build from it)', () => {
    expect('campaignTactics' in DEFAULT_CONFIG).toBe(false);
    expect('campaignTactics' in mergeConfig(DEFAULT_CONFIG, {})).toBe(false);
  });
});

describe('readable commitment at every level (SA7)', () => {
  const windup = (cfg: GameConfig, kind: (typeof ENEMY_KIND_IDS)[number]): number => {
    const m = cfg.enemyAttacks.melee[kind]!;
    return cfg.skills.attacks[m.attack].startupTicks + m.extraStartupTicks;
  };
  const cfgOf = (level: (typeof LEVELS)[number]): GameConfig =>
    mergeConfig(DEFAULT_CONFIG, campaignTacticsLayer(level) as unknown as DeepPartial<GameConfig>);

  it('ordinary wind-ups are about 1.0 s on Easy, 0.8 s on Normal and never below 0.6 s on Hard', () => {
    const ordinary = ['agbero', 'guard'] as const;
    for (const kind of ordinary) {
      expect(windup(cfgOf('easy'), kind)).toBe(60);
      expect(windup(cfgOf('normal'), kind)).toBe(48);
      expect(windup(cfgOf('hard'), kind)).toBeGreaterThanOrEqual(36);
    }
    for (const kind of ENEMY_KIND_IDS) {
      expect(windup(cfgOf('easy'), kind)).toBeGreaterThan(windup(cfgOf('normal'), kind));
      expect(windup(cfgOf('normal'), kind)).toBeGreaterThan(windup(cfgOf('hard'), kind));
      if (kind !== 'lieutenant' && kind !== 'boss')
        expect(windup(cfgOf('hard'), kind)).toBeGreaterThanOrEqual(36);
    }
  });

  it('a visible recovery of 0.8-1.2 s after every ordinary punch, and every cooldown leaves a response window', () => {
    for (const level of LEVELS) {
      const cfg = cfgOf(level);
      const gap = cfg.campaignTactics!.attack.responseGapTicks;
      for (const kind of ENEMY_KIND_IDS) {
        const m = cfg.enemyAttacks.melee[kind]!;
        if (kind === 'thrower') {
          expect(m.recoveryRootTicks, `${level} ${kind}`).toBeGreaterThanOrEqual(36);
          expect(m.recoveryRootTicks, `${level} ${kind}`).toBeLessThanOrEqual(48);
        }
        // decision RC4: an ordinary brawler stays planted 0.8-1.2 s after its swing (Hard 48, Normal 60, Easy 72 ticks)
        if (kind === 'agbero' || kind === 'guard') {
          expect(m.recoveryRootTicks, `${level} ${kind}`).toBeGreaterThanOrEqual(48);
          expect(m.recoveryRootTicks, `${level} ${kind}`).toBeLessThanOrEqual(72);
        }
        expect(m.cooldownTicks, `${level} ${kind}`).toBeGreaterThan(
          windup(cfg, kind) + m.recoveryRootTicks + gap,
        );
      }
      // throwers: a readable cue and a recovery; a throw cooldown that leaves the window too
      const bottle = cfg.enemyAttacks.projectiles.bottle;
      expect(bottle.warnTicks).toBeGreaterThanOrEqual(36);
      expect(cfg.enemyAttacks.throwRecoveryTicks.thrower).toBeGreaterThanOrEqual(36);
      expect(bottle.cooldownTicks).toBeGreaterThan(
        bottle.warnTicks + cfg.enemyAttacks.throwRecoveryTicks.thrower + gap,
      );
    }
  });

  it('group coordination limits: one wind-up at a time on Easy, two staggered ones on Normal and Hard', () => {
    expect(cfgOf('easy').enemyAttacks.maxGroupPunches).toBe(1);
    expect(cfgOf('normal').enemyAttacks.maxGroupPunches).toBe(2);
    expect(cfgOf('hard').enemyAttacks.maxGroupPunches).toBe(2);
    expect(cfgOf('easy').enemyAttacks.groupPunchGapTicks).toBeGreaterThan(
      cfgOf('normal').enemyAttacks.groupPunchGapTicks,
    );
    expect(cfgOf('normal').enemyAttacks.groupPunchGapTicks).toBeGreaterThan(
      cfgOf('hard').enemyAttacks.groupPunchGapTicks,
    );
    for (const level of LEVELS) expect(cfgOf(level).enemyAttacks.victimFreeTicks).toBeGreaterThanOrEqual(54);
  });

  it('Hard adds strategy, not just speed: wider senses, longer pursuit, coordination, cover, livelier patrols', () => {
    const [e, n, h] = LEVELS.map(campaignTacticsFor);
    for (const kind of ENEMY_KIND_IDS) {
      expect(e!.perception[kind].visionTiles).toBeLessThan(n!.perception[kind].visionTiles);
      expect(n!.perception[kind].visionTiles).toBeLessThan(h!.perception[kind].visionTiles);
      expect(e!.perception[kind].reactTicks).toBeGreaterThan(h!.perception[kind].reactTicks);
    }
    expect(e!.territory.pursuitTiles).toBeLessThan(n!.territory.pursuitTiles);
    expect(n!.territory.pursuitTiles).toBeLessThan(h!.territory.pursuitTiles);
    expect([e!.territory.groupTactics, n!.territory.groupTactics, h!.territory.groupTactics]).toEqual([
      false,
      true,
      true,
    ]);
    expect([e!.territory.alertAlliesScale, h!.territory.alertAlliesScale]).toEqual([0, 1.25]);
    expect([e!.territory.coverTiles, n!.territory.coverTiles, h!.territory.coverTiles]).toEqual([0, 3, 4]);
    // decision RC2/RC5: routes stay readable on every level (clockwork on Easy, a little jitter on Normal and Hard; no
    // reversing laps), so Hard's difficulty is sharper senses and a longer chase, never an unreadable route
    expect([
      e!.territory.patrolJitterTicks,
      n!.territory.patrolJitterTicks,
      h!.territory.patrolJitterTicks,
    ]).toEqual([0, 6, 12]);
    expect(h!.territory.reversePatrol).toBe(false);
    expect(h!.trapSense.basic.seesPlacement).toBe(true);
    expect(n!.trapSense.basic.seesPlacement).toBe(false);
  });
});
