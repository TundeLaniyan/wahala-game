import type { CharacterId, PlayerSetup } from '../sim';
import { CHARACTER_IDS, createRng, shuffle } from '../sim';
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
];

/** Human takes slot 0; bots get the other characters first (so portraits stay distinct) and unique handles. */
export function buildPlayers(settings: GameSettings, seed: number): PlayerSetup[] {
  const rng = createRng(seed ^ 0x5bd1e995);
  const names = shuffle(rng, BOT_NAMES);
  const others = CHARACTER_IDS.filter((c) => c !== settings.character);
  const pool: CharacterId[] = [...shuffle(rng, others), ...shuffle(rng, CHARACTER_IDS)];
  const players: PlayerSetup[] = [{ name: 'YOU', characterId: settings.character, isBot: false }];
  for (let i = 1; i < settings.competitors; i++) {
    players.push({
      name: names[i - 1]!,
      characterId: pool[i - 1]!,
      isBot: true,
      difficulty: settings.difficulty,
    });
  }
  return players;
}
