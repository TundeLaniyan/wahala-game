/**
 * Shared checks of the district encounter pass A (Oshodi, Mushin, Fadeyi/Somolu; docs/CAMPAIGN_SECTOR_AI.md "Districts:
 * Oshodi ...", decisions DA1-DA9), used by tests/field-districts-{oshodi,mushin,fadeyi}.test.ts:
 *
 *   data       patrol waypoints, posts, equipment and hold zones are open layout floor inside the sector, reachable from
 *              the start once the sector is stamped; equipment never sits on an authored tile; wave and crew groups
 *              name real enemies; the leg texts follow the checkpoint-clarity wording
 *   playthrough  the REAL mission against the REAL enemy bots (scripts/lib/districtPlay.ts): a scripted human with
 *              ordinary intents and a generator-first strategy completes every leg within the clock in a majority of
 *              seeds on Normal; Easy completes at least as often; Hard costs measurably more (time, lives, failures)
 *   seen       an ordinary enemy of the mission that SAW a badly placed generator (laid two tiles in front of it in
 *              plain view, the human walking away) escapes it in a majority of seeds
 *
 * Door raids are answered through `resolveRaid` with a completed outcome, exactly as the scripted Oshodi playthrough
 * in tests/field-missions.test.ts does; nothing moves an enemy, writes an AI state or forces a blast.
 */
import { describe, expect, it } from 'vitest';
import {
  FIELD_MISSION_DEFS,
  fieldArenaId,
  buildMissionGame,
  createGame,
  enemyDef,
  getArena,
} from '../src/sim';
import type { CampaignLevel, FieldMissionDef, GameState } from '../src/sim';
import { Tile } from '../src/sim/types';
import { getSector } from '../src/sim/mission/sectors';
import { rectsContain } from '../src/sim/mission/sector';
import { fieldTiles } from '../src/sim/mission/fieldState';
import { missionMatch, playMission, seenOnMission } from '../scripts/lib/districtPlay';
import type { PlayResult } from '../scripts/lib/districtPlay';

export const SEEDS = [1, 2, 3, 4, 5, 6];
/** Whole missions against real bots: minutes of simulated play per test (tens of seconds of CPU). */
const PLAY_TIMEOUT = 600_000;
const LEVELS: CampaignLevel[] = ['easy', 'normal', 'hard'];
/** A playthrough's cost: its field seconds, a minute per life lost, a failed run costs its whole clock and more. */
export function runCost(r: PlayResult, limitSec: number): number {
  return (r.result === 'won' ? r.fieldSec : limitSec + 180) + 60 * r.livesUsed;
}

function flood(s: GameState, sx: number, sy: number): Set<number> {
  const seen = new Set<number>([sy * s.width + sx]);
  const queue = [sy * s.width + sx];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = (i % s.width) + dx;
      const y = Math.floor(i / s.width) + dy;
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
      const j = y * s.width + x;
      if (seen.has(j) || s.tiles[j] === Tile.Hard) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen;
}

/** The data checks of one mission (see the file header). */
export function describeMissionData(id: string): void {
  const def: FieldMissionDef = FIELD_MISSION_DEFS[id]!;
  const sector = getSector(def.sectorId!);
  const layout = getArena(fieldArenaId(def)).layout;
  const floor = (x: number, y: number): boolean => {
    const c = layout[y]?.[x];
    return c === '.' || c === '_';
  };
  const inside = (x: number, y: number): boolean => rectsContain(sector.rects, x, y);

  describe(`${id}: encounter data`, () => {
    it('every post and patrol waypoint is open floor inside the sector and reachable from the start', () => {
      const s = createGame(
        buildMissionGame({
          spec: { id: def.districtId, fieldId: id },
          humanCharacter: 'streetBaller',
          seed: 3,
        }),
      );
      const reach = flood(s, def.start[0], def.start[1]);
      for (const e of def.enemies) {
        for (const [x, y] of [e.post, ...(e.territory?.patrol ?? [])]) {
          expect(inside(x, y), `${id} ${e.name} ${x},${y} outside`).toBe(true);
          expect(
            floor(x, y) || layout[y]?.[x] === '$' || layout[y]?.[x] === 'x',
            `${id} ${x},${y} concrete`,
          ).toBe(true);
          expect(reach.has(y * s.width + x), `${id} ${e.name} ${x},${y} unreachable`).toBe(true);
        }
        // every territorial enemy has a variant (the district's look and personality, decision DA1)
        expect(e.variant, `${id} ${e.name}`).toBeDefined();
      }
    });

    it('equipment stands on open floor inside the sector, off every authored tile; hold zones lie inside', () => {
      const authored = new Set(
        [...fieldTiles(def), ...def.enemies.map((e) => e.post)].map(([x, y]) => `${x},${y}`),
      );
      const groups = new Set(def.enemies.map((e) => e.group));
      for (const leg of def.legs) {
        if (leg.kind === 'destroyTargets') {
          expect(leg.targets.length, id).toBeGreaterThanOrEqual(2);
          for (const t of leg.targets) {
            expect(floor(t.x, t.y), `${id} ${t.id} on ${layout[t.y]?.[t.x]}`).toBe(true);
            expect(inside(t.x, t.y), `${id} ${t.id}`).toBe(true);
            expect(authored.has(`${t.x},${t.y}`), `${id} ${t.id} on an authored tile`).toBe(false);
            expect(t.hp ?? 1, `${id} ${t.id}: more than one blast`).toBeGreaterThanOrEqual(2);
          }
          if (leg.crew) expect(groups.has(leg.crew), `${id} crew ${leg.crew}`).toBe(true);
        }
        if (leg.kind === 'holdArea') {
          const { x, y, radius } = leg.area;
          expect(floor(x, y), `${id} zone centre`).toBe(true);
          for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++)
              if (layout[y + dy]?.[x + dx] !== '#')
                expect(inside(x + dx, y + dy), `${id} zone tile ${x + dx},${y + dy}`).toBe(true);
          for (const wv of leg.waves ?? []) {
            expect(groups.has(wv.group), `${id} wave ${wv.group}`).toBe(true);
            // a wave never stands in the zone before its time (it would contest it from the first tick)
            for (const e of def.enemies.filter((o) => o.group === wv.group))
              expect(
                Math.max(Math.abs(e.post[0] - x), Math.abs(e.post[1] - y)),
                `${id} ${e.name}`,
              ).toBeGreaterThan(radius);
          }
          // nobody who is not a wave camps in the zone either (pursuers wait at their posts)
          for (const e of def.enemies)
            expect(
              Math.max(Math.abs(e.post[0] - x), Math.abs(e.post[1] - y)),
              `${id} ${e.name}`,
            ).toBeGreaterThan(radius);
        }
      }
    });

    it('the wording follows the checkpoint-clarity rules for the sector legs', () => {
      for (const leg of def.legs) {
        if (leg.kind === 'destroyTargets') expect(leg.text).toContain(`Destroy the ${leg.targets.length} `);
        if (leg.kind === 'holdArea')
          expect(leg.text).toMatch(new RegExp(`^Keep the .+ for ${leg.holdSec} seconds`));
      }
    });
  });
}

