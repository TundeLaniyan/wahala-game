/**
 * The sections of every district (docs/CAMPAIGN_SECTIONS.md). Each district is divided into three sections that the
 * player reclaims in order: (1) the approach, a field mission with a door to a raid; (2) the middle, a second field
 * mission or a standalone raid; (3) the boss section, the district's existing boss mission, unchanged.
 *
 * Oshodi is the fully written vertical slice (intro and outro scenes, "Read more"); the other districts carry short
 * real text with real objectives. All names are fictional (docs/CAMPAIGN_STORY.md, ethics checklist).
 */
import type { MissionId } from '../../sim';
import { MISSION_IDS } from '../../sim';
import type { DistrictContent, RewardDef, SectionDef, SectionMissionDef, StoryLine } from '../types';
import { EBUTE_METTA } from './ebuteMetta';
import { FADEYI_SOMOLU } from './fadeyiSomolu';
import { LAGOS_ISLAND } from './lagosIsland';
import { LEKKI } from './lekki';
import { MUSHIN } from './mushin';
import { OSHODI } from './oshodi';

const title = (id: string, name: string, description: string): RewardDef => ({
  id: `reward.section.${id}`,
  kind: 'title',
  name,
  description,
});

const say = (speaker: string, text: string): StoryLine => ({ speaker, text });

const BOSS_OF: Record<MissionId, DistrictContent> = {
  oshodi: OSHODI,
  mushin: MUSHIN,
  fadeyiSomolu: FADEYI_SOMOLU,
  ebuteMetta: EBUTE_METTA,
  lagosIsland: LAGOS_ISLAND,
  lekki: LEKKI,
};

/**
 * The boss section of a district: the existing boss mission, its reward and unlocks untouched. `ringWeakened` is the
 * one short line the result screen shows for it (what the Ring lost; decision PR14).
 */
function bossSection(
  district: MissionId,
  name: string,
  summary: string,
  card: string,
  ringWeakened: string,
): SectionDef {
  const boss = BOSS_OF[district].boss!;
  const mission: SectionMissionDef = {
    id: `${district}.boss`,
    format: 'boss',
    name: boss.name,
    objectiveCard: card,
    summary: `${boss.name}, ${boss.title}. ${boss.exposeObjective.split(';')[0]}.`,
    missionRef: district,
    reward: boss.reward,
    unlocks: boss.reward.unlocks ?? [],
    ringWeakened,
  };
  return {
    id: `${district}.s3`,
    districtId: district,
    order: 3,
    name,
    summary,
    requires: [`${district}.s2`],
    missions: [mission],
  };
}

// ---------------------------------------------------------------- Oshodi: the vertical slice

