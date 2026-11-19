/**
 * The mission briefing model (docs/MISSION_GUIDANCE.md, decisions MG1-MG3) against the REAL data of all 21 campaign
 * missions and all 6 raids: the main objective is the mission's real main leg (or the boss's first phase, or the raid's
 * marked cargo), the counts are the real counts, "USE GENERATOR BLASTS" appears exactly where only blasts work, and a raid
 * says cross-shaped, never round / radial.
 */
import { describe, expect, it } from 'vitest';
import { allSectionMissions } from '../../src/campaign/content/sections';
import {
  BLASTS_ONLY,
  mainLegIndex,
  markedCount,
  missionBrief,
  pluralLabel,
  raidBrief,
  whereOnBoard,
} from '../../src/app/missionBrief';
import type { MissionBrief } from '../../src/app/missionBrief';
import { FIELD_MISSION_DEFS, MISSION_DEFS, RAID_DEFS, RAID_IDS, tuningFor } from '../../src/sim';
import type { MissionId, RaidId } from '../../src/sim';
import { GLYPHS } from '../../src/render/objectiveGlyphs';

const missions = allSectionMissions();
const text = (b: MissionBrief): string =>
  [b.objective.line, ...b.action, b.blast, b.exit ?? '', b.compact, ...b.steps.map((s) => s.text)].join(' | ');

describe('every campaign mission has a briefing', () => {
  it('21 missions, each with a briefing of its own format', () => {
    expect(missions).toHaveLength(21);
    for (const m of missions) {
      const b = missionBrief(m.id);
      expect(b, m.id).not.toBeNull();
      expect(b!.id).toBe(m.id);
      expect(b!.kind).toBe(m.format);
      expect(b!.title).toBe(m.name);
      expect(b!.objective.line.length, m.id).toBeGreaterThan(5);
      expect(b!.action.length, m.id).toBeGreaterThanOrEqual(1);
      expect(b!.action.length, m.id).toBeLessThanOrEqual(2);
      expect(GLYPHS[b!.picture.glyph], m.id).toBeDefined();
      expect(b!.steps.filter((s) => s.main), m.id).toHaveLength(1);
    }
    expect(missionBrief('nope.mission')).toBeNull();
  });

  it('field missions: the objective is the real main leg with its real count', () => {
    const fields = missions.filter((m) => m.format === 'field');
    expect(fields).toHaveLength(13);
    for (const m of fields) {
      const def = FIELD_MISSION_DEFS[m.missionRef]!;
      const b = missionBrief(m.id)!;
      const leg = def.legs[mainLegIndex(def)]!;
      // the main leg is the first destroyTargets leg when the mission has one
      const firstDestroy = def.legs.findIndex((l) => l.kind === 'destroyTargets');
      if (firstDestroy >= 0) expect(mainLegIndex(def), m.id).toBe(firstDestroy);
      switch (leg.kind) {
        case 'destroyTargets':
          expect(b.objective.count, m.id).toBe(leg.targets.length);
          expect(b.objective.line, m.id).toBe(
            `DESTROY ${leg.targets.length} ${pluralLabel(leg.targets[0]!.label, leg.targets.length)}`,
          );
          expect(b.picture.model, m.id).toEqual({ kind: 'equipment', equipment: leg.targets[0]!.kind });
          break;
        case 'holdArea':
          expect(b.objective.count, m.id).toBe(leg.holdSec);
          expect(b.objective.line, m.id).toBe(`SECURE THE ${leg.area.label} ${leg.holdSec} s`);
          expect(b.picture.glyph).toBe('area');
          break;
        case 'door': {
          const door = def.doors.find((d) => d.id === leg.doorId)!;
          expect(b.objective.line, m.id).toBe(`RAID THE ${door.label}`);
          expect(b.picture.model).toEqual({ kind: 'door' });
          // the raid behind the door is named with its real cargo count
          expect(b.action[0]).toContain(`destroy ${markedCount(RAID_DEFS[door.raidId])} marked cargo`);
          break;
        }
        default:
          throw new Error(`${m.id}: unexpected main leg ${leg.kind}`);
      }
      // the steps are the real legs in order, then the return
      expect(b.steps).toHaveLength(def.legs.length + 1);
      expect(b.steps[b.steps.length - 1]!.text).toBe(`RETURN TO ${def.returnMarker.label}`);
      for (const [i, l] of def.legs.entries()) {
        if (l.kind === 'clearGroup')
          expect(b.steps[i]!.text).toContain(`DEFEAT ${def.enemies.filter((e) => e.group === l.group).length}`);
        if (l.kind === 'reachMarkers') expect(b.steps[i]!.text).toContain(`${l.markers.length} CHECKPOINT`);
        if (l.kind === 'destroyTargets') expect(b.steps[i]!.text).toContain(`DESTROY ${l.targets.length} `);
      }
    }
  });

  it('boss missions: the first phase of the real recipe, every phase and the hits', () => {
    const bosses = missions.filter((m) => m.format === 'boss');
    expect(bosses).toHaveLength(7);
    for (const m of bosses) {
      const def = MISSION_DEFS[m.missionRef as MissionId];
      const tuning = tuningFor({ id: def.id });
      const b = missionBrief(m.id)!;
      expect(b.objective.count, m.id).toBe(def.phases[0].goal ?? tuning.phases[0].goal);
      tuning.phases.forEach((p, i) => {
        expect(b.steps[i]!.text, `${m.id} phase ${i}`).toMatch(new RegExp(`^PHASE ${i + 1}: .*\\b${p.goal}\\b`));
        expect(b.steps[i]!.text).toContain(p.goal === def.phases[i].nodes.length ? 'ALL' : `OF ${def.phases[i].nodes.length}`);
      });
      expect(b.steps[3]!.text).toContain(`${def.recipe.hits} TIMES`);
      expect(b.picture.model).toEqual({ kind: 'bossNode', objective: def.objective });
      // the phase-one callout is the boss's own line
      expect(b.action[0]).toContain(def.phases[0].callout);
    }
  });

  it('the standalone raid mission is the real raid', () => {
    const raids = missions.filter((m) => m.format === 'raid');
    expect(raids).toHaveLength(1);
    for (const m of raids) {
      const b = missionBrief(m.id)!;
      expect(b.objective.count).toBe(markedCount(RAID_DEFS[m.missionRef as RaidId]));
      expect(b.blastRule).toBe('cross');
    }
  });

  it('"USE GENERATOR BLASTS" appears exactly where only blasts work', () => {
    for (const m of missions) {
      const b = missionBrief(m.id)!;
      const def = m.format === 'field' ? FIELD_MISSION_DEFS[m.missionRef]! : null;
      const expected = def ? def.legs[mainLegIndex(def)]!.kind === 'destroyTargets' : true; // bosses and raids: blasts
      expect(b.blastsOnly, m.id).toBe(expected);
      expect(b.action.join(' ').includes(BLASTS_ONLY), m.id).toBe(expected);
      expect(b.compact.includes('BLASTS ONLY'), m.id).toBe(expected);
      if (def)
        def.legs.forEach((l, i) =>
          expect(b.steps[i]!.blastsOnly, `${m.id} step ${i}`).toBe(l.kind === 'destroyTargets' || l.kind === 'door'),
        );
    }
  });

  it('field and boss missions name the round blast (their ruleset), never the cross', () => {
    for (const m of missions.filter((o) => o.format !== 'raid')) {
      const b = missionBrief(m.id)!;
      expect(b.blastRule).toBe('radial');
      expect(b.blast).toMatch(/^ROUND BLASTS/);
      expect(text(b)).not.toMatch(/CROSS/i);
    }
  });
});

