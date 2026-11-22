/**
 * The Test Lab's entries (docs/TEST_LAB.md). Each entry is a Full Playtest (the REAL modes, arenas, enemies, objectives
 * and controls, started through their normal paths) or an Isolated Scenario (a small deterministic set-up of the real raid
 * mechanics), and sits in one of two groups: "Tests Requiring Review" (shown first, in order) or "Completed Tests" (the
 * ones the founder already approved; still launchable). Data only: `controller.ts` knows how to launch each `launch` kind.
 */
import type { Difficulty, MissionId, RaidId } from '../sim';
import type { ScenarioId } from './scenarios/defs';

export type EntrySection = 'playtest' | 'scenario';
/** Where an entry shows on Home: the review list (prominent, in order) or the collapsed completed list. */
export type EntryGroup = 'review' | 'completed';

export type LabLaunch =
  /** A classic raid on its own through the campaign controller's no-save raid path. */
  | { kind: 'raid'; raidId: RaidId }
  /** A campaign field mission through the real campaign controller (its depot door raises the real raid). */
  | { kind: 'field'; missionId: string }
  /** A campaign boss mission through the real campaign controller. */
  | { kind: 'boss'; districtId: MissionId }
  /** A local Classic Blast match through the normal match start (the saved-settings path, in memory). */
  | { kind: 'classic'; arenaId: string }
  /** A local City Rumble match through the normal match start. `difficulty` set: that bot level (no Easy / Normal / Hard). */
  | {
      kind: 'rumble';
      arenaId: string;
      mode: 'survival' | 'deathmatch' | 'team';
      competitors: 8 | 16 | 24 | 32;
      difficulty?: Difficulty;
    }
  /**
   * A local City Rumble match with the set-up held by the lab (`rumbleSetup.ts`): the same fields a normal match reads from
   * the saved settings, optionally copied from them ("Use Current Rumble Settings"). Decision TL6.
   */
  | { kind: 'rumbleConfigured' }
  /** The normal game's own temporary Sudden Death test match (a real City Rumble that starts in the sudden-death round). */
  | { kind: 'suddenDeath' }
  /** A prepared raid (`scenarios/defs.ts`). */
  | { kind: 'scenario'; scenarioId: ScenarioId };

/** One choice of an entry that has several prepared set-ups (a chip row on the card; the first is the default). */
export interface LabVariant {
  id: string;
  label: string;
  scenarioId: ScenarioId;
}

export interface LabEntry {
  id: string;
  section: EntrySection;
  group: EntryGroup;
  /** A short title. */
  title: string;
  /** One line: what the tester should try. */
  objective: string;
  /** What to look for while playing (shown on the card). */
  lookFor?: string;
  /** What the entry launches (for the detail card and docs/TEST_LAB.md). */
  launches: string;
  /** Easy / Normal / Hard applies (campaign level for raids, field and boss; bot level for Classic and Rumble). */
  levels: boolean;
  /** The entry offers the three playable fighters. */
  fighter?: boolean;
  /** The entry shows the frame-rate line (`?fps`) while it runs. */
  fps?: boolean;
  /** Scenario entries with several set-ups: the card offers them and Start uses the chosen one's `scenarioId`. */
  variants?: readonly LabVariant[];
  launch: LabLaunch;
}

