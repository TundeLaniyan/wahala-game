import type { BossDef, DistrictContent, StoryLine } from '../types';

const madam = (text: string): StoryLine => ({ speaker: 'MADAM RONKE', text });
const chairman = (text: string): StoryLine => ({ speaker: 'THE CHAIRMAN', text, fromBroker: true });

/** BOSS 2. Mechanic: supplyRoutes (destroy parts stacks with blasts; runners restock them unless eliminated). */
export const MUSHIN_BOSS: BossDef = {
  id: 'madamRonke',
  districtId: 'mushin',
  name: 'Madam Ronke',
  nickname: 'Iya Spare',
  title: 'The Parts Broker',
  culturalInspiration:
    'The great spare-parts markets of mainland Lagos: stacked engine blocks, brake pads and tyres under rows of coloured umbrellas, runners who find any part in minutes, the unwritten haggling rules every mechanic knows.',
  areaConnection:
    'Mushin’s parts lanes feed every danfo and trailer on the mainland. She did not build the market: she bought the supply that keeps it alive and now sets the price of keeping a bus on the road.',
  visualDirection: {
    characterId: 'campusQueen',
    description:
      'Brisk and immaculate under all the grease: a flame-red wrapper and blouse with a mechanic’s apron over it, a ring of tiny keys on her belt, big gold earrings, a folding stool she never sits on. Her stall is the only clean one in the lane.',
    palette: { primary: 0xc0392b, accent: 0xf4d03f },
    artNeeds:
      'Boss costume variant of the campus rig; key-ring + apron props; idle: counts a wad of notes; supply-stack props (tyre towers, engine blocks, brake-pad crates); restock FX; defeat: the umbrella canopy collapses over her stall.',
  },
  personality:
    'Warm as a handshake and sharp as a price tag. Calls everyone "my dear" and "customer". Haggles even in a fight and treats every blast as a negotiation she intends to win. Never raises her voice: she raises prices.',
  protectionCrew: {
    factionId: 'sparehandRunners',
    roles: [
      { role: 'runner', count: 4 },
      { role: 'supportUnit', count: 2 },
      { role: 'meleeGuard', count: 1 },
    ],
  },
  systemControlled: 'The Mushin parts supply chain: stacks of hoarded parts and the runners who restock them',
  exposeObjective:
    'Destroy the hoarded parts stacks with generator blasts, and eliminate the runners who restock them, until her shelves are bare and she is exposed.',
  objectiveKind: 'supplyRoutes',
  signatureAbility: {
    name: 'Sold Out, Restocked',
    description:
      'Runners rush new parts to any stack that was blasted and not defended: a destroyed stack returns unless its runner is eliminated first.',
  },
  counterplay:
    'Eliminate the runner who would restock a stack before you blast it, or blast stacks in a chain so the runners cannot reach them all. Mama Put Mutual stalls are never targets.',
  phases: [
    {
      title: 'Open the Shelves',
      objective: 'Destroy the first parts stacks with blasts.',
      bossBehaviour: 'Bargains from behind her counter and sends runners to shelter the nearest stacks.',
      pressure: 'Runners are light and quick; stacks restock if left alone.',
      callout: 'Blast the stacks. Catch the runner who is carrying a restock.',
    },
    {
      title: 'Market Day Rush',
      objective: 'Destroy a larger set of stacks while restocking runners swarm the lanes.',
      bossBehaviour: 'Calls extra runners from the umbrella lanes and "discounts" them to speed up.',
      pressure: 'More runners at once; support units cover them from your blasts.',
      callout: 'Runners first, stacks second. Every runner you drop is one less restock.',
    },
    {
      title: 'Final Clearance',
      objective: 'Break the last stacks, then finish the exposed broker.',
      bossBehaviour: 'Abandons her counter to guard the last stack herself, her keys ringing with each step.',
      pressure: 'A tight cluster of stacks and a full crew defending it.',
      callout: 'Last stacks. When the shelves are empty she is exposed. Clear her out.',
    },
  ],
  introduction: [
    {
      speaker: 'MAMA PUT',
      text: 'Mushin parts market. You want a brake pad? Ronke has it. You want it at today’s price? Ronke has the price too.',
    },
    madam(
      'Customer, customer! Welcome! You are buying or you are browsing? Because browsing is a service and it is not free.',
    ),
    {
      speaker: 'RADIO',
      text: 'The honest traders in the lane are watching. Do not blast their stalls. Only the stacks under the red umbrellas.',
    },
    madam(
      'A stack for a bus, a bus for a lane, a lane for a day. Do you know who keeps this market alive, my dear? Me.',
    ),
    madam('And do you know who keeps me alive? A man who calls once a month and says "increase".'),
    chairman('Ronke, do not bargain with the young one. Sell her nothing.'),
    madam('Yes, Chairman. Boys! Stock the shelves! The customer is determined.'),
  ],
  defeatSequence: [
    madam('Wait wait wait, you are breaking stock! That is two million of other people’s money.'),
    { speaker: 'MAMA PUT', text: 'Other people’s money? Na their parts you hide to sell them back.' },
    madam('...Fine. Fine. Take the shelves. Take the keys. But hear me, my dear: the price was never mine.'),
    {
      speaker: 'RADIO',
      text: 'The honest traders are opening their own stalls. Prices on the lane just dropped.',
    },
    madam(
      'Tell the Chairman I paid the old debt. He will understand, he always does, and I will still be here.',
    ),
    {
      speaker: 'NARRATOR',
      text: 'The red umbrellas sag one by one. Under them, the mechanics start to laugh: they can finally afford to fix the bus.',
    },
  ],
  defeatSequenceOusted: [
    madam('You can have the stock. I keep the keys. And the rumours.'),
    { speaker: 'RADIO', text: 'Ronke has left the lane. Her stacks are open to everyone.' },
    chairman('She was mine to lose, not yours to win. Remember that.'),
  ],
  reward: {
    id: 'reward.mushin.routeMemory',
    kind: 'perk',
    name: 'Route Memory',
    description:
      'A convenience perk: the campaign map keeps the intel you have already read for every district. Cosmetic and informational only; no effect on missions.',
    unlocks: ['perk.routeMemory', 'modifier.marketDay', 'district.fadeyiSomolu'],
  },
  consequence:
    'The hoarded stacks open to every mechanic on the mainland and bus fares near the lanes start to fall. The Chairman loses his supply leverage and tightens passage control at the Fadeyi and Somolu junctions. The next district opens.',
  consequenceFlags: ['mushin.supplyBroken'],
  replayModifier: {
    id: 'marketDay',
    name: 'Market Day',
    description: 'Extra runners restock faster: clear the stacks before they come back.',
    bonus: 'Earns the "Market Day" badge for this district',
  },
};