const OSHODI_SECTIONS: SectionDef[] = [
  {
    id: 'oshodi.s1',
    districtId: 'oshodi',
    order: 1,
    name: 'Terminal Approach',
    summary:
      'The south-west streets feed the bus terminal through Orita gate. Walk through the checkpoints and break into the dispatch depot behind them.',
    requires: [],
    missions: [
      {
        id: 'oshodi.approach',
        format: 'field',
        name: 'Terminal Approach',
        objectiveCard: 'Walk through 3 checkpoints, stand 1 s on the depot door, return.',
        summary:
          'Three checkpoints lead from the gate to the depot yard: walk straight through them, no waiting (fighting the park wardens is optional). Stand on the depot door for a second to raid the warehouse, then walk back out.',
        missionRef: 'oshodi.approach',
        doors: [{ doorId: 'depot', raidId: 'warehouseDispatchDepot' }],
        reward: title(
          'oshodi.approach',
          'Terminal Regular',
          'Known at the gate: the wardens stop asking for your chit.',
        ),
        unlocks: ['section.oshodi.s2'],
        ringWeakened: 'The depot’s dispatch cargo is broken: the convoys lose their schedule.',
        readMore:
          'Three checkpoints (A, B and C) mark the way. Two park wardens walk set rounds, one round the ticket kiosk and one down the stall lane: watch where they turn and pass behind them, or lay a generator where they will walk. A tout throws from the forecourt by C, and a heavy walks the depot lane: only a blast finishes him. The Dispatch Depot door opens the warehouse raid: marked cargo, a wave of wardens and a lane of thrown bottles. Win it, or leave and try again: the door stays open. When the depot is done, walk back to the Orita gate to finish.',
        intro: [
          say('MAMA PUT', 'Wardens hold the gate and the depot. Go quiet: checkpoint by checkpoint.'),
          say(
            'RADIO',
            'Dispatch cargo sits behind the yard wall. Break the crates and the convoys lose their schedule.',
          ),
        ],
        outro: [
          say('MAMA PUT', 'You take the depot and the gate learns your face. Next is the rail edge.'),
          say('RADIO', 'The terminal approach is open. The rail edge section is next.'),
        ],
      },
    ],
  },
  {
    id: 'oshodi.s2',
    districtId: 'oshodi',
    order: 2,
    name: 'Rail Edge',
    summary:
      'The market lane runs beside the rail line, and the trailer crews guard it. Put down the hawkers, break the relay boxes, keep the rail plaza, then outrun the trailer hand to the footbridge.',
    requires: ['oshodi.s1'],
    missions: [
      {
        id: 'oshodi.railEdge',
        format: 'field',
        name: 'Rail Edge',
        objectiveCard: 'Clear hawkers, wreck 3 relay boxes, keep the plaza, reach the footbridge.',
        summary:
          'Two hawkers hold the market lane, and the relay boxes by the rail plaza feed the dispatch net: only your blasts break them, three each. Keep the plaza clear while the trailer crew comes for it, then reach the footbridge before the trailer hand.',
        missionRef: 'oshodi.railEdge',
        reward: title(
          'oshodi.railEdge',
          'Footbridge Regular',
          'The hawkers wave you across the rail line now.',
        ),
        unlocks: ['section.oshodi.s3'],
        ringWeakened:
          'The trailer crews lose the rail-edge lane and its relay boxes: the controller has nowhere left to hide.',
        readMore:
          'Clear the two lane hawkers. Three relay boxes stand by the rail plaza: each takes three separate blasts, a heavy minds the nearest one and a warden walks round the mast block. Then keep the rail plaza clear for 25 seconds while the trailer crew comes to take it back. Last, the trailer hand hunts you: stay ahead of him and reach the footbridge. If he stays next to you for a moment he catches you and you lose a life. Walk to the Park gate to finish.',
        intro: [
          say('MAMA PUT', 'The market lane is the last road before the terminal. The trailer crews run it.'),
          say('RADIO', 'Relay boxes by the plaza feed the dispatch net. Na blast go break am, not hand.'),
        ],
        outro: [say('RADIO', 'The rail edge is clear. The controller has nowhere left to hide.')],
      },
    ],
  },
  bossSection(
    'oshodi',
    'The Controller',
    'The terminal canopies and the dispatch radio, with Oga Sunmola behind them. Jam the relays and take him off his own stage.',
    'Jam the relay masts, then finish Oga Sunmola.',
    'The relay masts are jammed and the dispatch radio goes quiet: buses leave on honest timetables.',
  ),
];

// ---------------------------------------------------------------- the other districts: real objectives, short text

