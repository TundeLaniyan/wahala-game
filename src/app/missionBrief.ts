/**
 * The mission briefing model (docs/MISSION_GUIDANCE.md, decisions MG1-MG3): what the short visual briefing before every
 * campaign mission says, for a field mission, a boss mission and a classic raid alike. A pure function of the REAL
 * mission data (the field legs, the boss recipe and its phases, the raid definition); it invents no number:
 *
 *   - ONE main objective in plain words with its real count ("DESTROY 3 RELAY BOXES", "SECURE THE LORRY BAY 40 s",
 *     "DESTROY 3 MARKED CARGO");
 *   - the picture of the actual target (which in-game object to preview, and its glyph as the fallback);
 *   - one or two action lines, with "USE GENERATOR BLASTS" exactly where only blasts work, and the active blast pattern
 *     (round in field and boss missions, cross-shaped in raids: `BLAST_RULE_BY_GAME`);
 *   - the route as short steps, and for a raid the legend (target / obstacle / exit) and where the exit is.
 *
 * The briefing card (`ui/campaign/MissionBriefCard.tsx`) renders it before a field mission, inside the boss briefing, at
 * the door-to-raid hand-over and, compact, in the pause menu.
 */
import { CAMPAIGN, bossFor, getSectionMission, sectionOfMission } from '../campaign';
import type { SectionMissionDef } from '../campaign';
import {
  BLAST_RULE_BY_GAME,
  DOOR_HOLD_TICKS,
  FIELD_MISSION_DEFS,
  MISSION_DEFS,
  RAID_DEFS,
  tuningFor,
} from '../sim';
import type { FieldLegDef, FieldMissionDef, MissionId, ObjectiveKind, RaidDef, RaidId } from '../sim';
import type { GlyphId } from '../render/objectiveGlyphs';
import type { PreviewModel } from '../render/briefPreview';

/** The phrase that marks "only generator blasts do this" (the tests look for it). */
export const BLASTS_ONLY = 'USE GENERATOR BLASTS';

/** Which in-game object the briefing previews in 3D (null: the glyph is the picture). */
export type BriefModel = PreviewModel;

export interface BriefPicture {
  glyph: GlyphId;
  model: BriefModel | null;
  /** What the picture shows ("RELAY BOX", "MARKED CARGO", "DISPATCH DEPOT DOOR"). */
  label: string;
}

export interface BriefObjective {
  /** "DESTROY", "SECURE", "RAID", "WALK THROUGH" ... */
  verb: string;
  /** The real count (targets, enemies, seconds), null when the objective has none. */
  count: number | null;
  /** "RELAY BOXES", "MARKED CARGO", "s" ... */
  unit: string;
  /** The whole line: "DESTROY 3 RELAY BOXES". */
  line: string;
}

export interface BriefStep {
  glyph: GlyphId;
  /** "DESTROY 3 RELAY BOXES". */
  text: string;
  /** Only generator blasts complete this step. */
  blastsOnly: boolean;
  /** The step the main objective is. */
  main: boolean;
}

export interface BriefLegend {
  glyph: GlyphId;
  /** "TARGET", "OBSTACLE", "EXIT". */
  tag: string;
  /** "Marked cargo", "Plain crates and barrels", "Exit (opens last)". */
  text: string;
}

export interface MissionBrief {
  /** The section mission id ("oshodi.approach"), or `raid:<raidId>` for a door raid. */
  id: string;
  kind: 'field' | 'boss' | 'raid';
  district: string;
  title: string;
  objective: BriefObjective;
  picture: BriefPicture;
  /** One or two short lines: how the objective is done. */
  action: string[];
  /** The blast pattern of this mission, in words ("CROSS-SHAPED BLASTS: ..."). */
  blast: string;
  blastRule: 'cross' | 'radial';
  /** Only generator blasts complete the main objective. */
  blastsOnly: boolean;
  steps: BriefStep[];
  /** Raids: the marked target against the ordinary obstacles and the exit. */
  legend: BriefLegend[];
  /** Raids: where the exit opens ("Then the exit opens in the south-east corner: walk onto it."). */
  exit: string | null;
  /** One line for a replay and the pause menu: the main objective (+ "BLASTS ONLY"). */
  compact: string;
}