export const MUSHIN: DistrictContent = {
  id: 'mushin',
  name: 'Mushin',
  tagline: 'The market that keeps the buses alive',
  mapPos: { x: 36, y: 38 },
  arenaId: 'rumbleMushin',
  briefing: {
    title: 'The Hoard Under the Umbrellas',
    location:
      'Mushin: the Red Line station and footbridge, the Idi-Oro food hub and the parts-market umbrellas',
    summary:
      'Every bus on the mainland is only one missing brake pad from the roadside. Madam Ronke bought the supply and now rents it back. Blast her hoarded stacks, catch the runners who restock them, then take the broker out of her own lane.',
    objectives: [
      'Destroy parts stacks with generator blasts',
      'Eliminate runners before they restock a broken stack',
      'Finish Madam Ronke when the shelves are bare',
    ],
    intel: [
      'Stacks are marked under red umbrellas: honest stalls are plain and never targets.',
      'A destroyed stack returns if its runner is not stopped: catch the runner first.',
      'Mama Put Mutual cooks in the Idi-Oro hub and will lend a helping hand if you stay near their stove.',
    ],
    warnings: [
      'Blasts travel along lanes: do not trap yourself between two stacks.',
      'Runners are fast. Use blockers and the footbridge shadow to cut them off.',
    ],
    brokerMessage: {
      speaker: 'UNKNOWN NUMBER',
      text: 'Ronke sells you a bolt, she buys you a dog. Be careful what you owe her.',
      fromBroker: true,
    },
  },
  landmarks: [
    {
      id: 'redLineFootbridge',
      name: 'Red Line Station and Footbridge',
      note: 'A modern raised rail station with a long covered pedestrian footbridge. Sign reads "RED LINE" only as a generic colour name, no operator logo.',
    },
    {
      id: 'idiOroFoodHub',
      name: 'Idi-Oro Food Hub',
      note: 'A noisy transit square of mama-put stalls, hand-painted menu boards, steaming pots, plastic stools and a bus bay.',
    },
    {
      id: 'partsUmbrellas',
      name: 'Parts-Market Umbrellas',
      note: 'Long rows of red, yellow and blue umbrellas over tyre towers, engine blocks and spanner racks; fictional shop names only.',
    },
  ],
  boss: MUSHIN_BOSS,
  requires: ['oshodi'],
  factionIds: ['sparehandRunners', 'mamaPutMutual', 'oritaWardens'],
};