/** The measured playthroughs and the "seen" escapes of one district's missions (see the file header). */
export function describeDistrictPlay(ids: readonly string[]): void {
  const runs = new Map<string, PlayResult[]>();
  const play = (id: string, level: CampaignLevel): PlayResult[] => {
    const key = `${id}/${level}`;
    let r = runs.get(key);
    if (!r) {
      r = SEEDS.map((seed) => playMission(id, level, seed));
      runs.set(key, r);
      const line = r.map((x) => (x.result === 'won' ? `${x.fieldSec}s/${x.livesUsed}` : x.result)).join(' ');
      console.log(
        `[districts-a] ${key}: ${r.filter((x) => x.result === 'won').length}/${r.length} won | ${line}`,
      );
    }
    return r;
  };
  const won = (rs: PlayResult[]): number => rs.filter((r) => r.result === 'won').length;

  describe.each(ids)('%s: a scripted generator-first playthrough (real bots, real combat)', (id) => {
    const def = FIELD_MISSION_DEFS[id]!;

    it(
      'completes every leg within the clock on Normal in a majority of seeds; doors through resolveRaid',
      () => {
        const rs = play(id, 'normal');
        expect(won(rs), id).toBeGreaterThan(SEEDS.length / 2);
        for (const r of rs.filter((x) => x.result === 'won')) {
          expect(r.legSec.length, `${id} seed ${r.seed} legs`).toBe(def.legs.length);
          expect(r.fieldSec, `${id} seed ${r.seed}`).toBeLessThanOrEqual(def.timeLimitSec);
          expect(r.laid, `${id} seed ${r.seed}: generators are the means`).toBeGreaterThan(0);
          if (def.doors.some((d) => d.required)) expect(r.raidSec).toBeGreaterThan(0);
        }
      },
      PLAY_TIMEOUT,
    );

    it(
      'Easy completes at least as often as Normal',
      () => {
        expect(won(play(id, 'easy')), id).toBeGreaterThanOrEqual(won(play(id, 'normal')));
      },
      PLAY_TIMEOUT,
    );

    it(
      'an ordinary enemy that SAW a badly placed generator escapes it in a majority of seeds',
      () => {
        const { s } = missionMatch(id, 'normal', 1);
        const ordinary = s.players.filter(
          (p) => p.enemyKind !== undefined && !enemyDef(p.enemyKind).steadfast,
        );
        expect(ordinary.length).toBeGreaterThan(0);
        for (const e of ordinary) {
          let staged = 0;
          let escaped = 0;
          for (const seed of SEEDS) {
            const r = seenOnMission(id, 'normal', seed, e.id);
            if (!r) continue;
            staged++;
            if (!r.hit) escaped++;
          }
          expect(staged, `${id} ${e.enemyVariant} staged`).toBeGreaterThanOrEqual(4);
          expect(escaped, `${id} ${e.enemyVariant} escapes`).toBeGreaterThan(staged / 2);
        }
      },
      PLAY_TIMEOUT,
    );
  });

  describe(`${ids.join(' + ')}: difficulty`, () => {
    it(
      'Hard costs measurably more than Normal (time, lives, failures), Easy no more than Normal',
      () => {
        const cost = (level: CampaignLevel): number =>
          ids.reduce(
            (sum, id) =>
              sum + play(id, level).reduce((a, r) => a + runCost(r, FIELD_MISSION_DEFS[id]!.timeLimitSec), 0),
            0,
          );
        const [easy, normal, hard] = LEVELS.map(cost) as [number, number, number];
        console.log(
          `[districts-a] cost easy ${easy.toFixed(0)} normal ${normal.toFixed(0)} hard ${hard.toFixed(0)}`,
        );
        expect(hard).toBeGreaterThan(normal * 1.05);
        expect(easy).toBeLessThanOrEqual(normal * 1.05);
      },
      PLAY_TIMEOUT,
    );
  });
}
