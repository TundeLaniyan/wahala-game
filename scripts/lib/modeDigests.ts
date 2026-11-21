/**
 * Digests of bot play in every match type that is NOT a Classic raid (decision RA1, docs/CLASSIC_RAID_AI.md): the 13
 * campaign field missions at each level, the six boss missions, the Academy's Generator Tactics lessons, Classic and
 * City Rumble. The raid AI work must leave each byte-identical; `tests/raid-ai-isolation.test.ts` pins the values
 * recorded on production `514be88`, before that work. `npx tsx scripts/lib/modeDigests.ts` prints them all.
 */
import { createBot } from '../../src/ai';
import { FIELD_MISSION_IDS, buildMissionGame, createGame, observe, tick } from '../../src/sim';
import type { GameOptions, GameState, Intents, MissionId } from '../../src/sim';
import { getFieldMission } from '../../src/sim/mission/fieldDefs';
import { LESSONS } from '../../src/tutorial';
import { stateDigest } from './mpDigest';

function fnv(text: string, h = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Bots (casual) in every seat, the human's included; the state and event digest after `ticks`. */
export function playDigest(state: GameState, ticks: number): string {
  const bots = state.players.map((p) => createBot({ difficulty: 'casual', seed: 17 + p.id, playerId: p.id }));
  let h = 0x811c9dc5;
  for (let t = 0; t < ticks && state.match.phase !== 'ended'; t++) {
    const intents: Intents = {};
    for (const p of state.players) if (p.alive) intents[p.id] = bots[p.id]!.decide(observe(state, p.id));
    const ev = tick(state, intents);
    if (ev.length > 0) h = fnv(JSON.stringify(ev), h);
  }
  return `${stateDigest(state)}/${h.toString(16)}`;
}

const LEVELS = ['easy', 'normal', 'hard'] as const;
const BOSS_IDS: readonly MissionId[] = [
  'oshodi',
  'mushin',
  'fadeyiSomolu',
  'ebuteMetta',
  'lagosIsland',
  'lekki',
];

export function fieldDigests(ticks = 600): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of FIELD_MISSION_IDS)
    for (const level of LEVELS) {
      const options = buildMissionGame({
        spec: { id: getFieldMission(id).districtId, fieldId: id },
        humanCharacter: 'streetBaller',
        seed: 5,
        level,
      });
      out[`${id}/${level}`] = playDigest(createGame(options), ticks);
    }
  return out;
}

export function bossDigests(ticks = 480): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of BOSS_IDS)
    out[id] = playDigest(
      createGame(buildMissionGame({ spec: { id }, humanCharacter: 'lekkiBoy', seed: 4, level: 'hard' })),
      ticks,
    );
  return out;
}

export function lessonDigests(ticks = 480): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of LESSONS) out[l.id] = playDigest(l.practice.build('streetBaller'), ticks);
  return out;
}

export function arenaDigests(ticks = 1200): Record<string, string> {
  const players = (n: number): GameOptions['players'] =>
    Array.from({ length: n }, (_, i) => ({
      name: `B${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i % 3]!,
      isBot: true,
    }));
  const cases: Record<string, GameOptions> = {
    classic: { seed: 9, players: players(4), settings: { mode: 'crush' } },
    rumbleSurvival: {
      seed: 9,
      arenaId: 'rumbleOjuelegba',
      players: players(6),
      settings: { game: 'survival' },
    },
    rumbleTeam: {
      seed: 9,
      arenaId: 'rumbleOshodi',
      players: players(6).map((p, i) => ({ ...p, team: i % 2 })),
      settings: { game: 'team' },
    },
  };
  const out: Record<string, string> = {};
  for (const [k, o] of Object.entries(cases)) out[k] = playDigest(createGame(o), ticks);
  return out;
}

if (process.argv[1]?.endsWith('modeDigests.ts')) {
  const all = { ...fieldDigests(), ...bossDigests(), ...lessonDigests(), ...arenaDigests() };
  console.log(JSON.stringify(all, null, 2));
}