describe('every raid has a briefing', () => {
  it('six raids: cross-shaped (never radial / round), the real marked count, the exit and the obstacles', () => {
    expect(RAID_IDS).toHaveLength(6);
    for (const id of RAID_IDS) {
      const def = RAID_DEFS[id];
      const b = raidBrief(id);
      const n = def.layout.join('').split('').filter((c) => c === 'M').length;
      expect(n, id).toBeGreaterThan(0);
      expect(b.objective.line).toBe(`DESTROY ${n} MARKED CARGO`);
      expect(b.objective.count).toBe(n);
      expect(b.blastRule).toBe('cross');
      expect(b.blast).toMatch(/^CROSS-SHAPED BLASTS: a generator blasts along its row and column, walls stop it\./);
      expect(b.blast).toContain(`Range ${def.bombs.range} tiles`);
      expect(text(b)).not.toMatch(/radial|round|disc/i);
      expect(b.action[0]).toContain(BLASTS_ONLY);
      expect(b.blastsOnly).toBe(true);
      // the exit: where it opens, read from the layout's 'E'
      const y = def.layout.findIndex((r) => r.includes('E'));
      const x = def.layout[y]!.indexOf('E');
      expect(b.exit).toContain(whereOnBoard(x, y, def.layout[0]!.length, def.layout.length));
      // the legend: the marked target, the ordinary obstacles, the exit
      expect(b.legend.map((l) => l.tag)).toEqual(['TARGET', 'OBSTACLE', 'EXIT']);
      expect(b.legend[0]!.glyph).toBe('cargo');
      expect(b.legend[1]!.glyph).toBe('crate');
      if (def.layout.join('').includes('x')) expect(b.legend[1]!.text).toMatch(/^Plain crates/);
      expect(b.picture.model).toEqual({ kind: 'cargo' });
    }
  });

  it('where on the board', () => {
    expect(whereOnBoard(15, 11, 17, 13)).toBe('south-east corner');
    expect(whereOnBoard(14, 1, 17, 11)).toBe('north-east corner');
    expect(whereOnBoard(5, 9, 15, 11)).toBe('south side');
    expect(whereOnBoard(8, 6, 17, 13)).toBe('middle');
  });

  it('plural labels', () => {
    expect(pluralLabel('RELAY BOX', 3)).toBe('RELAY BOXES');
    expect(pluralLabel('RECEIPT PRESS', 5)).toBe('RECEIPT PRESSES');
    expect(pluralLabel('CONTROL POINT', 5)).toBe('CONTROL POINTS');
    expect(pluralLabel('GATE LOCK', 1)).toBe('GATE LOCK');
  });
});
