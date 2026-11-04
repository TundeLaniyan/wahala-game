import type { BossDef, DistrictContent, StoryLine } from '../types';

const keeper = (text: string): StoryLine => ({ speaker: 'IKENNA WAYSIDE', text });
const chairman = (text: string): StoryLine => ({ speaker: 'THE CHAIRMAN', text, fromBroker: true });

/** BOSS 4. Mechanic: dispatchWindows (hit dispatch switches only inside timed rail windows). */
export const EBUTE_METTA_BOSS: BossDef = {
  id: 'ikennaWayside',
  districtId: 'ebuteMetta',
  name: 'Ikenna Wayside',
  nickname: 'The Timekeeper',
  title: 'Keeper of the Timetable',
  culturalInspiration:
    'The old railway yard and its heritage station, signal gantries, level crossings and the freight terminal on the waterfront: a place defined by timetables, bells, signals and the people who quietly keep wagons moving on time.',
  areaConnection:
    'Ebute-Metta is where the mainland meets the lagoon: every container, every ledger and every night-time delivery to the island passes through the yard. Whoever controls the timetable controls what crosses to the water.',
  visualDirection: {
    characterId: 'streetBaller',
    description:
      'Slim, pale-suited, a pocket-watch chain, a rail-grey waistcoat and a signalman’s lamp. He wears his sleeves pressed and speaks in a whisper. His shadow is longer than he is.',
    palette: { primary: 0x6b4f2a, accent: 0xe74c3c },
    artNeeds:
      'Boss costume variant of the street rig; pocket-watch + signal-lamp props; idle: checks the watch and sighs; rail-window FX (green open bar, red closed bar, countdown ring); switch props; defeat: every clock stops at the same minute.',
  },
  personality:
    'Courteous, exact, a little sad. Never raises his voice and never wastes a second. Treats lateness as a moral failing. His threats come with the time they will be carried out.',
  protectionCrew: {
    factionId: 'ironLaneSwitchmen',
    roles: [
      { role: 'blocker', count: 2 },
      { role: 'objectiveDefender', count: 2 },
      { role: 'rangedAttacker', count: 1 },
    ],
  },
  systemControlled: 'The yard’s dispatch switches and timetable: when each wagon is allowed to leave',
  exposeObjective:
    'Hit the dispatch switches only inside the timed rail windows (a switch hit outside its window does nothing); when every switch has fallen, the Timekeeper is exposed in his signal cabin.',
  objectiveKind: 'dispatchWindows',
  signatureAbility: {
    name: 'On the Minute',
    description:
      'Rail windows open and close on his clock: a switch is only vulnerable while its window is open, and railcars sweep the track lanes on his schedule.',
  },
  counterplay:
    'Watch the countdown ring on each switch and be in place before the window opens. The track lanes are always warned: step off the rails before the wagon rolls. Blockers and defenders cannot cover every switch at once.',
  phases: [
    {
      title: 'First Departure',
      objective: 'Hit the first dispatch switch inside its open window.',
      bossBehaviour: 'Checks his watch and reads out the minute: windows are short and far apart.',
      pressure: 'One switch at a time; railcars sweep a warned track lane.',
      callout: 'Wait for the green bar. Hit the switch inside the window.',
    },
    {
      title: 'Peak Timetable',
      objective: 'Hit two switches whose windows overlap and alternate.',
      bossBehaviour: 'Tightens the timetable: windows overlap and blockers stand on the switches.',
      pressure: 'Two track lanes live; defenders contest the switches.',
      callout: 'Two windows, one pair of hands. Pick the one that closes first.',
    },
    {
      title: 'The Last Train',
      objective: 'Hit the final switches in the shortest windows, then finish the exposed Keeper.',
      bossBehaviour: 'Throws the master lever: every wagon rolls and the windows are at their shortest.',
      pressure: 'Short windows, several lanes live at once, the full crew in the yard.',
      callout: 'Last train. Hit the master switch in its window, then take the Timekeeper.',
    },
  ],
  introduction: [
    {
      speaker: 'MAMA PUT',
      text: 'Ebute-Metta yard, my dear. Old station, new masters. Ikenna Wayside keeps the timetable: you do not move unless he allows.',
    },
    keeper('You are four minutes early, miss. I do not receive early guests.'),
    {
      speaker: 'RADIO',
      text: 'Dispatch switches are live only inside timed windows. Outside the window, a hit does nothing.',
    },
    keeper(
      'A train that leaves late costs the Chairman money. A train that leaves early costs me my position.',
    ),
    keeper('So I will tell you how this ends, and the minute it ends. You will not like the minute.'),
    chairman('Ikenna, be gentle. She has come a long way on foot.'),
    keeper('Of course, Chairman. All stations: the next departure is in thirty seconds.'),
  ],
  defeatSequence: [
    keeper('Eleven forty-one. The last switch fell at eleven forty-one. I will remember the minute.'),
    {
      speaker: 'RADIO',
      text: 'Yard bells silent. Every wagon is standing. Station staff are taking back their own lamps.',
    },
    keeper('A timetable is a promise. You have made everyone late.'),
    { speaker: 'MAMA PUT', text: 'Late? Na so we have been, waiting for you to let us pass.' },
    keeper('Hm. Then perhaps lateness is simply what freedom looks like on paper.'),
    { speaker: 'NARRATOR', text: 'Far down the line a single bell rings, out of time, and nobody stops it.' },
  ],
  defeatSequenceOusted: [
    keeper('I will see myself out. Do not worry: I know exactly when the next train leaves.'),
    {
      speaker: 'RADIO',
      text: 'The signal cabin is empty. The yard is running on the drivers’ own timetable.',
    },
    chairman('Time is the only thing a man cannot buy twice, Ikenna. You spent yours well.'),
  ],
  reward: {
    id: 'reward.ebuteMetta.signalLamp',
    kind: 'cosmetic',
    name: 'Signalman’s Lamp',
    description: 'A railway-grey costume with a signal-lamp prop for the Campus Queen.',
    unlocks: ['costume.campusQueen.signalLamp', 'modifier.expressTimetable', 'district.lagosIsland'],
  },
  consequence:
    'The yard bells stop, the wagons stand, and the freight crossing to the waterfront is no longer the Chairman’s private route. The Chairman loses his night deliveries and turns to his records on Lagos Island. The next district opens.',
  consequenceFlags: ['ebuteMetta.timetableBroken'],
  replayModifier: {
    id: 'expressTimetable',
    name: 'Express Timetable',
    description: 'Rail windows are shorter: be faster on every switch.',
    bonus: 'Earns the "Express Timetable" badge for this district',
  },
};

