/**
 * How well the Oshodi boss and his crew PROTECT THE RELAYS (the "jammer": the dispatch relays the player jams with a blast),
 * measured on the real boss mission with the scripted player of docs/BOSS_BALANCE.md (task PI-1D,
 * docs/BOSS_JAMMER_PROTECTION.md):
 *
 *   npx tsx scripts/boss-jammer.ts [--seeds 8] [--level normal] [--player fair|slow] [--id oshodi] [--trace]
 *
 * Per level and player, over the OBJECTIVE phases (boss shielded, relays live):
 *   - guarded share: of the time a relay is live, the share of it with a living hostile (boss or crew) within `GUARD`
 *     tiles (Chebyshev) of it;
 *   - contested share: the same, counted only while the human is within `NEAR` tiles of that live relay (his approach);
 *   - approach to jam: seconds from the human first coming within `NEAR` tiles of a live relay until it is jammed;
 *   - who: for each role, the share of live-relay time it spends within `GUARD` tiles of one;
 *   - wins, seconds, lives lost, health lost to melee, the seconds each phase took.
 * `--trace` prints one line per second of the first run (positions of the human, the live relays, the hostiles).
 */
import { MISSION_IDS } from '../src/sim';
import type { CampaignLevel, GameState, MissionId } from '../src/sim';
import { BOSS_HUMAN, SLOW_BOSS_HUMAN, runBossMeasure } from './lib/bossHuman';
import type { BossMeasureResult } from './lib/bossHuman';

export const GUARD = 4;
export const NEAR = 8;

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const cheb = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export interface JammerMeasure {
  /** Relay-ticks live, and with a hostile within GUARD. */
  live: number;
  guarded: number;
  /** Relay-ticks live with the human within NEAR, and of those guarded. */
  contested: number;
  contestedGuarded: number;
  /** Seconds from the human first near a live relay to its jam, one entry per jam. */
  approachToJam: number[];
  /** Per role: relay-ticks a seat of that role was within GUARD of a live relay (of `live`). */
  byRole: Record<string, number>;
  /** Ticks each seat spent within GUARD of a live relay while the human was NEAR it too. */
  result: BossMeasureResult;
}

export function measureJammer(o: {
  id: MissionId;
  level: CampaignLevel;
  seed: number;
  human: typeof BOSS_HUMAN;
  trace?: boolean;
  /** Replace the level's `relayGuards` (decision PI8) for this run. */
  guards?: number;
}): JammerMeasure {
  const m: JammerMeasure = {
    live: 0,
    guarded: 0,
    contested: 0,
    contestedGuarded: 0,
    approachToJam: [],
    byRole: {},
    result: undefined as never,
  };
  const nearSince = new Map<string, number>();
  const wasDone = new Map<string, boolean>();
  let lastPhase = -1;
  m.result = runBossMeasure({
    id: o.id,
    level: o.level,
    seed: o.seed,
    human: o.human,
    onTick: (s: GameState) => {
      const ms = s.mission!;
      if (o.guards !== undefined && ms.tuning.boss && ms.tuning.boss.relayGuards !== o.guards) {
        if (o.guards > 0) {
          ms.tuning.boss.relayGuards = o.guards;
          ms.tuning.boss.relayGuardRadius ??= 2;
        } else {
          delete ms.tuning.boss.relayGuards;
          delete ms.tuning.boss.relayGuardRadius;
        }
      }
      if (ms.phase !== lastPhase) {
        lastPhase = ms.phase;
        nearSince.clear();
        wasDone.clear();
      }
      if (ms.phaseState !== 'active' || ms.outcome) return;
      const me = s.players[0]!;
      const hostiles = ms.seats.filter((q) => q.role !== 'player' && s.players[q.playerId]!.alive);
      for (const node of ms.nodes) {
        const key = `${ms.phase}:${node.id}`;
        const was = wasDone.get(key) ?? false;
        if (node.done && !was && nearSince.has(key))
          m.approachToJam.push((s.tick - nearSince.get(key)!) / 60);
        wasDone.set(key, node.done);
        if (node.done) {
          nearSince.delete(key);
          continue;
        }
        const humanNear = me.alive && cheb(me.x, me.y, node.x, node.y) <= NEAR;
        if (humanNear && !nearSince.has(key)) nearSince.set(key, s.tick);
        if (!humanNear) nearSince.delete(key);
        m.live++;
        const guards = hostiles.filter((q) => {
          const p = s.players[q.playerId]!;
          return cheb(p.x, p.y, node.x, node.y) <= GUARD;
        });
        if (guards.length > 0) m.guarded++;
        for (const q of new Set(guards.map((g) => g.role))) m.byRole[q] = (m.byRole[q] ?? 0) + 1;
        if (humanNear) {
          m.contested++;
          if (guards.length > 0) m.contestedGuarded++;
        }
      }
      if (o.trace && s.tick % 60 === 0) {
        const live = ms.nodes.filter((n) => !n.done).map((n) => `${n.id}(${n.x},${n.y})`);
        const who = hostiles.map(
          (q) => `${q.role[0]}${q.role.slice(1, 3)}(${s.players[q.playerId]!.x},${s.players[q.playerId]!.y})`,
        );
        console.log(
          `t${s.tick / 60} ph${ms.phase} human(${me.x},${me.y}) live[${live.join(' ')}] ${who.join(' ')}`,
        );
      }
    },
  });
  return m;
}

