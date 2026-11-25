/**
 * SCOPE OF THE RELAY GUARDS (task FU2-B2, decision FU2Q-3, docs/BOSS_RELAY_SCOPE.md): decision PI8's backup-fighter relay
 * defence exists only where a boss encounter has dispatch relays (Oga Sunmola's Oshodi mission) and is inert everywhere
 * else.
 *
 *   1  the data: of the seven campaign boss encounters only Oshodi's objective is `dispatchRelays` and only its recipe names
 *      a boss balance, so only its tuning can carry `relayGuards`, and only on Normal / Hard
 *   2  the directive: forcing `relayGuards` on any other boss tuning changes no seat's directive (the objective check and
 *      the missing relays both keep it inert), while the same forcing on Oshodi does change them (the positive control)
 *   3  the fights: every other boss encounter, Normal and Hard, replays the production digest recorded BEFORE decision PI8
 *      (9491d92, scripts/lib/bossScope.ts: the real mission, the real crew bots, the scripted player, 45 s, every seat's
 *      tile / health / step folded in); Oshodi's Normal and Hard fights differ from it (the feature is what changed)
 *   4  presence in the real fight: with the player at a relay, Normal has one and Hard two backup fighters within a few tiles
 *      of a live relay (and nobody beyond the boss's own booth crew on Easy), recorded over the same real bots
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_BALANCE,
  CAMPAIGN_MISSION_IDS,
  MISSION_DEFS,
  buildMissionGame,
  createGame,
  observe,
  tick,
  tuningFor,
} from '../src/sim';
import type { CampaignLevel, GameState, Intents, MissionId } from '../src/sim';
import { createBot } from '../src/ai';
import { directiveFor } from '../src/sim/mission/directives';
import { relayGuardDirective } from '../src/sim/mission/relayGuard';
import { Tile } from '../src/sim/types';
import { scopeDigest } from '../scripts/lib/bossScope';
import { put } from './mission-helpers';

const LEVELS: CampaignLevel[] = ['easy', 'normal', 'hard'];
const OTHER: MissionId[] = CAMPAIGN_MISSION_IDS.filter((id) => id !== 'oshodi');

function boss(id: MissionId, level: CampaignLevel, seed = 3): GameState {
  const options = buildMissionGame({ spec: { id }, humanCharacter: 'streetBaller', seed, level });
  options.settings = { ...options.settings, stageHazards: false };
  const s = createGame(options);
  s.tiles = s.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  s.hidden = {};
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

describe('FU2-B2: the data', () => {
  it('seven boss encounters; only Oshodi has dispatch relays and a boss balance', () => {
    expect(CAMPAIGN_MISSION_IDS).toHaveLength(7);
    const relayMissions = CAMPAIGN_MISSION_IDS.filter(
      (id) => MISSION_DEFS[id].objective === 'dispatchRelays',
    );
    expect(relayMissions).toEqual(['oshodi']);
    const balanced = CAMPAIGN_MISSION_IDS.filter((id) => MISSION_DEFS[id].recipe.balance !== null);
    expect(balanced).toEqual(['oshodi']);
  });

  it('only Oshodi on Normal / Hard carries relayGuards in its tuning; no other encounter at any level does', () => {
    for (const id of CAMPAIGN_MISSION_IDS)
      for (const level of LEVELS) {
        const t = tuningFor(MISSION_DEFS[id], level).boss!;
        if (id === 'oshodi')
          expect(t.relayGuards ?? 0, `${id} ${level}`).toBe(BOSS_BALANCE.relayGuards[level]);
        else {
          expect('relayGuards' in t, `${id} ${level}`).toBe(false);
          expect('relayGuardRadius' in t, `${id} ${level}`).toBe(false);
        }
      }
  });
});

describe('FU2-B2: the directive is inert outside a relay fight', () => {
  it('forcing relayGuards onto any other boss changes no seat, wherever the player stands', () => {
    for (const id of OTHER) {
      const s = boss(id, 'hard');
      const m = s.mission!;
      const spots: [number, number][] = [
        [s.players[0]!.x, s.players[0]!.y],
        ...m.nodes.slice(0, 3).map((n): [number, number] => [n.x, n.y]),
      ];
      const read = (): string[] =>
        spots.map(([x, y]) => {
          put(s, 0, x, y);
          return JSON.stringify(m.seats.map((q) => directiveFor(s, q.playerId)));
        });
      const plain = read();
      m.tuning.boss!.relayGuards = 2;
      m.tuning.boss!.relayGuardRadius = 2;
      expect(read(), id).toEqual(plain);
      for (const q of m.seats) expect(relayGuardDirective(s, q), `${id} ${q.role}`).toBeUndefined();
    }
  });

  it('positive control: the same forcing on Oshodi sends backup fighters to the relays', () => {
    const s = boss('oshodi', 'hard');
    const m = s.mission!;
    put(s, 0, 50, 14);
    const drafted = m.seats.filter((q) => relayGuardDirective(s, q) !== undefined);
    expect(drafted.length).toBe(2); // Hard: the marshal and the lane blocker
    delete m.tuning.boss!.relayGuards;
    expect(m.seats.filter((q) => relayGuardDirective(s, q) !== undefined)).toHaveLength(0);
  });

  it('no relay guard when the boss is exposed, the relays are done, or the encounter is not the relays phase', () => {
    const s = boss('oshodi', 'hard');
    const m = s.mission!;
    put(s, 0, 50, 14);
    m.boss.shielded = false;
    expect(m.seats.filter((q) => relayGuardDirective(s, q) !== undefined)).toHaveLength(0);
    m.boss.shielded = true;
    m.objective = 'supplyRoutes';
    expect(m.seats.filter((q) => relayGuardDirective(s, q) !== undefined)).toHaveLength(0);
  });
});

describe('FU2-B2: the other bosses replay the production fight bit for bit', () => {
  // recorded with scripts/lib/bossScope.ts on production 9491d92 (before decision PI8), seed 101, 45 s of the real fight
  const BEFORE_PI8: Record<string, string> = {
    'oshodi/normal': '7ad9437c',
    'oshodi/hard': '726a0a6d',
    'mushin/normal': 'b689e73',
    'mushin/hard': 'e08a411',
    'fadeyiSomolu/normal': 'a45c1fa3',
    'fadeyiSomolu/hard': 'e1d3b015',
    'ebuteMetta/normal': '295819c8',
    'ebuteMetta/hard': 'a6e26b1e',
    'lagosIsland/normal': 'd1e9b676',
    'lagosIsland/hard': '574bea45',
    'lekki/normal': '955edbcc',
    'lekki/hard': '1a4d8d28',
    'ojuelegba/normal': '891198cc',
    'ojuelegba/hard': '6e58f919',
  };
  for (const level of ['normal', 'hard'] as CampaignLevel[])
    it(`${level}: every boss encounter but Oshodi equals the digest before PI8; Oshodi differs`, () => {
      for (const id of OTHER)
        expect(scopeDigest(id, level), `${id} ${level}`).toBe(BEFORE_PI8[`${id}/${level}`]);
      expect(scopeDigest('oshodi', level), `oshodi ${level}`).not.toBe(BEFORE_PI8[`oshodi/${level}`]);
    }, 240_000);
});

describe('FU2-B2: presence in the real Oshodi fight', () => {
  /** The player waits beside relay 1 while the real bots play 40 s; how many backup fighters have left their post for a relay? */
  function nearRelays(level: CampaignLevel): number {
    const s = boss('oshodi', level);
    const m = s.mission!;
    const bots: Record<number, ReturnType<typeof createBot>> = {};
    s.players.slice(1).forEach((p, i) => {
      bots[p.id] = createBot({ difficulty: 'rookie', seed: 77 + i * 31, playerId: p.id });
    });
    put(s, 0, 8, 12);
    for (let t = 0; t < 60 * 40 && s.match.phase === 'playing'; t++) {
      const intents: Intents = { 0: {} };
      for (const [id, bot] of Object.entries(bots))
        if (s.players[Number(id)]!.alive) intents[Number(id)] = bot.decide(observe(s, Number(id)));
      tick(s, intents);
      s.players[0]!.vitals!.hp = s.players[0]!.vitals!.maxHp; // this scenario is about where the others stand
      s.players[0]!.alive = true;
    }
    const live = m.nodes.filter((n) => !n.done);
    // a backup fighter standing within 3 tiles of a live relay that is at least 10 tiles from its own post
    return m.seats.filter((q) => {
      const p = s.players[q.playerId]!;
      if (!p.alive || !q.post || !['meleeGuard', 'blocker', 'escort'].includes(q.role)) return false;
      return live.some(
        (n) =>
          Math.abs(n.x - p.x) + Math.abs(n.y - p.y) <= 3 &&
          Math.abs(n.x - q.post!.x) + Math.abs(n.y - q.post!.y) >= 10,
      );
    }).length;
  }

  it('backup fighters standing at a relay far from their own post: Easy none, Normal one, Hard two', () => {
    const counts = LEVELS.map(nearRelays);
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBe(1);
    expect(counts[2]).toBe(2);
  }, 240_000);
});
