import type { DistrictContent, LocalFigureDef, StoryLine } from '../types';

const baba = (text: string): StoryLine => ({ speaker: 'BABA JUNCTION', text });

/**
 * Ojuelegba's local figure: the stop master of the underbridge danfo stop. A hub character, not a boss (Ojuelegba stays
 * a free-play stage with no fight). Inspired by the culture of the junction: conductors calling stops, the chalked route
 * board, the whistle and the ticket for the stop, and the way everyone passing greets the person who runs it. Fiction only.
 */
export const OJUELEGBA_FIGURE: LocalFigureDef = {
  id: 'babaJunction',
  name: 'Oga Adekola',
  nickname: 'Baba Junction',
  title: 'Stop Master of the Underbridge',
  culturalInspiration:
    'The Ojuelegba junction under the bridge: danfo conductors calling Yaba, Obalende and Oshodi in one breath, chalked route boards, a whistle for every bus, music from kiosk speakers, and the stop master whom every conductor greets first. Inspired by the junction and its stop leadership in general, never by any real person, name or biography.',
  look: {
    characterId: 'campusQueen',
    description:
      'Round-shouldered and cheerful: oversized tinted glasses, a bright print shirt under a sleeveless vest, a flat cap tipped back, a whistle on a cord and a chalk stub behind one ear. A route board of fictional stops hangs from one arm.',
    palette: { primary: 0xe0a21b, accent: 0x7a2fa8 },
  },
  entourage:
    'Two young conductors who shout the stops for him, a hawker with a tray of cold water and a boy who erases and rewrites the chalk board every few minutes.',
  entrance:
    'A long whistle under the bridge; the conductors fall silent for a breath, then every one of them shouts his name.',
  personality:
    'Easy and teasing: jokes first, favours second, and never says what side he is on. Speaks in stops and routes ("na Yaba side or Obalende side?"), mixes Pidgin and Yoruba greetings, and is never in a hurry because the buses wait for him.',
  introduction: [
    baba('Eh! Fresh face under my bridge. Which stop you dey go, my person?'),
    {
      speaker: 'MAMA PUT',
      text: 'Na Baba Junction. Every conductor for Ojuelegba greet am first. Watch your mouth.',
    },
    baba('Ha, Mama Put, you dey tell her my business? Small one, the bridge sees all. The stop sees more.'),
    baba('I no take sides. I only know who is late, who is early and who owes the board.'),
    {
      speaker: 'NARRATOR',
      text: 'He blows the whistle once. Somewhere behind you, a whole row of danfo lets you pass.',
    },
    baba('Go well. If you need a stop, ask. If you need a favour... that one na another ticket.'),
  ],
};

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
  figure: OJUELEGBA_FIGURE,
  requires: [],
  factionIds: ['streetWatch', 'mamaPutMutual'],
};