// ------------------------------------------------------------------ words

/** "RELAY BOX" -> "RELAY BOXES", "STAMP MACHINE" -> "STAMP MACHINES", one -> itself. */
export function pluralLabel(label: string, n: number): string {
  if (n === 1) return label;
  if (/(S|X|Z|CH|SH)$/.test(label)) return `${label}ES`;
  return `${label}S`;
}

const BLAST_TEXT: Readonly<Record<'cross' | 'radial', string>> = {
  cross: 'CROSS-SHAPED BLASTS: a generator blasts along its row and column, walls stop it.',
  radial: 'ROUND BLASTS: a generator blasts a disc around it; walls and crates shadow it.',
};

/** "1 second" from the door hold (`DOOR_HOLD_TICKS`). */
const holdSeconds = (): string => {
  const s = DOOR_HOLD_TICKS / 60;
  return `${s} ${s === 1 ? 'second' : 'seconds'}`;
};

/** The compass corner or side of a tile on a board ("south-east corner", "north side", "middle"). */
export function whereOnBoard(x: number, y: number, width: number, height: number): string {
  const third = (v: number, size: number): -1 | 0 | 1 => (v < size / 3 ? -1 : v >= (2 * size) / 3 ? 1 : 0);
  const ns = third(y, height);
  const ew = third(x, width);
  const n = ns === -1 ? 'north' : ns === 1 ? 'south' : '';
  const e = ew === -1 ? 'west' : ew === 1 ? 'east' : '';
  if (n && e) return `${n}-${e} corner`;
  if (n || e) return `${n || e} side`;
  return 'middle';
}

// ------------------------------------------------------------------ field missions

const enemiesOf = (def: FieldMissionDef, group: string): number =>
  def.enemies.filter((e) => e.group === group).length;

/** The same label for every target of a leg, else a neutral word. */
function targetsLabel(leg: Extract<FieldLegDef, { kind: 'destroyTargets' }>): string {
  const labels = new Set(leg.targets.map((t) => t.label));
  return labels.size === 1 ? leg.targets[0]!.label : 'TARGET';
}

/** Separate blasts each piece takes (null when they differ). */
function targetsHp(leg: Extract<FieldLegDef, { kind: 'destroyTargets' }>): number | null {
  const hps = new Set(leg.targets.map((t) => t.hp ?? 1));
  return hps.size === 1 ? [...hps][0]! : null;
}

interface LegWords {
  objective: BriefObjective;
  glyph: GlyphId;
  blastsOnly: boolean;
}

function legWords(def: FieldMissionDef, leg: FieldLegDef): LegWords {
  const obj = (verb: string, count: number | null, unit: string, line: string): BriefObjective => ({
    verb,
    count,
    unit,
    line,
  });
  switch (leg.kind) {
    case 'reachMarkers': {
      const n = leg.markers.length;
      const unit = pluralLabel('CHECKPOINT', n);
      return {
        objective: obj('WALK THROUGH', n, unit, `WALK THROUGH ${n} ${unit}`),
        glyph: 'checkpoint',
        blastsOnly: false,
      };
    }
    case 'clearGroup': {
      const n = enemiesOf(def, leg.group);
      const unit = n === 1 ? 'ENEMY' : 'ENEMIES';
      return {
        objective: obj('DEFEAT', n, unit, `DEFEAT ${n} ${unit}`),
        glyph: 'enemies',
        blastsOnly: false,
      };
    }
    case 'escapeRoute':
      return {
        objective: obj('ESCAPE', null, leg.exit.label, `ESCAPE TO ${leg.exit.label}`),
        glyph: 'exit',
        blastsOnly: false,
      };
    case 'door': {
      const door = def.doors.find((d) => d.id === leg.doorId);
      const label = door?.label ?? 'THE DOOR';
      return { objective: obj('RAID', null, label, `RAID THE ${label}`), glyph: 'door', blastsOnly: false };
    }
    case 'destroyTargets': {
      const n = leg.targets.length;
      const unit = pluralLabel(targetsLabel(leg), n);
      return {
        objective: obj('DESTROY', n, unit, `DESTROY ${n} ${unit}`),
        glyph: 'equipment',
        blastsOnly: true,
      };
    }
    case 'holdArea': {
      const s = Math.round(leg.holdSec);
      return {
        objective: obj('SECURE', s, 's', `SECURE THE ${leg.area.label} ${s} s`),
        glyph: 'area',
        blastsOnly: false,
      };
    }
  }
}

