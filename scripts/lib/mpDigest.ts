/**
 * A digest of ordinary multiplayer bot play (decision EF8): bots of several levels, close attacks on, a classic and a
 * City Rumble arena. Every campaign-only rule of the enemy fairness work must leave it byte-identical
 * (tests/enemy-fairness.test.ts pins the value recorded on a4fe457, before that work).
 */
import { createBot } from '../../src/ai';
import { createGame, observe, tick } from '../../src/sim';
import type { Difficulty, GameState, Intents } from '../../src/sim';

function fnv(text: string, h = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** FNV-1a over the JSON of the state without `config` (constant data that grows with features). */
export const stateDigest = (s: GameState): string => {
  const text = JSON.stringify(s, (k, v: unknown) => (k === 'config' ? undefined : v));
  return `${fnv(text).toString(16)}:${text.length}`;
};

export function multiplayerDigest(
  arenaId: string,
  levels: Difficulty[],
  seed: number,
  ticks: number,
): { digest: string; events: number } {
  const s = createGame({
    seed,
    arenaId,
    players: levels.map((_, i) => ({
      name: `b${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
      isBot: true,
    })),
  });
  const bots = levels.map((difficulty, i) => createBot({ difficulty, seed: seed * 31 + i, playerId: i }));
  let events = 0;
  let h = 0x811c9dc5;
  for (let t = 0; t < ticks && s.match.phase !== 'ended'; t++) {
    const intents: Intents = {};
    bots.forEach((b, i) => {
      if (s.players[i]!.alive) intents[i] = b.decide(observe(s, i));
    });
    const ev = tick(s, intents);
    events += ev.length;
    if (ev.length > 0) h = fnv(JSON.stringify(ev), h);
  }
  return { digest: `${stateDigest(s)}/${h.toString(16)}`, events };
}