export const LAB_ENTRIES: readonly LabEntry[] = [
  // ---------------------------------------------------------------- Tests Requiring Review (in this order)
  {
    id: 'cityRumble',
    section: 'playtest',
    group: 'review',
    title: 'City Rumble parity',
    objective:
      'Play a City Rumble with the same settings as your normal match and judge whether it feels the same.',
    lookFor:
      'Tap Use Current Rumble Settings and check the configuration: it should feel as hard as your normal match. Then change the level, mode, size or stage and compare.',
    launches:
      'A real City Rumble through the normal match start: stage, mode, fighters, bot level (all seven, Rookie is the default), duration, fighter and mixed roster as listed on the card.',
    levels: false,
    launch: { kind: 'rumbleConfigured' },
  },
  {
    id: 'occludedBuildings',
    section: 'playtest',
    group: 'review',
    title: 'Occluded building visibility',
    objective: 'Walk under and behind the tall buildings of Lekki: the ones covering you should fade out.',
    lookFor:
      'A building between the camera and you (or the floor around you) goes see-through, comes back solid when you step out, and nothing flickers.',
    launches:
      'A real City Rumble on the Lekki stage (Free-for-All, 8 fighters, Rookie bots, follow camera): the arena whose buildings fade when they cover the fighter.',
    levels: false,
    launch: {
      kind: 'rumble',
      arenaId: 'rumbleLekki',
      mode: 'deathmatch',
      competitors: 8,
      difficulty: 'rookie',
    },
  },
  {
    id: 'suddenDeath',
    section: 'playtest',
    group: 'review',
    title: 'Sudden Death banner and victory',
    objective: 'Play a City Rumble round that starts in Sudden Death, and win or lose it.',
    lookFor:
      'The SUDDEN DEATH banner and card, the blast clock beside the board, and a clear victory or defeat screen when it ends.',
    launches:
      'The game’s own Sudden Death test match: a real City Rumble on the Ojuelegba stage, you and two bots, straight into the sudden-death round.',
    levels: false,
    launch: { kind: 'suddenDeath' },
  },
  {
    id: 'boss',
    section: 'playtest',
    group: 'review',
    title: 'Boss encounter',
    objective: 'Defeat the Oshodi boss on Easy, then on Normal.',
    lookFor:
      'His model and attacks, how readable his wind-ups are, the crew around him, and whether Easy is clearly kinder than Normal.',
    launches: 'The Oshodi boss mission through the real campaign controller (unlocked here, nothing saved).',
    levels: true,
    launch: { kind: 'boss', districtId: 'oshodi' },
  },
  {
    id: 'classicRearAmbush',
    section: 'playtest',
    group: 'review',
    title: 'Classic rear ambush',
    objective: 'In the real first raid, creep up behind a guard and take it out with one generator.',
    lookFor:
      'A calm guard does not see or hear you behind it, a generator laid there is a quiet click, and one blast defeats an ordinary guard.',
    launches:
      'The real first Oshodi classic raid (Dispatch Depot, the depot door raid of Terminal Approach), played on its own.',
    levels: true,
    launch: { kind: 'raid', raidId: 'warehouseDispatchDepot' },
  },
  {
    id: 'oneHit',
    section: 'scenario',
    group: 'review',
    title: 'One-hit lethality',
    objective:
      'Creep up behind an enemy at its post, lay a generator and step away: one blast should defeat it.',
    lookFor:
      'The agbero, the guard and the thrower each fall to a single blast on Easy and Normal. Lay within a couple of seconds: a post turns a quarter every few seconds. Hard hears the generator, by design.',
    launches:
      'Depot, one ordinary enemy at the entrance post facing into the depot, you two steps behind it. Pick Agbero, Guard or Thrower.',
    levels: true,
    variants: [
      { id: 'agbero', label: 'Agbero', scenarioId: 'oneHitAgbero' },
      { id: 'guard', label: 'Guard', scenarioId: 'oneHitGuard' },
      { id: 'thrower', label: 'Thrower', scenarioId: 'oneHitThrower' },
    ],
    launch: { kind: 'scenario', scenarioId: 'oneHitAgbero' },
  },
  {
    id: 'identifyPlayer',
    section: 'scenario',
    group: 'review',
    title: 'Player-identification variants',
    objective: 'Compare the three marker styles among 5 enemies and say which makes you easiest to find.',
    lookFor:
      'Original: the small chevron and You tag. Indicator: one YOU plate over your head. Indicator + Ground: the plate and a ring on the floor under you.',
    launches:
      'Depot, five enemies waking close around you; a live marker switch (Original / Indicator / Indicator + Ground) on the card, in the pause menu and on a HUD button.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'identifyPlayer' },
  },
  // ---------------------------------------------------------------- Completed Tests (approved; still launchable)
  {
    id: 'classicRaid',
    section: 'playtest',
    group: 'completed',
    title: 'Classic Campaign Raid',
    objective: 'Break the 3 marked dispatch crates in the depot and reach the exit.',
    launches:
      'The first Oshodi classic raid (Dispatch Depot, the depot door raid of Terminal Approach), played on its own.',
    levels: true,
    launch: { kind: 'raid', raidId: 'warehouseDispatchDepot' },
  },
  {
    id: 'recordsVault',
    section: 'playtest',
    group: 'completed',
    title: 'Records Vault, night raid',
    objective: 'Work through the dark vault by flashlight, past the guard torches, and break the 3 cabinets.',
    launches: 'The complete Records Vault night raid (flashlight, guard beams, light-based detection).',
    levels: true,
    launch: { kind: 'raid', raidId: 'recordsVault' },
  },
  {
    id: 'classicBlast',
    section: 'playtest',
    group: 'completed',
    title: 'Classic Blast',
    objective: 'Win a standard 4-player Classic Blast match against 3 bots.',
    launches:
      'A real Classic Blast match (Danfo Bus Park, one human and 3 bots, the normal rules and Wahala Crush).',
    levels: true,
    launch: { kind: 'classic', arenaId: 'danfoBusPark' },
  },
  {
    id: 'fieldMission',
    section: 'playtest',
    group: 'completed',
    title: 'Campaign field mission',
    objective: 'Walk the 3 checkpoints, raid the depot door and walk back out.',
    launches:
      'Terminal Approach (oshodi.approach) through the real campaign controller: its enemies, objectives and the depot door raid.',
    levels: true,
    launch: { kind: 'field', missionId: 'oshodi.approach' },
  },
  {
    id: 'roster',
    section: 'playtest',
    group: 'completed',
    title: 'Characters and performance',
    objective: 'Play a big Team Rumble with the fighter you pick and watch the frame rate.',
    launches: 'A real Team City Rumble (Lagos Island stage, 24 fighters) with the fps line on.',
    levels: true,
    fighter: true,
    fps: true,
    launch: { kind: 'rumble', arenaId: 'rumbleLagosIsland', mode: 'team', competitors: 24 },
  },
  {
    id: 'rearApproach',
    section: 'scenario',
    group: 'completed',
    title: 'Rear approach',
    objective: 'Walk up behind the patrolling guard, unseen, and lay a generator.',
    launches: 'Depot, one guard on its patrol; you start behind it, outside its view cone.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'rearApproach' },
  },
  {
    id: 'patrolAmbush',
    section: 'scenario',
    group: 'completed',
    title: 'Patrol-route ambush',
    objective: 'Stay hidden by a corner of the guard’s loop and catch it as it comes round.',
    launches: 'Depot, one guard on its clockwork loop; you start hidden near a corner of it.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'patrolAmbush' },
  },
  {
    id: 'punchDodge',
    section: 'scenario',
    group: 'completed',
    title: 'Punch warning and dodge',
    objective: 'Read the guard’s wind-up and step out of the punch.',
    launches: 'Depot, one guard waking right beside you, with free tiles to step to.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'punchDodge' },
  },
  {
    id: 'pursuit',
    section: 'scenario',
    group: 'completed',
    title: 'Pursuit and disengaging',
    objective: 'Get chased by five enemies, then break line of sight and lose them.',
    launches: 'Depot, three guards and two throwers; you start in the open east lane.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'pursuit' },
  },
  {
    id: 'flashlight',
    section: 'scenario',
    group: 'completed',
    title: 'Flashlight and detection',
    objective: 'Watch how your flashlight and the guard’s torch decide who is seen.',
    launches: 'Records Vault at night, one torch guard on its route; you start in the dark nearby.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'flashlight' },
  },
];

export function entryById(id: string): LabEntry | undefined {
  return LAB_ENTRIES.find((e) => e.id === id);
}

export const entriesIn = (section: EntrySection): readonly LabEntry[] =>
  LAB_ENTRIES.filter((e) => e.section === section);

/** The entries of one Home group, in display order. */
export const entriesOf = (group: EntryGroup): readonly LabEntry[] =>
  LAB_ENTRIES.filter((e) => e.group === group);

/** The scenario an entry starts: its chosen variant, or its own launch scenario. */
export function scenarioIdFor(entry: LabEntry, variantId?: string): ScenarioId | undefined {
  if (entry.launch.kind !== 'scenario') return undefined;
  const v = entry.variants?.find((x) => x.id === variantId) ?? entry.variants?.[0];
  return v ? v.scenarioId : entry.launch.scenarioId;
}