/**
 * The leg the briefing leads with: the Ring equipment to wreck first (what the mission is for), else the door raid, the
 * area to hold, the group to beat, the escape, the checkpoints. Ties go to the earlier leg.
 */
const MAIN_ORDER: readonly FieldLegDef['kind'][] = [
  'destroyTargets',
  'door',
  'holdArea',
  'clearGroup',
  'escapeRoute',
  'reachMarkers',
];

export function mainLegIndex(def: FieldMissionDef): number {
  for (const kind of MAIN_ORDER) {
    const i = def.legs.findIndex((l) => l.kind === kind);
    if (i >= 0) return i;
  }
  return 0;
}

function fieldPicture(def: FieldMissionDef, leg: FieldLegDef): BriefPicture {
  switch (leg.kind) {
    case 'destroyTargets':
      return {
        glyph: 'equipment',
        model: { kind: 'equipment', equipment: leg.targets[0]!.kind },
        label: targetsLabel(leg),
      };
    case 'door': {
      const door = def.doors.find((d) => d.id === leg.doorId);
      return { glyph: 'door', model: { kind: 'door' }, label: `${door?.label ?? ''} DOOR`.trim() };
    }
    case 'holdArea':
      return { glyph: 'area', model: null, label: leg.area.label };
    case 'clearGroup':
      return { glyph: 'enemies', model: null, label: 'ENEMY GROUP' };
    case 'escapeRoute':
      return { glyph: 'exit', model: null, label: leg.exit.label };
    case 'reachMarkers':
      return { glyph: 'checkpoint', model: null, label: 'CHECKPOINT' };
  }
}

function fieldAction(def: FieldMissionDef, leg: FieldLegDef): string[] {
  switch (leg.kind) {
    case 'destroyTargets': {
      const hp = targetsHp(leg);
      const each = hp && hp > 1 ? ` Each one takes ${hp} separate blasts.` : '';
      return [
        `${BLASTS_ONLY}: lay a generator next to each one.${each}`,
        'Punches and vehicles do nothing to them.',
      ];
    }
    case 'door': {
      const door = def.doors.find((d) => d.id === leg.doorId);
      const raid = door ? RAID_DEFS[door.raidId] : undefined;
      const inside = raid ? ` Inside: destroy ${markedCount(raid)} marked cargo.` : '';
      return [`Stand on the door for ${holdSeconds()} to start the raid.${inside}`];
    }
    case 'holdArea':
      return ['Stay inside the area while no enemy is in it: the clock only runs then.'];
    case 'clearGroup':
      return ['Every one of them must go down.'];
    case 'escapeRoute':
      return ["Run: don't let the pursuer stay next to you."];
    case 'reachMarkers':
      return ['Walk straight through each one, no waiting.'];
  }
}

function fieldBrief(m: SectionMissionDef, def: FieldMissionDef, district: string): MissionBrief {
  const main = mainLegIndex(def);
  const leg = def.legs[main]!;
  const words = legWords(def, leg);
  const steps: BriefStep[] = def.legs.map((l, i) => {
    const w = legWords(def, l);
    // a door's raid is won with blasts (the cargo behind it): the step says so
    const raidStep = l.kind === 'door';
    return { glyph: w.glyph, text: w.objective.line, blastsOnly: w.blastsOnly || raidStep, main: i === main };
  });
  steps.push({ glyph: 'exit', text: `RETURN TO ${def.returnMarker.label}`, blastsOnly: false, main: false });
  const rule = BLAST_RULE_BY_GAME.mission;
  return {
    id: m.id,
    kind: 'field',
    district,
    title: m.name,
    objective: words.objective,
    picture: fieldPicture(def, leg),
    action: fieldAction(def, leg),
    blast: BLAST_TEXT[rule],
    blastRule: rule,
    blastsOnly: words.blastsOnly,
    steps,
    legend: [],
    exit: null,
    compact: words.blastsOnly ? `${words.objective.line} · BLASTS ONLY` : words.objective.line,
  };
}

