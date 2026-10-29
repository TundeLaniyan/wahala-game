import type { CharacterId, Difficulty, GameKind, MatchSettings, PlayerSetup } from '../sim';
import { CHARACTER_IDS, DIFFICULTIES, createRng, getArena, shuffle } from '../sim';
import type { GameSettings } from './settings';

const BOT_NAMES = [
  'Chi_Boy',
  'T_Blaze',
  'Yaba_King',
  'Ola_99',
  'Naija_Ace',
  'Lagos_Lad',
  'Sade_X',
  'Kunle_Z',
  'Ife_Star',
  'Danfo_Dan',
  'Bisi_Boom',
  'Agbero_1',
  'Mama_Put',
  'Tunde_T',
  'Chioma_C',
  'Okada_Oga',
  'Ikeja_Ice',
  'Bode_Blast',
  'Amaka_A',
  'Surulere_S',
  'Eko_Elite',
  'Ngozi_N',
  'Femi_Fuse',
  'Kemi_K',
  'Obalende_O',
  'Zainab_Z',
  'Mushin_Max',
  'Dayo_D',
  'Emeka_E',
  'Yemi_Y',
  'Ajah_Ace',
  'Funke_F',
];

/** The arena the Play button starts: the chosen City Rumble stage or the Classic Battle arena. */
export function matchArenaId(settings: GameSettings): string {
  if (settings.play === 'rumble') return settings.rumbleArenaId;
  return getArena(settings.arenaId).kind === 'rumble' ? 'danfoBusPark' : settings.arenaId;
}

/**
 * The match rules for the chosen game, built fresh from the saved menu settings for every start (so
 * nothing carries over between match types): Classic = last standing with the mandatory Wahala Crush;
 * City Rumble = the chosen Survival / Deathmatch / Team Rumble. Friendly fire only exists in Team
 * Rumble and the 5 / 10 minute clock only in the respawn modes.
 */
export function matchRules(settings: GameSettings): Partial<MatchSettings> & { game: GameKind } {
  const rumble = getArena(matchArenaId(settings)).kind === 'rumble';
  const game: GameKind = rumble ? settings.rumbleMode : 'classic';
  const timed = game === 'deathmatch' || game === 'team';
  return {
    game,
    // Wahala Crush is mandatory in every standard match (no Classic Timer choice any more); the
    // respawn modes never close in (createGame turns it off for them)
    mode: 'crush',
    friendlyFire: game === 'team' && settings.friendlyFire,
    teamCount: 2,
    durationSec: timed ? settings.rumbleMinutes * 60 : null,
    crowdThrows: settings.crowdThrows,
    rumbleBlast: settings.rumbleBlast,
  };
}

/** Total competitors for the chosen game (City Rumble has its own, much larger count). */
export function competitorCount(settings: GameSettings): number {
  return getArena(matchArenaId(settings)).kind === 'rumble'
    ? settings.rumbleCompetitors
    : settings.competitors;
}

/**
 * Level of bot slot `i` (1-based). Classic: each bot has its own level. City Rumble: the preset, or with
 * the mixed roster a deterministic spread of one level either side of it (never 31 manual choices).
 */
export function botDifficulty(settings: GameSettings, i: number): Difficulty {
  if (settings.play === 'classic') return settings.botDifficulties[i - 1] ?? settings.difficulty;
  if (!settings.rumbleMixed) return settings.difficulty;
  const at = DIFFICULTIES.indexOf(settings.difficulty);
  const spread = MIXED_SPREAD[i % MIXED_SPREAD.length]!;
  return DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, at + spread))]!;
}

/** Levels above / below the chosen one that a mixed City Rumble roster uses, by bot slot (cycled). */
export const MIXED_SPREAD: readonly number[] = [0, -1, 1, 0, -2, 2, 0, 1, -1];

/** Human takes slot 0; bots get the other characters first (so portraits stay distinct) and unique handles. */
export function buildPlayers(settings: GameSettings, seed: number): PlayerSetup[] {
  const rng = createRng(seed ^ 0x5bd1e995);
  const names = shuffle(rng, BOT_NAMES);
  const others = CHARACTER_IDS.filter((c) => c !== settings.character);
  const pool: CharacterId[] = [...shuffle(rng, others), ...shuffle(rng, CHARACTER_IDS)];
  while (pool.length < 32) pool.push(...shuffle(rng, CHARACTER_IDS));
  const players: PlayerSetup[] = [{ name: 'YOU', characterId: settings.character, isBot: false }];
  const count = competitorCount(settings);
  for (let i = 1; i < count; i++) {
    players.push({
      name: names[i - 1]!,
      characterId: pool[i - 1]!,
      isBot: true,
      difficulty: botDifficulty(settings, i),
    });
  }
  return players;
}
