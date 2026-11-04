import type { BossDef, DistrictContent, StoryLine } from '../types';

const steward = (text: string): StoryLine => ({ speaker: 'STEWARD HALCYON', text });
const chairman = (text: string): StoryLine => ({ speaker: 'THE CHAIRMAN', text, fromBroker: true });

/** BOSS 6 (finale). Mechanic: contingencyGrid (switch private systems off in the signalled order; a wrong switch triggers a contingency strike). */
export const LEKKI_BOSS: BossDef = {
  id: 'stewardHalcyon',
  districtId: 'lekki',
  name: 'Bamidele Halcyon',
  nickname: 'The Steward',
  title: 'Steward of the Standby Grid',
  culturalInspiration:
    'Lekki’s gated estates, private standby generators and glowing plazas: a district where the lights rarely go out because somebody pays so they do not. Inspired by the idea of private infrastructure and the quiet staff who keep it humming, not by any real estate or operator.',
  areaConnection:
    'Lekki is where the island keeps its lights on. The Chairman’s last office is a standby plant behind a plaza: if it goes dark, the empire’s last luxury goes with it.',
  visualDirection: {
    characterId: 'lekkiBoy',
    description:
      'Soft, expensive and unhurried: a cream linen suit, a tablet clipped to a belt, a silver ring on every finger, a pocket of tiny remote switches. He glides rather than walks and always has a drink in his hand.',
    palette: { primary: 0x2b3a4a, accent: 0xc7d3df },
    artNeeds:
      'Boss costume variant of the lekki rig; tablet + glass props; idle: sips and checks the tablet; switch-panel props with lettered lamps; contingency-strike FX (lamp flash, floor ring); defeat: the plaza lights go out one ring at a time.',
  },
  personality:
    'Serene hospitality with a chill underneath. Treats the fight as a guest-service problem ("we regret the inconvenience"), promises comfort and delivers pressure. Never angry, only disappointed.',
  protectionCrew: {
    factionId: 'gatehouseGuard',
    roles: [
      { role: 'rangedAttacker', count: 2 },
      { role: 'meleeGuard', count: 2 },
      { role: 'bossAssistant', count: 1 },
    ],
  },
  systemControlled:
    'The estate standby grid: private generators, lighting rings, gates and cameras behind the plaza',
  exposeObjective:
    'Switch the private systems off in the order the grid signals, without a wrong switch; when the last system is off, the Steward is exposed in the dark.',
  objectiveKind: 'contingencyGrid',
  signatureAbility: {
    name: 'Contingency Plan',
    description:
      'A wrong switch triggers a contingency strike on the player: the plan has a backup for every mistake, and the backup is always on you.',
  },
  counterplay:
    'Read the signalled order, wait for the lamp and hit one switch at a time. A strike is always warned; step out of the ring. Guards cover the switches but cannot see the order: use them as bait.',
  phases: [
    {
      title: 'Soft Launch',
      objective: 'Switch off the first systems in the signalled order.',
      bossBehaviour: 'Hosts from the plaza, announcing "scheduled maintenance" to calm the guards.',
      pressure: 'A short sequence; a wrong switch triggers a warned strike.',
      callout: 'Follow the lamp order. A wrong switch calls a strike.',
    },
    {
      title: 'Peak Demand',
      objective: 'Switch off a longer sequence while guards defend the panels.',
      bossBehaviour: 'Adds a second panel and calls security to stand on the lit switches.',
      pressure: 'A longer sequence, ranged guards on the panels, strikes land on the board.',
      callout: 'Longer sequence. Clear the guards off the panel, then follow the order.',
    },
    {
      title: 'Power Cut',
      objective: 'Switch off the final systems in order, then finish the exposed Steward.',
      bossBehaviour: 'Cuts his own lights to hide, then sends his assistant to cover him.',
      pressure: 'The full crew and the longest sequence under strike warnings.',
      callout: 'The last switches. Lights out, then take the Steward.',
    },
  ],
  introduction: [
    {
      speaker: 'MAMA PUT',
      text: 'Lekki. The only place in Lagos where blackout is a rumour. You know who paid for that?',
    },
    steward(
      'Good evening. Welcome to Halcyon Court. May I offer you a drink before the inconvenience begins?',
    ),
    {
      speaker: 'RADIO',
      text: 'Private systems on the grid: gates, plaza lights, cameras, the standby plant. Switch them off in the signalled order. A wrong switch calls a strike.',
    },
    steward(
      'I do hope you will not take this personally. Comfort is a fragile thing, and people pay for my silence.',
    ),
    chairman('Bamidele. This is the last room. She has come this far. Let her feel it.'),
    steward('Of course, Chairman. We regret to inform you that tonight’s service has been cancelled.'),
    {
      speaker: 'NARRATOR',
      text: 'Across the lagoon, the Link Bridge glitters. Behind the plaza, a standby plant clears its throat.',
    },
  ],
  defeatSequence: [
    steward('I... seem to have lost the lights. How inconvenient.'),
    {
      speaker: 'RADIO',
      text: 'Estate grid dark. Gates unlocked. Cameras off. The plaza is as black as the lagoon.',
    },
    steward('Do you know how much a night without light is worth, my dear? Not only to him. To all of us.'),
    { speaker: 'MAMA PUT', text: 'Tonight? Priceless. Look up.' },
    steward('...The stars. I had forgotten the stars. How lovely. How terribly inexpensive.'),
    {
      speaker: 'NARRATOR',
      text: 'Down at the jetty, a pale boat starts its engine. Nobody is shouting, nobody is running. And in the dark, a single phone buzzes.',
    },
  ],
  defeatSequenceOusted: [
    steward('Do give my regards to the dark. I have a boat to catch.'),
    {
      speaker: 'RADIO',
      text: 'The Steward has left the plaza. The grid is off. Estate staff are walking out of the gates.',
    },
    chairman('Well done, Bamidele. You bought me nine minutes. That is all I needed.'),
  ],
  reward: {
    id: 'reward.lekki.ringBreaker',
    kind: 'unlock',
    name: 'Ring Breaker',
    description:
      'Opens the finale, the title "Ring Breaker" and the Standby Black costume for the Lekki Boy. Every replay modifier stays available.',
    unlocks: [
      'finale.unlocked',
      'title.ringBreaker',
      'costume.lekkiBoy.standbyBlack',
      'modifier.longBlackout',
    ],
  },
  consequence:
    'The estate grid goes dark. The Ring has no links left. The finale opens: the Chairman leaves by the lagoon jetty and is never seen.',
  consequenceFlags: ['lekki.gridDark'],
  replayModifier: {
    id: 'longBlackout',
    name: 'Long Blackout',
    description: 'The switch sequence is longer: remember every lamp.',
    bonus: 'Earns the "Long Blackout" badge for this district',
  },
};