export const EBUTE_METTA: DistrictContent = {
  id: 'ebuteMetta',
  name: 'Ebute-Metta',
  tagline: 'The yard that keeps the clock',
  mapPos: { x: 52, y: 60 },
  arenaId: 'rumbleEbuteMetta',
  briefing: {
    title: 'The Last Train',
    location: 'Ebute-Metta: the railway station, the rail yard and signal gantry, the Iddo-style terminal',
    summary:
      'The old railway yard runs on a timetable the Chairman wrote. Ikenna Wayside opens and closes the windows. Hit the dispatch switches only when their window is open, and learn to be in the right place at exactly the right minute.',
    objectives: [
      'Hit dispatch switches only inside their open rail windows',
      'Avoid the wagons that roll through the track lanes',
      'Finish Ikenna Wayside when the last switch falls',
    ],
    intel: [
      'Each switch shows a countdown ring: green when its window is open.',
      'Track lanes are always warned: you will have one step to clear them.',
      'Station staff and the neighbourhood watch are bystanders: do not blast the platform.',
    ],
    warnings: [
      'A switch hit outside its window does nothing and wastes the generator.',
      'Wagons are heavy. Do not stand on a rail when the bell rings.',
    ],
    brokerMessage: {
      speaker: 'UNKNOWN NUMBER',
      text: 'Everything in Lagos eventually passes through a yard. Be careful who is holding the lamp.',
      fromBroker: true,
    },
  },
  landmarks: [
    {
      id: 'railwayStationSign',
      name: 'Railway Station Sign',
      note: 'A heritage station frontage with a large painted board reading "EBUTE-METTA", a wrought-iron canopy and an old clock; no operator logo.',
    },
    {
      id: 'railYardGantry',
      name: 'Rail Yard and Signal Gantry',
      note: 'A working rail yard of parallel tracks, wagons, point levers and a tall signal gantry with red and green lamps.',
    },
    {
      id: 'iddoTerminal',
      name: 'Iddo-Style Terminal',
      note: 'A waterfront bus and freight terminal with stacked containers, ticket kiosks and sodium lamps; fictional name boards only.',
    },
  ],
  boss: EBUTE_METTA_BOSS,
  requires: ['fadeyiSomolu'],
  factionIds: ['ironLaneSwitchmen', 'blueTrailer', 'mamaPutMutual'],
};
