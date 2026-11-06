/**
 * Campaign difficulty levels (Easy / Normal / Hard; docs/CAMPAIGN_DIFFICULTY.md, decisions CL1-CL7): the level table,
 * what each level changes in a REAL mission and raid, that Normal is byte-for-byte the campaign as it was, that the
 * death / lives / respawn rules are the same on every level, that multiplayer and Rumble never see a level, the save
 * (round trip, old saves, damaged values) and the pure `setCampaignLevel`.
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_CONFIG,
  CAMPAIGN_LEVELS,
  CAMPAIGN_LEVEL_DEFS,
  DEFAULT_CAMPAIGN_LEVEL,
  applyCampaignHit,
  buildMissionGame,
  createGame,
  levelConfigLayer,
  levelMaxHp,
  tick,
} from '../src/sim';
import type { CampaignLevel, SimEvent } from '../src/sim';
import { buildRaidGame } from '../src/sim/raid/build';
import { campaignConfig } from '../src/sim/config';
import { createSave, repairSave, setCampaignLevel, setLoadout } from '../src/campaign';
import { advance, hashOf, put } from './mission-helpers';
import { Tile } from '../src/sim/types';

const SPEC = { id: 'oshodi', modifiers: [] } as const;

function mission(level?: CampaignLevel) {
  const options = buildMissionGame({
    spec: { ...SPEC, modifiers: [] },
    humanCharacter: 'streetBaller',
    seed: 3,
    ...(level ? { level } : {}),
  });
  options.settings = { ...options.settings, stageHazards: false };
  const state = createGame(options);
  state.tiles = state.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  state.hidden = {};
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  return state;
}

describe('the level table', () => {
  it('has exactly Easy, Normal, Hard and Normal is the default', () => {
    expect([...CAMPAIGN_LEVELS]).toEqual(['easy', 'normal', 'hard']);
    expect(DEFAULT_CAMPAIGN_LEVEL).toBe('normal');
    for (const l of CAMPAIGN_LEVELS) {
      expect(CAMPAIGN_LEVEL_DEFS[l].summary.length).toBeGreaterThan(20);
    }
  });

  it('Easy is more forgiving than Normal and Hard is less, in every number it changes', () => {
    const cfg = (l: CampaignLevel) => levelConfigLayer(l)?.campaign ?? CAMPAIGN_CONFIG;
    const hp = (l: CampaignLevel) => levelMaxHp(CAMPAIGN_CONFIG.playerMaxHp, l);
    expect(hp('easy')).toBeGreaterThan(hp('normal'));
    expect(hp('hard')).toBeLessThan(hp('normal'));
    expect(hp('normal')).toBe(4);
    expect(cfg('easy').invulnTicks).toBeGreaterThan(cfg('normal').invulnTicks);
    expect(cfg('hard').invulnTicks).toBeLessThan(cfg('normal').invulnTicks);
    for (const k of ['blast', 'vehicle', 'hazard', 'trap'] as const) {
      expect(cfg('easy').damage[k]).toBeLessThanOrEqual(cfg('normal').damage[k]);
      expect(cfg('hard').damage[k]).toBeGreaterThanOrEqual(cfg('normal').damage[k]);
    }
    expect(cfg('easy').healBonus).toBeGreaterThan(cfg('normal').healBonus ?? 1);
    // no level can make a lethal event kill outright from full health
    for (const l of CAMPAIGN_LEVELS) {
      for (const k of ['blast', 'vehicle', 'hazard', 'trap'] as const) {
        expect(cfg(l).damage[k]).toBeLessThan(hp(l));
      }
    }
  });

  it('Normal adds nothing: the options and the whole state are identical to a build without a level', () => {
    expect(levelConfigLayer('normal')).toBeUndefined();
    expect(levelConfigLayer(undefined)).toBeUndefined();
    const plain = buildMissionGame({
      spec: { ...SPEC, modifiers: [] },
      humanCharacter: 'streetBaller',
      seed: 3,
    });
    const normal = buildMissionGame({
      spec: { ...SPEC, modifiers: [] },
      humanCharacter: 'streetBaller',
      seed: 3,
      level: 'normal',
    });
    expect(normal).toEqual(plain);
    expect(hashOf(createGame(normal))).toBe(hashOf(createGame(plain)));
    expect(campaignConfig(createGame(normal).config)).toEqual(CAMPAIGN_CONFIG);
  });
});

describe('what a level does in a real mission', () => {
  it.each(CAMPAIGN_LEVELS)(
    '%s: the human starts with the level health and the level tuning is in force',
    (l) => {
      const s = mission(l);
      const human = s.players[0]!;
      expect(human.vitals!.maxHp).toBe(levelMaxHp(4, l));
      expect(human.vitals!.hp).toBe(human.vitals!.maxHp);
      expect(campaignConfig(s.config).invulnTicks).toBe(
        (levelConfigLayer(l)?.campaign ?? CAMPAIGN_CONFIG).invulnTicks,
      );
      // the boss and the crew are the same on every level
      expect(s.players.slice(1).map((p) => [p.characterId, p.isBot])).toEqual(
        mission()
          .players.slice(1)
          .map((p) => [p.characterId, p.isBot]),
      );
    },
  );

  it('a blast takes 1 / 2 / 2 segments and the same number of blasts is survivable differently', () => {
    const taken = (l: CampaignLevel): number => {
      const s = mission(l);
      const ev: SimEvent[] = [];
      applyCampaignHit(
        s,
        {
          victimId: 0,
          byId: null,
          source: 'blast',
          damage: campaignConfig(s.config).damage.blast,
          dazeTicks: 0,
          knockback: null,
        },
        ev,
      );
      return s.players[0]!.vitals!.maxHp - s.players[0]!.vitals!.hp;
    };
    expect([taken('easy'), taken('normal'), taken('hard')]).toEqual([1, 2, 2]);
  });

  it('death rules are identical: zero health eliminates once, uses one life and the same respawn on every level', () => {
    const outcomes = CAMPAIGN_LEVELS.map((l) => {
      const s = mission(l);
      put(s, 0, 2, 2);
      const ev: SimEvent[] = [];
      const hp = s.players[0]!.vitals!.maxHp;
      const r = applyCampaignHit(
        s,
        {
          victimId: 0,
          byId: null,
          source: 'hazard',
          damage: hp,
          dazeTicks: 0,
          knockback: null,
        },
        ev,
        { terminal: true },
      );
      advance(s, 240);
      const human = s.players[0]!;
      return {
        result: r,
        defeats: ev.filter((e) => e.type === 'campaignDefeated').length,
        livesUsed: s.mission!.livesUsed,
        livesMax: s.mission!.livesMax,
        alive: human.alive,
        fullHealthAgain: human.vitals!.hp === human.vitals!.maxHp,
        matchPhase: s.match.phase,
      };
    });
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[2]).toEqual(outcomes[1]);
    expect(outcomes[1]!.defeats).toBe(1);
    expect(outcomes[1]!.livesMax).toBe(3);
  });
});

describe('raids', () => {
  it('a raid honours the level for the health the human brings in and for what a heal room gives', () => {
    const base = buildRaidGame({ raidId: 'warehouseDispatchDepot', humanCharacter: 'streetBaller', seed: 5 });
    const easy = buildRaidGame({
      raidId: 'warehouseDispatchDepot',
      humanCharacter: 'streetBaller',
      seed: 5,
      level: 'easy',
    });
    const hard = buildRaidGame({
      raidId: 'warehouseDispatchDepot',
      humanCharacter: 'streetBaller',
      seed: 5,
      level: 'hard',
    });
    const normal = buildRaidGame({
      raidId: 'warehouseDispatchDepot',
      humanCharacter: 'streetBaller',
      seed: 5,
      level: 'normal',
    });
    expect(normal).toEqual(base);
    expect(base.players[0]!.maxHp).toBe(4);
    expect(easy.players[0]!.maxHp).toBe(5);
    expect(hard.players[0]!.maxHp).toBe(3);
    expect(campaignConfig(createGame(easy).config).healBonus).toBe(2);
    expect(campaignConfig(createGame(base).config).healBonus).toBeUndefined();
    expect(createGame(hard).players[0]!.vitals!.maxHp).toBe(3);
  });
});

describe('multiplayer and Rumble never see a level', () => {
  it('ordinary matches carry no campaign tuning and no vitals', () => {
    for (const settings of [{ game: 'classic' as const }, { game: 'survival' as const }]) {
      const s = createGame({
        seed: 1,
        arenaId: settings.game === 'survival' ? 'rumbleOshodi' : undefined,
        players: [
          { name: 'A', characterId: 'streetBaller', isBot: false },
          { name: 'B', characterId: 'lekkiBoy', isBot: true, difficulty: 'rookie' },
        ],
        settings,
      });
      expect(s.config.campaign).toBeUndefined();
      expect(s.players.every((p) => p.vitals === undefined)).toBe(true);
      tick(s, {});
    }
  });
});

describe('the save', () => {
  it('a new save is Normal', () => {
    expect(createSave(1).campaignLevel).toBe('normal');
  });

  it('survives a JSON round trip at every level', () => {
    for (const l of CAMPAIGN_LEVELS) {
      const saved = setCampaignLevel(createSave(1), l, 2);
      expect(repairSave(JSON.parse(JSON.stringify(saved)))!.campaignLevel).toBe(l);
    }
  });

  it('a save made before the levels existed loads as Normal, with its progress untouched', () => {
    const old = JSON.parse(JSON.stringify(createSave(1))) as Record<string, unknown>;
    delete old.campaignLevel;
    old.prologueSeen = true;
    const loaded = repairSave(old)!;
    expect(loaded.campaignLevel).toBe('normal');
    expect(loaded.prologueSeen).toBe(true);
  });

  it('a damaged value falls back to Normal', () => {
    for (const bad of ['impossible', 3, null, {}, 'EASY']) {
      const raw = JSON.parse(JSON.stringify(createSave(1))) as Record<string, unknown>;
      raw.campaignLevel = bad;
      expect(repairSave(raw)!.campaignLevel).toBe('normal');
    }
  });

  it('changing the level touches nothing else and the crew level is a separate setting', () => {
    const save = setLoadout(createSave(1), { difficulty: 'standard' }, 2);
    const hard = setCampaignLevel(save, 'hard', 3);
    expect(hard.campaignLevel).toBe('hard');
    expect(hard.difficulty).toBe('standard');
    expect({ ...hard, campaignLevel: save.campaignLevel, updatedAt: save.updatedAt }).toEqual(save);
    expect(setCampaignLevel(hard, 'hard', 9)).toBe(hard);
    expect(setCampaignLevel(hard, 'bogus' as CampaignLevel, 9)).toBe(hard);
  });
});
