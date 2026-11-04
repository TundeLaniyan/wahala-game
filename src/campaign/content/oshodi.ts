import type { BossDef, DistrictContent, StoryLine } from '../types';

const boss = (text: string): StoryLine => ({ speaker: 'OGA SUNMOLA', text });
const chairman = (text: string): StoryLine => ({ speaker: 'THE CHAIRMAN', text, fromBroker: true });

/** BOSS 1, the vertical slice: richest content. Mechanic: dispatchRelays (jam live relays; live relays call convoy strikes). */
export const OSHODI_BOSS: BossDef = {
  id: 'ogaSunmola',
  districtId: 'oshodi',
  name: 'Oga Sunmola',
  nickname: 'Oga Dispatch',
  title: 'Controller of the Interchange',
  culturalInspiration:
    'Motor-park culture and bus-terminal dispatch at a great interchange: the loudspeaker voice, the queue order, who loads next, the whistle, the radio net that makes thousands of trips look like one orchestra.',
  areaConnection:
    'Oshodi is the mainland gate: the flyover feeds the terminal, the terminal feeds the rail line and the market. Control the radio here and every connecting route in Lagos waits on your word.',
  visualDirection: {
    characterId: 'streetBaller',
    description:
      'Broad, calm, always smiling: a long yellow dispatch coat over a black polo, a lanyard of whistles, a headset with one ear free, a folded loading chart in the back pocket. Moves like a man who has never run for a bus.',
    palette: { primary: 0xd9a21b, accent: 0x1b1b1f },
    artNeeds:
      'Boss costume variant of the street fighter rig; headset + whistle-lanyard props; idle: raises a hand to conduct; call-out animation (hand to ear); relay-jam FX; convoy-warning lane decals; defeat: headset drops, speaker crackles to silence.',
  },
  personality:
    'Silky and amused. Talks like an announcer, laughs at his own punchlines, calls everyone "unit". Never shouts: when he is angry the volume drops. Believes disorder is only order that has not paid.',
  protectionCrew: {
    factionId: 'oritaWardens',
    roles: [
      { role: 'meleeGuard', count: 3 },
      { role: 'blocker', count: 2 },
      { role: 'runner', count: 1 },
    ],
  },
  systemControlled:
    'The interchange dispatch radio net: relay masts that sequence convoys, buses and market deliveries',
  exposeObjective:
    'Jam the relay masts (stand on a live relay until it goes dead) in three phases; when the last relay cluster falls silent, Oga Sunmola is exposed and can be eliminated.',
  objectiveKind: 'dispatchRelays',
  signatureAbility: {
    name: 'Open Lines',
    description:
      'Every live relay calls a telegraphed convoy strike: a lane across the board lights up and a convoy sweeps it. More live relays, more lanes.',
  },
  counterplay:
    'Convoy lanes are always warned for at least a few seconds and always have an escape step. Jamming a relay cancels the strike it was about to call. Bait blockers into lanes. Lure the convoy lane and jam the relay behind it.',
  phases: [
    {
      title: 'Tune the Net',
      objective: 'Jam two relays before the first convoy arrives.',
      bossBehaviour:
        'Stays behind the terminal canopy, shielded, calling the first strikes into the radio and chuckling at your route.',
      pressure: 'One convoy lane at a time; two guards and a runner patrol the relays.',
      callout: 'Stand on a relay to jam it. Keep out of the red lane.',
    },
    {
      title: 'Rush Hour',
      objective: 'Jam three relays while convoys cross on a faster beat.',
      bossBehaviour:
        'Reads out loading orders over the speakers; blockers close the lanes between relays and the escort follows you.',
      pressure: 'Two convoy lanes can be live together; blockers narrow your safe steps.',
      callout: 'Rush hour: break the blockers, then jam. Do not stand still in a lane.',
    },
    {
      title: 'Dead Air',
      objective: 'Jam the final relay cluster, then finish the exposed boss.',
      bossBehaviour:
        'Steps off the canopy to rebroadcast from the last mast himself: his own voice becomes the strike signal.',
      pressure: 'Convoys on a short beat; the crew regroups around the cluster.',
      callout: 'Last mast. Jam it, then he is exposed. Make him miss his own dispatch.',
    },
  ],
  introduction: [
    {
      speaker: 'MAMA PUT',
      text: 'That voice on the loudspeaker na Oga Sunmola. Every bus in Oshodi moves when he says "go".',
    },
    boss('Unit, you are not on my chart. Park the machine, park the attitude. Everybody loads in turn.'),
    {
      speaker: 'RADIO',
      text: 'Relay masts sit under the terminal canopies and along the rail edge. Each one is a leash on a convoy.',
    },
    boss(
      'You see this interchange? It is a song. The danfo are drums, the buses are the bass, the trailers are the chorus.',
    ),
    boss('And the song does not stop for a small one with a generator and a good heart.'),
    {
      speaker: 'UNKNOWN NUMBER',
      text: 'Sunmola, let the child dance. Then let the music finish.',
      fromBroker: true,
    },
    boss('Yes, Chairman. Convoys, you heard him.'),
    {
      speaker: 'NARRATOR',
      text: 'The speakers snap on. Somewhere under the flyover, a long line of headlights wakes up.',
    },
    boss('Welcome to Oshodi, unit. Please mind the closing doors.'),
  ],
  defeatSequence: [
    boss('Relay... relay four, come in. Relay five? Anyone?'),
    { speaker: 'RADIO', text: 'Dead air across the interchange. Every convoy is parked where it stood.' },
    boss('Eh, this is not funny. I have thousands of trips on my tongue and you took the tongue.'),
    {
      speaker: 'MAMA PUT',
      text: 'Na so. Now the buses go where the conductors say, not where the radio says.',
    },
    boss(
      'You think a radio is a leash? It is a heartbeat, small one. Switch one off and the others learn to sing alone.',
    ),
    chairman('Sunmola, you have made me proud and poor in one evening. Come to the car.'),
    {
      speaker: 'NARRATOR',
      text: 'The headset hits the concrete. For the first time in years, the interchange is quiet enough to hear the trains.',
    },
    {
      speaker: 'RADIO',
      text: 'Park wardens stand down. Dispatch is back in the hands of the drivers. Mushin supply lines are next.',
    },
    { speaker: 'MAMA PUT', text: 'See how the road breathe now. Go. Mushin is waiting.' },
  ],
  defeatSequenceOusted: [
    boss('Fine, fine, I am leaving. Let the conductors shout their own stops.'),
    { speaker: 'RADIO', text: 'Dispatch has gone dark at the interchange. The convoys are standing.' },
    chairman('Let him go. A radio is easy to buy. A voice is not.'),
  ],
  reward: {
    id: 'reward.oshodi.hiVis',
    kind: 'cosmetic',
    name: 'Interchange Hi-Vis',
    description:
      'A yellow dispatch-coat costume for the Street Baller, taken from the Controller’s own chair.',
    unlocks: ['costume.streetBaller.interchangeHiVis', 'modifier.rushHourDispatch', 'district.mushin'],
  },
  consequence:
    'The interchange radio net goes quiet and the park wardens lose their dispatch. Buses run on honest timetables again. The Chairman writes Oshodi off and turns his eye to the parts supply in Mushin. The Mushin district opens.',
  consequenceFlags: ['oshodi.dispatchBroken'],
  replayModifier: {
    id: 'rushHourDispatch',
    name: 'Rush Hour Dispatch',
    description: 'The relay pulses come faster: convoy strikes are called on a shorter beat.',
    bonus: 'Earns the extra "Rush Hour" star badge for this district',
  },
};