const MUSHIN_SECTIONS: SectionDef[] = [
  {
    id: 'mushin.s1',
    districtId: 'mushin',
    order: 1,
    name: 'Spare-Parts Row',
    summary:
      'The stall row runs toward the storeroom lane. Walk it, break the parts cages in the loading bay and raid the parts storeroom.',
    requires: [],
    missions: [
      {
        id: 'mushin.approach',
        format: 'field',
        name: 'Spare-Parts Row',
        objectiveCard: 'Walk the stall row, wreck 3 parts cages, raid the storeroom, return.',
        summary:
          'Hawkers walk the aisles, and the Ring locks hoarded parts in cages in the loading bay: blast each one three times while a heavy minds them. Then stand on the storeroom door to raid it.',
        missionRef: 'mushin.approach',
        doors: [{ doorId: 'storeroom', raidId: 'partsStoreroom' }],
        reward: title('mushin.approach', 'Row Regular', 'The stall owners nod when you pass.'),
        unlocks: ['section.mushin.s2'],
        ringWeakened:
          'The parts cages are blown open and the storeroom shelves emptied back onto the row: the Ring’s rental stock has a hole in it.',
      },
    ],
  },
  {
    id: 'mushin.s2',
    districtId: 'mushin',
    order: 2,
    name: 'Aisle Sweep',
    summary:
      'The north aisles are worked by market runners, and a lorry waits on the top street to restock the hoard. Clear the runners, then keep the lorry bay clear.',
    requires: ['mushin.s1'],
    missions: [
      {
        id: 'mushin.market',
        format: 'field',
        name: 'Aisle Sweep',
        objectiveCard: 'Clear runners, walk the top street, keep the lorry bay 40 s.',
        summary:
          'Three runners work the aisles; after them, walk the top street and keep the lorry bay clear for 40 seconds while the loaders come for it: no lorry, no restock. A back stall offers a bonus raid.',
        missionRef: 'mushin.market',
        doors: [{ doorId: 'backStall', raidId: 'partsStoreroom' }],
        reward: title('mushin.market', 'Aisle Regular', 'Runners step aside for you in the north aisles.'),
        unlocks: ['section.mushin.s3'],
        ringWeakened:
          'The runners lose the north aisles and the lorry leaves empty: the broker has nothing left to restock her stacks.',
      },
    ],
  },
  bossSection(
    'mushin',
    'The Parts Broker',
    'Madam Ronke keeps the hoard behind her stacks. Blast the stacks while her runners restock them.',
    'Destroy the parts stacks, then finish Madam Ronke.',
    'The hoarded stacks are blasted open: mechanics take the parts the Ring was renting back.',
  ),
];

const FADEYI_SECTIONS: SectionDef[] = [
  {
    id: 'fadeyiSomolu.s1',
    districtId: 'fadeyiSomolu',
    order: 1,
    name: 'Toll Approach',
    summary:
      'Marshals hold the approach road to the tool shed. Move them, walk the toll posts and raid the shed.',
    requires: [],
    missions: [
      {
        id: 'fadeyiSomolu.approach',
        format: 'field',
        name: 'Toll Approach',
        objectiveCard: 'Clear the marshals, walk two toll posts, raid the shed.',
        summary:
          'Two marshals block the road. Pass the toll posts, hold the tool-shed door, then go back to the toll gate.',
        missionRef: 'fadeyiSomolu.approach',
        doors: [{ doorId: 'shed', raidId: 'junctionToolShed' }],
        reward: title(
          'fadeyiSomolu.approach',
          'Toll Regular',
          'The approach road lets you through without a chit.',
        ),
        unlocks: ['section.fadeyiSomolu.s2'],
        ringWeakened:
          'The tool shed’s chains and padlocks are broken: the toll approach cannot be shut again.',
      },
    ],
  },
  {
    id: 'fadeyiSomolu.s2',
    districtId: 'fadeyiSomolu',
    order: 2,
    name: 'Junction Run',
    summary: 'Three junction posts sit along the north road. Walk them while a marshal hunts you.',
    requires: ['fadeyiSomolu.s1'],
    missions: [
      {
        id: 'fadeyiSomolu.junctions',
        format: 'field',
        name: 'Junction Run',
        objectiveCard: 'Walk three junction posts, escape the marshal, return.',
        summary:
          'Visit the junctions in order. At the last one the marshal sets off after you: reach the slip road first.',
        missionRef: 'fadeyiSomolu.junctions',
        reward: title(
          'fadeyiSomolu.junctions',
          'Junction Regular',
          'Marshals know better than to stop you now.',
        ),
        unlocks: ['section.fadeyiSomolu.s3'],
        ringWeakened:
          'The junction posts are knocked flat: the marshals lose their count of who crossed and who paid.',
      },
    ],
  },
  bossSection(
    'fadeyiSomolu',
    'The Garage Master',
    'Marshal Kobo controls every crossing. Hold the junctions against his marshals until they open.',
    'Hold the junction zones, then finish Marshal Kobo.',
    'The toll bars at every junction come down: commuters cross without paying by the hour.',
  ),
];

