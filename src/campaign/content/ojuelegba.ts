import type { DistrictContent } from '../types';

/** Ojuelegba: the hub and prologue. No boss; it is "cleared" from the start and always replayable as a stage. */
export const OJUELEGBA: DistrictContent = {
  id: 'ojuelegba',
  name: 'Ojuelegba',
  tagline: 'Where the Ring was first noticed',
  mapPos: { x: 34, y: 52 },
  arenaId: 'rumbleOjuelegba',
  briefing: {
    title: 'The Underbridge',
    location: 'Ojuelegba, Surulere: the overpass, Stadium Road and the danfo stop',
    summary:
      'Home turf. Mama Put points you at the first thread of the Ring: a radio net at Oshodi that decides who moves and who waits. Nothing to defeat here; learn the board, pick a fighter, then go.',
    objectives: [
      'Pick your fighter and bot level',
      'Learn the two buttons: A drops generators, B uses the context special',
    ],
    intel: [
      'The Ring is not one gang: it is a chain of keepers, each controlling one verb (dispatch, supply, passage, timetable, records, power).',
      'Every district asks a different thing of you. Never the same fight twice.',
    ],
    warnings: ['Ojuelegba stays a free-play stage after the prologue: nothing here is lost or locked.'],
    brokerMessage: {
      speaker: 'UNKNOWN NUMBER',
      text: 'Go home, small one. The lights will be on soon enough.',
      fromBroker: true,
    },
  },
  landmarks: [
    {
      id: 'overpassMural',
      name: 'Ojuelegba Overpass and Mural',
      note: 'The concrete overpass with an afrobeat-shrine-inspired mural: raised fists, saxophones, a sun. No portrait of any real person; the mural is symbols only.',
    },
    {
      id: 'stadiumRoadJunction',
      name: 'Stadium Road Junction',
      note: 'A busy signal-less crossing under the bridge shadow: painted crossing, bus bay, handwritten route boards. Fictional street names only.',
    },
    {
      id: 'danfoStop',
      name: 'Danfo Stop',
      note: 'A yellow-and-black danfo queue with conductors calling stops, a mama put stall and plastic stools.',
    },
  ],
  boss: null,
  requires: [],
  factionIds: ['streetWatch', 'mamaPutMutual'],
};
