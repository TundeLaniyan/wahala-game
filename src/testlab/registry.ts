/**
 * The Test Lab's entries (docs/TEST_LAB.md): exactly two sections, Full Playtests (the REAL modes, arenas, enemies,
 * objectives and controls, started through their normal paths) and Isolated Scenarios (small deterministic set-ups of the
 * real raid mechanics). Data only: `controller.ts` knows how to launch each `launch` kind.
 */
import type { MissionId, RaidId } from '../sim';
import type { ScenarioId } from './scenarios/defs';

export type EntrySection = 'playtest' | 'scenario';

export type LabLaunch =
  /** A classic raid on its own through the campaign controller's no-save raid path. */
  | { kind: 'raid'; raidId: RaidId }
  /** A campaign field mission through the real campaign controller (its depot door raises the real raid). */
  | { kind: 'field'; missionId: string }
  /** A campaign boss mission through the real campaign controller. */
  | { kind: 'boss'; districtId: MissionId }
  /** A local Classic Blast match through the normal match start (the saved-settings path, in memory). */
  | { kind: 'classic'; arenaId: string }
  /** A local City Rumble match through the normal match start. */
  | {
      kind: 'rumble';
      arenaId: string;
      mode: 'survival' | 'deathmatch' | 'team';
      competitors: 8 | 16 | 24 | 32;
    }
  /** A prepared raid (`scenarios/defs.ts`). */
  | { kind: 'scenario'; scenarioId: ScenarioId };

export interface LabEntry {
  id: string;
  section: EntrySection;
  /** A short title. */
  title: string;
  /** One line: what the tester should try. */
  objective: string;
  /** What the entry launches (for the detail card and docs/TEST_LAB.md). */
  launches: string;
  /** Easy / Normal / Hard applies (campaign level for raids, field and boss; bot level for Classic and Rumble). */
  levels: boolean;
  /** The entry offers the three playable fighters. */
  fighter?: boolean;
  /** The entry shows the frame-rate line (`?fps`) while it runs. */
  fps?: boolean;
  launch: LabLaunch;
}

export const LAB_ENTRIES: readonly LabEntry[] = [
  {
    id: 'classicRaid',
    section: 'playtest',
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
    title: 'Records Vault, night raid',
    objective: 'Work through the dark vault by flashlight, past the guard torches, and break the 3 cabinets.',
    launches: 'The complete Records Vault night raid (flashlight, guard beams, light-based detection).',
    levels: true,
    launch: { kind: 'raid', raidId: 'recordsVault' },
  },
  {
    id: 'classicBlast',
    section: 'playtest',
    title: 'Classic Blast',
    objective: 'Win a standard 4-player Classic Blast match against 3 bots.',
    launches:
      'A real Classic Blast match (Danfo Bus Park, one human and 3 bots, the normal rules and Wahala Crush).',
    levels: true,
    launch: { kind: 'classic', arenaId: 'danfoBusPark' },
  },
  {
    id: 'cityRumble',
    section: 'playtest',
    title: 'City Rumble',
    objective: 'Score eliminations in a 16-fighter Free-for-All and earn your streak rewards.',
    launches:
      'A real City Rumble match (Free-for-All on the Oshodi Transport Metropolis stage, 16 fighters).',
    levels: true,
    launch: { kind: 'rumble', arenaId: 'rumbleOshodi', mode: 'deathmatch', competitors: 16 },
  },
  {
    id: 'fieldMission',
    section: 'playtest',
    title: 'Campaign field mission',
    objective: 'Walk the 3 checkpoints, raid the depot door and walk back out.',
    launches:
      'Terminal Approach (oshodi.approach) through the real campaign controller: its enemies, objectives and the depot door raid.',
    levels: true,
    launch: { kind: 'field', missionId: 'oshodi.approach' },
  },
  {
    id: 'boss',
    section: 'playtest',
    title: 'Boss encounter',
    objective: 'Defeat the Oshodi boss and check his model, attacks and the crew around him.',
    launches: 'The Oshodi boss mission through the real campaign controller (unlocked here, nothing saved).',
    levels: true,
    launch: { kind: 'boss', districtId: 'oshodi' },
  },
  {
    id: 'roster',
    section: 'playtest',
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
    title: 'Rear approach',
    objective: 'Walk up behind the patrolling guard, unseen, and lay a generator.',
    launches: 'Depot, one guard on its patrol; you start behind it, outside its view cone.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'rearApproach' },
  },
  {
    id: 'patrolAmbush',
    section: 'scenario',
    title: 'Patrol-route ambush',
    objective: 'Stay hidden by a corner of the guard’s loop and catch it as it comes round.',
    launches: 'Depot, one guard on its clockwork loop; you start hidden near a corner of it.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'patrolAmbush' },
  },
  {
    id: 'oneHit',
    section: 'scenario',
    title: 'One-hit lethality',
    objective: 'Lay a generator whose blast reaches the whole row of enemies.',
    launches: 'Depot, an agbero, a guard and a thrower in a row on a lane; you stand at its end.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'oneHit' },
  },
  {
    id: 'punchDodge',
    section: 'scenario',
    title: 'Punch warning and dodge',
    objective: 'Read the guard’s wind-up and step out of the punch.',
    launches: 'Depot, one guard waking right beside you, with free tiles to step to.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'punchDodge' },
  },
  {
    id: 'pursuit',
    section: 'scenario',
    title: 'Pursuit and disengaging',
    objective: 'Get chased by five enemies, then break line of sight and lose them.',
    launches: 'Depot, three guards and two throwers; you start in the open east lane.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'pursuit' },
  },
  {
    id: 'flashlight',
    section: 'scenario',
    title: 'Flashlight and detection',
    objective: 'Watch how your flashlight and the guard’s torch decide who is seen.',
    launches: 'Records Vault at night, one torch guard on its route; you start in the dark nearby.',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'flashlight' },
  },
  {
    id: 'identifyPlayer',
    section: 'scenario',
    title: 'Who am I? Surrounded',
    objective: 'Find yourself among 5 enemies, and compare the three marker styles.',
    launches:
      'Depot, five enemies waking close around you; a live marker switch (Original / Indicator / Indicator + Ground).',
    levels: true,
    launch: { kind: 'scenario', scenarioId: 'identifyPlayer' },
  },
];

export function entryById(id: string): LabEntry | undefined {
  return LAB_ENTRIES.find((e) => e.id === id);
}

export const entriesIn = (section: EntrySection): readonly LabEntry[] =>
  LAB_ENTRIES.filter((e) => e.section === section);