if (process.argv[1]?.endsWith('boss-jammer.ts')) {
  const seeds = Number(arg('seeds') ?? 8);
  const id = (arg('id') ?? 'oshodi') as MissionId;
  if (!(MISSION_IDS as readonly string[]).includes(id)) throw new Error(`unknown mission ${id}`);
  const levels: CampaignLevel[] = arg('level') ? [arg('level') as CampaignLevel] : ['easy', 'normal', 'hard'];
  const players = arg('player') ? [arg('player')!] : ['fair', 'slow'];
  const guards = arg('guards') !== undefined ? Number(arg('guards')) : undefined;
  const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)} %` : '-');
  const mean = (xs: number[]): string =>
    xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-';
  console.log(`relay protection (GUARD ${GUARD} tiles, NEAR ${NEAR} tiles), ${id}, ${seeds} seeds per cell`);
  console.log(
    '| player | level | wins | mean s | lives lost | melee health lost | phase seconds | relay guarded | contested: guarded | approach to jam (s) | role share of live-relay time |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const player of players)
    for (const level of levels) {
      const human = player === 'slow' ? SLOW_BOSS_HUMAN : BOSS_HUMAN;
      const rs: JammerMeasure[] = [];
      for (let k = 0; k < seeds; k++)
        rs.push(
          measureJammer({
            id,
            level,
            seed: 101 + k * 17,
            human,
            trace: process.argv.includes('--trace') && k === 0,
            ...(guards !== undefined ? { guards } : {}),
          }),
        );
      const sum = (f: (r: JammerMeasure) => number): number => rs.reduce((a, r) => a + f(r), 0);
      const live = sum((r) => r.live);
      const roles = new Set(rs.flatMap((r) => Object.keys(r.byRole)));
      const phaseSec = [0, 1, 2].map((p) =>
        mean(rs.map((r) => r.result.phaseSec[p]).filter((x): x is number => x !== undefined)),
      );
      console.log(
        `| ${player} | ${level} | ${rs.filter((r) => r.result.result === 'won').length}/${rs.length} | ${mean(rs.map((r) => r.result.seconds))} | ${mean(rs.map((r) => r.result.deaths))} | ${mean(rs.map((r) => r.result.damageBy.melee))} | ${phaseSec.join(' / ')} | ${pct(
          sum((r) => r.guarded),
          live,
        )} | ${pct(
          sum((r) => r.contestedGuarded),
          sum((r) => r.contested),
        )} | ${mean(rs.flatMap((r) => r.approachToJam))} | ${[...roles]
          .map(
            (role) =>
              `${role} ${pct(
                sum((r) => r.byRole[role] ?? 0),
                live,
              )}`,
          )
          .join(', ')} |`,
      );
    }
}