export const LEKKI: DistrictContent = {
  id: 'lekki',
  name: 'Lekki',
  tagline: 'The last light still on',
  mapPos: { x: 88, y: 82 },
  arenaId: 'rumbleLekki',
  briefing: {
    title: 'Lights Out on the Lagoon',
    location:
      'Lekki: the Link Bridge over the lagoon, the Admiralty Way signage and illuminated plaza, the promenade palms',
    summary:
      'The Chairman’s last stronghold is a standby plant behind a glowing plaza. Steward Halcyon runs it like a hotel. Switch the private systems off in the order the grid signals, avoid the contingency strikes, and take the Steward in the dark.',
    objectives: [
      'Switch the private systems off in the signalled order',
      'Avoid the contingency strike a wrong switch calls',
      'Finish the Steward when the grid is dark',
    ],
    intel: [
      'The grid shows the next switch by lamp: follow the order, not the nearest panel.',
      'Strikes are always warned and have an escape step.',
      'Estate staff are not the enemy: only the private guard is.',
    ],
    warnings: [
      'A wrong switch is not a mistake you can undo: a strike lands.',
      'The promenade is open to the lagoon: do not get cornered against the water.',
    ],
    brokerMessage: {
      speaker: 'UNKNOWN NUMBER',
      text: 'You have come a long way for a light switch, small one. Do turn it off gently.',
      fromBroker: true,
    },
  },
  landmarks: [
    {
      id: 'linkBridge',
      name: 'Link Bridge over the Lagoon',
      note: 'A graceful cable-stayed bridge glittering across the lagoon, fictional name; no real signage.',
    },
    {
      id: 'admiraltyPlaza',
      name: 'Admiralty Way Signage and Illuminated Plaza',
      note: 'A wide commercial road with large illuminated name signs (fictional "Halcyon Court") and a glowing plaza of fountains and bollard lights.',
    },
    {
      id: 'promenadePalms',
      name: 'Promenade Palms',
      note: 'A lagoon-side promenade lined with palms, benches and strings of warm lights, with a pale jetty at the end.',
    },
  ],
  boss: LEKKI_BOSS,
  requires: ['lagosIsland'],
  factionIds: ['gatehouseGuard', 'continuityOffice', 'streetWatch'],
};