// ------------------------------------------------------------------ boss missions

/** The district verb of a boss objective, in plain words, and the unit when the node labels do not say it. */
const BOSS_VERB: Readonly<Record<Exclude<ObjectiveKind, 'fieldRoute'>, { verb: string; unit?: string }>> = {
  dispatchRelays: { verb: 'JAM' },
  supplyRoutes: { verb: 'DESTROY' },
  junctionAccess: { verb: 'BREAK', unit: 'TOLL BOX' },
  dispatchWindows: { verb: 'HIT' },
  evidenceRun: { verb: 'DELIVER' },
  contingencyGrid: { verb: 'SWITCH OFF' },
  controlPoints: { verb: 'SHUT DOWN' },
};

/** "RELAY 1" -> "RELAY", "SWITCH A" -> "SWITCH", "CONTROL POINT" -> itself. */
export const nodeRoot = (label: string): string => label.replace(/\s+(\d+|[A-Z])$/, '');

function bossBrief(m: SectionMissionDef, id: MissionId, district: string): MissionBrief {
  const def = MISSION_DEFS[id];
  const boss = bossFor(id);
  const kind = def.objective as Exclude<ObjectiveKind, 'fieldRoute'>;
  const v = BOSS_VERB[kind];
  const root = v.unit ?? nodeRoot(def.phases[0].nodes[0]!.label);
  // the phase numbers as the sim resolves them (authored values over the defaults, no replay modifier)
  const tuning = tuningFor({ id });
  const goalOf = (i: 0 | 1 | 2): number => tuning.phases[i].goal;
  const phaseLine = (i: 0 | 1 | 2): string => {
    const goal = goalOf(i);
    const nodes = def.phases[i].nodes.length;
    const unit = pluralLabel(root, goal);
    return goal === nodes ? `${v.verb} ALL ${goal} ${unit}` : `${v.verb} ${goal} OF ${nodes} ${unit}`;
  };
  const first = goalOf(0);
  const unit = pluralLabel(root, first);
  const objective: BriefObjective = {
    verb: v.verb,
    count: first,
    unit,
    line: `${v.verb} ${first} ${unit}`,
  };
  const hits = def.recipe.hits;
  const bossName = boss.name.toUpperCase();
  const steps: BriefStep[] = ([0, 1, 2] as const).map((i) => ({
    glyph: 'equipment' as GlyphId,
    text: `PHASE ${i + 1}: ${phaseLine(i)}`,
    blastsOnly: true,
    main: i === 0,
  }));
  steps.push({ glyph: 'boss', text: `BLAST ${bossName} ${hits} TIMES`, blastsOnly: true, main: false });
  const rule = BLAST_RULE_BY_GAME.mission;
  return {
    id: m.id,
    kind: 'boss',
    district,
    title: m.name,
    objective,
    picture: { glyph: 'equipment', model: { kind: 'bossNode', objective: def.objective }, label: root },
    action: [
      `${BLASTS_ONLY}. ${tuning.phases[0].callout}`,
      `Each phase you break exposes ${boss.name}: ${hits} blasts and the fight is won.`,
    ],
    blast: BLAST_TEXT[rule],
    blastRule: rule,
    blastsOnly: true,
    steps,
    legend: [],
    exit: null,
    compact: `${objective.line}, THEN BLAST ${bossName} · BLASTS ONLY`,
  };
}

// ------------------------------------------------------------------ raids

/** Marked cargo in a raid layout ('M' tiles). */
export function markedCount(def: RaidDef): number {
  return def.layout.reduce((n, row) => n + [...row].filter((c) => c === 'M').length, 0);
}

function layoutFind(def: RaidDef, glyph: string): { x: number; y: number } | null {
  for (let y = 0; y < def.layout.length; y++) {
    const x = def.layout[y]!.indexOf(glyph);
    if (x >= 0) return { x, y };
  }
  return null;
}