export const OSHODI: DistrictContent = {
  id: 'oshodi',
  name: 'Oshodi',
  tagline: 'The radio that moves the city',
  mapPos: { x: 20, y: 30 },
  arenaId: 'rumbleOshodi',
  briefing: {
    title: 'Dead Air at the Interchange',
    location:
      'Oshodi Transport Metropolis: the flyover, the bus terminal canopies, the rail line and the market',
    summary:
      'Every bus in Oshodi loads when the dispatch radio says so, and the radio answers to Oga Sunmola. Jam the relays under the canopies and on the rail edge, dodge the convoys he calls, then take the Controller off his own stage.',
    objectives: [
      'Jam relay masts by standing on them until they go dead',
      'Survive the telegraphed convoy strikes: read the red lanes',
      'Finish Oga Sunmola when the last relay cluster falls silent',
      'Earn up to three stars: clear it, lose at most one life, and beat the par time',
    ],
    intel: [
      'Live relays are what call convoy strikes: jam the relay and the strike is cancelled.',
      'Orita Park Wardens block lanes; blast the blocker or step around it.',
      'Ore Street Watch neighbours around the market are on your side: they are never your targets.',
      'The campaign\u2019s first fight: three phases, each asking for a few more relays than the last. Take the time to learn the lanes.',
      'Oga Sunmola stays shielded until the final relay cluster is dead: do not waste generators on him early.',
    ],
    warnings: [
      'Convoys have a warning lane but they hit hard: do not channel a relay inside a lit lane.',
      'You have a limited number of lives: a convoy hit costs one.',
      'The terminal is crowded: a generator dropped near a canopy column blocks your own escape.',
      'Convoys cross the rail line too: the level crossing is never a safe place to stand.',
    ],
    brokerMessage: {
      speaker: 'UNKNOWN NUMBER',
      text: 'The first lamp is the easiest to put out. It is also the one everybody sees. Choose carefully.',
      fromBroker: true,
    },
  },
  landmarks: [
    {
      id: 'interchangeFlyover',
      name: 'Interchange Flyover',
      note: 'A long concrete flyover curving over the main road, pier shadows and a rusted signal gantry. Signs read only "TO THE ISLAND" and "TO THE NORTH" (no brand).',
    },
    {
      id: 'terminalCanopies',
      name: 'Terminal Canopies',
      note: 'Wide steel-roofed bus bays, painted bay numbers, yellow-black kerbs, relay masts bolted to the canopy columns.',
    },
    {
      id: 'railMarketEdge',
      name: 'Rail Line and Oshodi Market Edge',
      note: 'A single rail line with a level crossing next to a dense market of cloth, plastic and cooked-food stalls under blue tarpaulins.',
    },
  ],
  boss: OSHODI_BOSS,
  requires: ['ojuelegba'],
  factionIds: ['oritaWardens', 'blueTrailer', 'streetWatch'],
};