const EBUTE_SECTIONS: SectionDef[] = [
  {
    id: 'ebuteMetta.s1',
    districtId: 'ebuteMetta',
    order: 1,
    name: 'Yard Approach',
    summary: 'The yard fence leads to the signal box. Follow it and raid the signal shed.',
    requires: [],
    missions: [
      {
        id: 'ebuteMetta.approach',
        format: 'field',
        name: 'Yard Approach',
        objectiveCard: 'Follow the yard fence, raid the signal shed, return.',
        summary: 'Switchmen walk the fence line. Reach the signal box, hold the shed door and raid it.',
        missionRef: 'ebuteMetta.approach',
        doors: [{ doorId: 'shed', raidId: 'junctionToolShed' }],
        reward: title('ebuteMetta.approach', 'Fence Regular', 'The switchmen leave you the gate open.'),
        unlocks: ['section.ebuteMetta.s2'],
        ringWeakened:
          'The signal shed is wrecked: the yard can no longer clear the lines for its night trains.',
      },
    ],
  },
  {
    id: 'ebuteMetta.s2',
    districtId: 'ebuteMetta',
    order: 2,
    name: 'Goods Yard',
    summary: 'A standalone raid on the goods yard, where the freight that keeps the timetable waits.',
    requires: ['ebuteMetta.s1'],
    missions: [
      {
        id: 'ebuteMetta.railYard',
        format: 'raid',
        name: 'Rail Yard Goods',
        objectiveCard: 'Destroy the marked freight, then extract.',
        summary:
          'A compact classic raid: break the marked crates and barrels, survive the wave, reach the exit.',
        missionRef: 'railYardGoods',
        reward: title(
          'ebuteMetta.railYard',
          'Yard Regular',
          'The freight handlers keep your name off the manifest.',
        ),
        unlocks: ['section.ebuteMetta.s3'],
        ringWeakened:
          'The marked freight is broken open where it stands: the night cargo never leaves the yard.',
      },
    ],
  },
  bossSection(
    'ebuteMetta',
    'The Timetable',
    'Ikenna Wayside writes the yard clock. Hit the dispatch switches only when the rail windows are open.',
    'Hit the switches inside the rail windows, then finish Wayside.',
    'The dispatch switches are dead and the yard bells stop: no more Ring freight by night.',
  ),
];

const LAGOS_SECTIONS: SectionDef[] = [
  {
    id: 'lagosIsland.s1',
    districtId: 'lagosIsland',
    order: 1,
    name: 'Ledger Row',
    summary: 'Auditors work the west row. Clear them, visit the ledger counters and raid the records annexe.',
    requires: [],
    missions: [
      {
        id: 'lagosIsland.approach',
        format: 'field',
        name: 'Ledger Row',
        objectiveCard: 'Clear the auditors, walk two counters, raid the annexe.',
        summary:
          'Two auditors hold the row. Reach both counters, hold the annexe door, then return to the row gate.',
        missionRef: 'lagosIsland.approach',
        doors: [{ doorId: 'annexe', raidId: 'recordsVault' }],
        reward: title('lagosIsland.approach', 'Row Regular', 'Clerks stop asking for your receipt.'),
        unlocks: ['section.lagosIsland.s2'],
        ringWeakened: 'The records annexe is cracked open: the forged ledgers are out of the vault.',
      },
    ],
  },
  {
    id: 'lagosIsland.s2',
    districtId: 'lagosIsland',
    order: 2,
    name: 'Press Run',
    summary: 'Audit slips lie on two desks. Collect them and outrun the bureau to the press lane.',
    requires: ['lagosIsland.s1'],
    missions: [
      {
        id: 'lagosIsland.press',
        format: 'field',
        name: 'Press Run',
        objectiveCard: 'Collect both desk slips, outrun the auditors, walk out.',
        summary:
          'Visit the two desks. When the second slip is yours, an auditor sets off after you: reach the press lane.',
        missionRef: 'lagosIsland.press',
        reward: title('lagosIsland.press', 'Press Regular', 'The press room leaves a stool for you.'),
        unlocks: ['section.lagosIsland.s3'],
        ringWeakened: 'The audit slips reach the press lane: the bureau can no longer bury its paper trail.',
      },
    ],
  },
  bossSection(
    'lagosIsland',
    'The Registrar',
    'Barrister Quill guards the receipts. Collect the ledgers and deliver them to the press while the auditors chase.',
    'Deliver the ledgers to the press, then finish Quill.',
    'The forged ledgers are on the press: the bureau can no longer decide who exists on paper.',
  ),
];

