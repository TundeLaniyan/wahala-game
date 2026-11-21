/**
 * Builds a raid match: the raid's own small board, seat 0 the human (team 0), seats 1... the enemies (team 1, dormant
 * until their wave) and the config layer a raid adds. `createGame` calls `raidConfigLayer` while it builds the state and
 * `createRaidState` once the board exists; the campaign calls `buildRaidGame`.
 */
import type { CampaignTacticsConfig, DeepPartial, GameConfig } from '../config';
import { NIGHT_SIGHT_LEVELS, mergeLayers, raidTacticsFor, ticks } from '../config';
import type { CharacterId, Difficulty, GameOptions, PlayerSetup } from '../types';
import { RAID_DEFS } from './defs';
import { enemySeats } from './layout';
import { RAID_TUNING } from './tuning';
import type { RaidSpec } from './types';
import type { RaidId } from '../campaign/types';
import { levelConfigLayer, levelMaxHp } from '../campaign/levels';
import type { CampaignLevel } from '../campaign/levels';

const ENEMY_LOOKS: readonly CharacterId[] = ['lekkiBoy', 'streetBaller', 'campusQueen'];

/** The arena id a raid is played on. */
export function raidArenaId(raidId: RaidId): string {
  return RAID_DEFS[raidId].arenaId;
}

/**
 * The Classic raid's tactics layer at a level (decision RA1, docs/CLASSIC_RAID_AI.md): `config.campaignTactics` with
 * the raid's own numbers and `classicRaid` set, so the enemies get sight, memory, hearing, a territory with a readable
 * route, a fair pace and bounded pursuit, and keep the raid's own combat rules. A fresh copy every call.
 */
export function raidTacticsLayer(level: CampaignLevel | undefined): {
  campaignTactics: CampaignTacticsConfig;
} {
  return { campaignTactics: raidTacticsFor(level ?? 'normal') };
}

/**
 * The config a raid layers over the defaults: the clock, no random crates (every crate is authored), no hidden
 * pickups, the cross blast of the 'plus' mode (the default), the raid's generator numbers, a respawn that keeps the
 * player's upgrades and the raid tactics layer at the Normal level (`buildRaidGame` adds the Easy / Hard one over it).
 * There is no Wahala Crush (`modeShrinks`) and no streak or elimination economy.
 */
export function raidConfigLayer(spec: RaidSpec): DeepPartial<GameConfig> {
  const def = RAID_DEFS[spec.raidId];
  return {
    match: {
      durationTicks: ticks(spec.timeLimitSec ?? def.timeLimitSec),
      countdownTicks: RAID_TUNING.countdownTicks,
    },
    arena: { softDensity: 0 },
    pickups: { hiddenChance: 0 },
    generator: { baseRange: def.bombs.range, baseCapacity: def.bombs.capacity, blastMode: 'plus' },
    respawn: { resetOnDeath: false },
    ...raidTacticsLayer('normal'),
    // a night raid with light-based detection (decision NL10): its Normal numbers (`buildRaidGame` adds Easy / Hard)
    ...(def.lighting?.detection ? { nightSight: { ...NIGHT_SIGHT_LEVELS.normal } } : {}),
  };
}

/**
 * The `GameOptions` of a raid. `hp` is the health the player brings in (a field mission hands its own value), `lives`
 * defaults to the raid's. Pass the result to `createGame`.
 */
export function buildRaidGame(o: {
  raidId: RaidId;
  humanCharacter: CharacterId;
  seed: number;
  hp?: number;
  lives?: number;
  maxHp?: number;
  /** Enemy bot level (default Rookie). */
  difficulty?: Difficulty;
  timeLimitSec?: number;
  /** Campaign difficulty (Easy / Normal / Hard); absent = Normal. */
  level?: CampaignLevel;
}): GameOptions {
  const def = RAID_DEFS[o.raidId];
  const maxHp = levelMaxHp(o.maxHp ?? def.humanMaxHp, o.level);
  // the level's health / damage, and its raid tactics (Normal adds nothing: `raidConfigLayer` carries it)
  const levelConfig = mergeLayers<GameConfig>(
    mergeLayers<GameConfig>(
      levelConfigLayer(o.level),
      o.level && o.level !== 'normal' ? raidTacticsLayer(o.level) : undefined,
    ),
    // a night raid's detection reacts slower on Easy, faster on Hard (decision NL12)
    o.level && o.level !== 'normal' && def.lighting?.detection
      ? { nightSight: { ...NIGHT_SIGHT_LEVELS[o.level] } }
      : undefined,
  );
  const players: PlayerSetup[] = [
    { name: 'You', characterId: o.humanCharacter, isBot: false, team: 0, maxHp },
    ...enemySeats(def).map((s, i): PlayerSetup => ({
      name: s.name ?? s.kind,
      characterId: ENEMY_LOOKS[i % ENEMY_LOOKS.length]!,
      isBot: true,
      difficulty: o.difficulty ?? 'rookie',
      team: 1,
      enemyKind: s.kind,
    })),
  ];
  const raid: RaidSpec = {
    raidId: o.raidId,
    ...(o.lives !== undefined ? { lives: o.lives } : {}),
    ...(o.hp !== undefined ? { hp: o.hp } : {}),
    maxHp,
    ...(o.timeLimitSec !== undefined ? { timeLimitSec: o.timeLimitSec } : {}),
  };
  return {
    seed: o.seed,
    arenaId: def.arenaId,
    players,
    settings: { game: 'raid' },
    raid,
    ...(levelConfig ? { config: levelConfig } : {}),
  };
}
