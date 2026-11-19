/**
 * THE HUMAN-LIKE OSHODI FLOW (docs/CAMPAIGN_COMBAT_RELIABILITY.md, V5): a scripted human with the human model (input latency
 * 6-24 ticks, ordinary intents only) plays `oshodi.approach` end to end on the real mission: first he deals with the warden on
 * the kiosk loop the way a player is taught (let it swing at the air, lay at its feet in its recovery, hold, walk out late:
 * `baitFromHere`), then the generator-first plan of `GeneratorPlayer` walks checkpoints A-B-C and raids the depot door (a
 * completed raid, as the scripted playthroughs do). Counted: did he finish, did one of HIS blasts defeat an agbero on the way.
 */
import { RAID_DEFS, resolveRaid } from '../../src/sim';
import type { CampaignLevel, RaidId, SimEvent } from '../../src/sim';
import { GeneratorPlayer } from './generatorPlaythrough';
import { baitFromHere, tickScene, trapScene } from './humanTrap';

export interface FlowResult {
  level: CampaignLevel;
  seed: number;
  won: boolean;
  seconds: number;
  livesUsed: number;
  /** Agberos (the patrolling wardens) defeated by the human's own blast, and every enemy so defeated. */
  agberoBlastKills: number;
  blastKills: number;
  /** The warden was trapped in the bait phase (before the autopilot took over). */
  baitKill: boolean;
}

export function playOshodiFlow(level: CampaignLevel, seed: number): FlowResult {
  const sc = trapScene('oshodi.approach', level, seed, 1, 0);
  const s = sc.s;
  // a player who misses with the bait tries again (up to three tries, as he would before moving on)
  let bait = baitFromHere(sc, seed, {}, 50);
  for (let again = 1; again < 3 && !bait.result.killed && sc.s.players[1]!.alive; again++)
    bait = baitFromHere(sc, seed + 100 * again, {}, 50);
  const human = new GeneratorPlayer(seed);
  let agberoBlastKills = bait.result.killed ? 1 : 0;
  let blastKills = bait.result.killed ? 1 : 0;
  const max = 600 * 60;
  for (let n = 0; n < max && s.match.phase !== 'ended'; n++) {
    const request = s.mission?.pendingRaid;
    if (request) {
      const raid = RAID_DEFS[request.raidId as RaidId];
      resolveRaid(
        s,
        request.doorId,
        {
          raidId: request.raidId,
          result: 'completed',
          seconds: raid.parSec,
          optionalRoomsOpened: 0,
          optionalRoomsTotal: 1,
          cargoDestroyed: 3,
          cargoTotal: 3,
          hpLeft: s.players[0]!.vitals?.hp ?? 3,
          livesUsed: 0,
          stars: 2,
        },
        [] as SimEvent[],
      );
    }
    const ev = tickScene(sc, bait.pilot.drive(human.decide(s), s.tick));
    for (const e of ev) {
      if (e.type === 'campaignDefeated' && e.source === 'blast' && e.byId === 0 && e.victimId !== 0) {
        blastKills++;
        if (e.enemyKind === 'agbero') agberoBlastKills++;
      }
    }
  }
  const out = s.mission?.outcome;
  return {
    level,
    seed,
    won: out?.result === 'won',
    seconds: Math.round(s.match.playTicks / 60),
    livesUsed: s.mission?.livesUsed ?? 0,
    agberoBlastKills,
    blastKills,
    baitKill: bait.result.killed,
  };
}