const LEKKI_SECTIONS: SectionDef[] = [
  {
    id: 'lekki.s1',
    districtId: 'lekki',
    order: 1,
    name: 'Gate Approach',
    summary:
      'The side gate leads along the garden wall to the standby plant. Slip past the gatehouse guards and raid the plant.',
    requires: [],
    missions: [
      {
        id: 'lekki.approach',
        format: 'field',
        name: 'Gate Approach',
        objectiveCard: 'Walk the garden wall, raid the standby plant, return.',
        summary: 'Guards watch the wall. Reach the pool edge, hold the plant door and raid it.',
        missionRef: 'lekki.approach',
        doors: [{ doorId: 'plant', raidId: 'standbyPlant' }],
        reward: title('lekki.approach', 'Gate Regular', 'The side gate opens a little faster for you.'),
        unlocks: ['section.lekki.s2'],
        ringWeakened:
          'The standby plant’s switchgear is blasted: the estates’ private feed starts to flicker.',
      },
    ],
  },
  {
    id: 'lekki.s2',
    districtId: 'lekki',
    order: 2,
    name: 'Estate Sweep',
    summary:
      'The estate drive is patrolled. Clear the patrol, check two posts on the lawn and outrun the hounds to the service road.',
    requires: ['lekki.s1'],
    missions: [
      {
        id: 'lekki.estate',
        format: 'field',
        name: 'Estate Sweep',
        objectiveCard: 'Clear the patrol, check two posts, outrun the hounds.',
        summary:
          'Two guards hold the north drive. After the lawn posts the hounds are loosed: reach the service road.',
        missionRef: 'lekki.estate',
        reward: title('lekki.estate', 'Estate Regular', 'The hounds lose interest in your scent.'),
        unlocks: ['section.lekki.s3'],
        ringWeakened: 'The estate patrol is broken up: the grid’s control house stands unguarded.',
      },
    ],
  },
  bossSection(
    'lekki',
    'The Steward',
    'Bamidele Halcyon runs the standby grid. Switch the systems off in the signalled order.',
    'Switch the systems off in order, then finish Halcyon.',
    'The standby grid goes dark: the estates lose the power they bought with the mainland’s blackouts.',
  ),
];

export const SECTIONS: Record<MissionId, SectionDef[]> = {
  oshodi: OSHODI_SECTIONS,
  mushin: MUSHIN_SECTIONS,
  fadeyiSomolu: FADEYI_SECTIONS,
  ebuteMetta: EBUTE_SECTIONS,
  lagosIsland: LAGOS_SECTIONS,
  lekki: LEKKI_SECTIONS,
};

/** Every section in campaign order. */
export function allSections(): SectionDef[] {
  return MISSION_IDS.flatMap((d) => SECTIONS[d]);
}

/** Every mission of every section in campaign order. */
export function allSectionMissions(): SectionMissionDef[] {
  return allSections().flatMap((s) => s.missions);
}
