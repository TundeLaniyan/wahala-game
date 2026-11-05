/**
 * STUB (field-sections worker): the signature `raid-sim` ships in its real `build.ts`, so the campaign's field -> raid
 * transition (src/app/campaign.ts) can be built and tested before the raid runtime is merged. It makes a tiny, valid
 * two-seat game (the human and one dormant bot) on a small standard arena with the `raid` ruleset. The integrator keeps
 * raid-sim's real file on merge; nothing else depends on this one.
 */
import { DEFAULT_ARENA_ID } from '../arenas';
import type { RaidId } from '../campaign/types';
import type { CharacterId, Difficulty, GameOptions } from '../types';

export function buildRaidGame(o: {
  raidId: RaidId;
  humanCharacter: CharacterId;
  seed: number;
  hp?: number;
  lives?: number;
  maxHp?: number;
  difficulty?: Difficulty;
  timeLimitSec?: number;
}): GameOptions {
  return {
    seed: o.seed,
    arenaId: DEFAULT_ARENA_ID,
    players: [
      { name: 'You', characterId: o.humanCharacter, isBot: false, team: 0 },
      { name: 'Raid enemy', characterId: 'lekkiBoy', isBot: true, difficulty: o.difficulty ?? 'rookie', team: 1 },
    ],
    settings: { game: 'raid' },
  };
}