const countOf = (def: RaidDef, glyph: string): number =>
  def.layout.reduce((n, row) => n + [...row].filter((c) => c === glyph).length, 0);

/** "Plain crates, sturdy crates and barrels" from what the layout really holds. */
function obstaclesText(def: RaidDef): string {
  const parts: string[] = [];
  if (countOf(def, 'x') > 0) parts.push('plain crates');
  if (countOf(def, 'S') > 0) parts.push('sturdy crates');
  if (countOf(def, 'B') > 0) parts.push('barrels');
  if (parts.length === 0) return '';
  const list =
    parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return list.charAt(0).toUpperCase() + list.slice(1);
}

export function raidBrief(raidId: RaidId, section?: SectionMissionDef): MissionBrief {
  const def = RAID_DEFS[raidId];
  const n = markedCount(def);
  const unit = 'MARKED CARGO';
  const width = def.layout[0]!.length;
  const height = def.layout.length;
  const exitAt = layoutFind(def, 'E');
  const where = exitAt ? whereOnBoard(exitAt.x, exitAt.y, width, height) : null;
  const at = where ? (where.endsWith('side') ? `on the ${where}` : `in the ${where}`) : '';
  const exit = where ? `When the last one goes, the exit opens ${at}: walk onto it.` : null;
  const obstacles = obstaclesText(def);
  const barrels = countOf(def, 'B') > 0;
  const each = def.legend.markedHp > 1 ? ` (${def.legend.markedHp} blasts each)` : '';
  const rule = BLAST_RULE_BY_GAME.raid;
  const legend: BriefLegend[] = [
    { glyph: 'cargo', tag: 'TARGET', text: 'Marked cargo: yellow, target cross' },
  ];
  if (obstacles) legend.push({ glyph: 'crate', tag: 'OBSTACLE', text: `${obstacles}: only in the way` });
  legend.push({ glyph: 'exit', tag: 'EXIT', text: 'Opens when the cargo is gone' });
  return {
    id: section?.id ?? `raid:${raidId}`,
    kind: 'raid',
    district: def.district,
    title: section?.name ?? def.name,
    objective: { verb: 'DESTROY', count: n, unit, line: `DESTROY ${n} ${unit}` },
    picture: { glyph: 'cargo', model: { kind: 'cargo' }, label: unit },
    action: [
      `${BLASTS_ONLY}: only blasts break the marked cargo${each}.`,
      ...(obstacles
        ? [
            `${obstacles} are only obstacles: blast them to open a path${barrels ? ' (barrels explode)' : ''}.`,
          ]
        : []),
    ],
    blast: `${BLAST_TEXT[rule]} Range ${def.bombs.range} tiles each way.`,
    blastRule: rule,
    blastsOnly: true,
    steps: [
      { glyph: 'cargo', text: `DESTROY ${n} ${unit}`, blastsOnly: true, main: true },
      { glyph: 'exit', text: 'REACH THE EXIT', blastsOnly: false, main: false },
    ],
    legend,
    exit,
    compact: `DESTROY ${n} ${unit} · BLASTS ONLY · THEN THE EXIT`,
  };
}

// ------------------------------------------------------------------ entry point

const districtName = (id: MissionId): string => CAMPAIGN.districts[id]?.name ?? id;

/** The briefing of a campaign section mission (field, boss or standalone raid); null for an unknown id. */
export function missionBrief(missionId: string): MissionBrief | null {
  const m = getSectionMission(missionId);
  const sec = sectionOfMission(missionId);
  if (!m || !sec) return null;
  const district = districtName(sec.districtId);
  if (m.format === 'boss') return bossBrief(m, sec.districtId, district);
  if (m.format === 'raid') return { ...raidBrief(m.missionRef as RaidId, m), district };
  const def = FIELD_MISSION_DEFS[m.missionRef];
  return def ? fieldBrief(m, def, district) : null;
}

/** The boss mission's section mission id of a district ("oshodi" -> "oshodi.boss"). */
export const bossMissionId = (district: MissionId): string => `${district}.boss`;
