/**
 * Builds a raid match: the raid's own small board, seat 0 the human (team 0), seats 1... the enemies (team 1, dormant
 * until their wave) and the config layer a raid adds. `createGame` calls `raidConfigLayer` while it builds the state and
 * `createRaidState` once the board exists; the campaign calls `buildRaidGame`.
 */
import type { DeepPartial, GameConfig } from '../config';
import { ticks } from '../config';
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
 * The config a raid layers over the defaults: the clock, no random crates (every crate is authored), no hidden
 * pickups, the cross blast of the 'plus' mode (the default), the raid's generator numbers and a respawn that keeps the
 * player's upgrades. There is no Wahala Crush (`modeShrinks`) and no streak or elimination economy.
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
  const levelConfig = levelConfigLayer(o.level);
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
