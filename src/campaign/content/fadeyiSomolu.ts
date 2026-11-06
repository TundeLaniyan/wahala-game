import type { BossDef, DistrictContent, StoryLine } from '../types';

const marshal = (text: string): StoryLine => ({ speaker: 'MARSHAL KOBO', text });
const chairman = (text: string): StoryLine => ({ speaker: 'THE CHAIRMAN', text, fromBroker: true });

/** BOSS 3. Mechanic: junctionAccess (hold junction zones against route marshals; held junctions open routes). */
export const FADEYI_SOMOLU_BOSS: BossDef = {
  id: 'marshalKobo',
  districtId: 'fadeyiSomolu',
  name: 'Marshal Gbenga Kobo',
  nickname: 'Oga Footbridge',
  title: 'Garage Master of the Fadeyi Crossing',
  culturalInspiration:
    'Bus-stop and footbridge "garage" culture at Fadeyi: the person everyone at a crossing knows by sight, the ticket booklet and the whistle, reflective vests and flat caps, hawkers and conductors who greet him first, a bridge landing that works as a town square, the BRT lane and the bank frontage beside it. Inspired by the texture of a busy crossing and its bus-stop leadership in general, never by any real person, name or biography.',
  areaConnection:
    'Fadeyi and Somolu sit where three corridors meet. Hold the junction and you hold every route to the lagoon: the Chairman’s trucks, the commuters, the lot.',
  visualDirection: {
    characterId: 'lekkiBoy',
    description:
      'Easy, loud-friendly and everywhere at once: a green reflective vest over a bright print shirt, a flat cap with the marshals’ crest, a whistle on a cord, a worn ticket booklet and a chalk route board under one arm, a lit traffic wand tucked in his belt. He stands at the foot of the footbridge stairs and everyone passing greets him first.',
    palette: { primary: 0x2fa84f, accent: 0xff7a1a },
    artNeeds:
      'Boss costume variant of the lekki rig (vest, print shirt, flat cap); props: whistle, ticket booklet, chalk route board, wand; idle: tears a ticket, blows the whistle, waves a bus through then stops it; junction-zone floor decals (green hold ring, orange toll bar); route-open FX; defeat: his painted box is scrubbed out by the crowd.',
  },
  entourage:
    'Two vest-and-cap marshals with ticket booklets, a young runner with a chalk route board, a hawker who shouts the stops for him, and a small crowd of regulars who greet him before they cross.',
  entrance:
    'A long whistle from the top of the footbridge stairs; he walks down greeting people by name, and the crossing quietens as he passes.',
  personality:
    'Warm, loud-friendly and unhurried: greets the whole crossing by name ("my people, e kaasan"), then names his price like a favour. Speaks in tickets and favours ("this one na complimentary, next one na ticket"); the formality only arrives with the ledger. Pidgin comes easily; he gets quieter, not louder, when offended. Believes a crossing is a courtesy he grants.',
  protectionCrew: {
    factionId: 'koboMarshals',
    roles: [
      { role: 'objectiveDefender', count: 3 },
      { role: 'blocker', count: 2 },
      { role: 'meleeGuard', count: 1 },
    ],
  },
  systemControlled: 'The junction passage grid of Fadeyi and Somolu: who may cross when, and at what price',
  exposeObjective:
    'Hold each junction zone against the route marshals until it opens; when every junction is held and open, the Garage Master is exposed at his box and can be eliminated.',
  objectiveKind: 'junctionAccess',
  signatureAbility: {
    name: 'Right of Way',
    description:
      'The marshals contest every junction you stand on and press you off it: you must clear them from the zone to keep your hold.',
  },
  counterplay:
    'Draw the marshals out of a zone with a generator or a bait, then hold it. Hold the junction nearest the market first: the neighbourhood watch will cover your back.',
  phases: [
    {
      title: 'First Crossing',
      objective: 'Hold the first junction zone until it opens a route.',
      bossBehaviour: 'Watches from his box, signalling marshals to the contested zone with the wand.',
      pressure: 'Marshals walk in a loop and re-contest any zone you leave.',
      callout: 'Stand in the zone to hold it. Clear the marshals out first.',
    },
    {
      title: 'Rush Hour Toll',
      objective: 'Hold two junctions in turn while marshals close the opened routes behind you.',
      bossBehaviour:
        'Raises the toll: marshals stack up on the second junction and sweep the routes you have already opened.',
      pressure: 'Two zones contested; blockers narrow the route between them.',
      callout: 'Hold, open, move on. Do not let the marshals box you in.',
    },
    {
      title: 'Closing Time',
      objective: 'Hold the last junction, then finish the exposed Garage Master.',
      bossBehaviour: 'Steps off his box to personally contest the last junction, wand raised.',
      pressure: 'The whole crew defends the final zone; the route out is only open while held.',
      callout: 'Last crossing. Hold it and he loses the box. Finish him there.',
    },
  ],
  introduction: [
    {
      speaker: 'MAMA PUT',
      text: 'Fadeyi junction na Kobo territory. You must pay to cross a road wey God make free.',
    },
    marshal(
      'Good evening, my people, e kaasan. Who dey cross today? Show me your ticket or tell me your business.',
    ),
    {
      speaker: 'RADIO',
      text: 'Three footbridge routes, one BRT lane, a bank on every corner. Marshals at each. Hold the junctions to open the way.',
    },
    marshal(
      'The rules here are simple. You cross when I say. You pay when I say. You smile when I say, and na me go greet you first.',
    ),
    marshal('Today I say: wait.'),
    chairman('Gbenga, you hold the road. I hold the others. We are in agreement.'),
    marshal('Yes, Chairman. All marshals: the crossing is closed.'),
  ],
  defeatSequence: [
    marshal('This is irregular. The crossing is closed. I closed it. I have it in my ledger.'),
    {
      speaker: 'RADIO',
      text: 'Junction one open. Junction two open. Junction three open. All routes clear.',
    },
    marshal('You cannot just open a road because it is a road. Roads have... conditions.'),
    {
      speaker: 'MAMA PUT',
      text: 'See how he talk. When his own box no dey get money, he go find work like the rest of us.',
    },
    marshal('Fine. Fine, na. I will file a complaint. In triplicate. With the Chairman.'),
    {
      speaker: 'NARRATOR',
      text: 'A bus rolls through the junction without stopping to pay. The driver waves. The whole footbridge claps.',
    },
  ],
  defeatSequenceOusted: [
    marshal('I will return when the traffic does. The road is not finished with me.'),
    { speaker: 'RADIO', text: 'The Garage Master has left his box. The junctions are open.' },
    chairman('A crossing is only a line on a map, Gbenga. We will draw another.'),
  ],
  reward: {
    id: 'reward.fadeyiSomolu.freeCrossing',
    kind: 'title',
    name: 'Free Crossing',
    description: 'The title "Free Crossing" shown beside your name on the campaign map and result screens.',
    unlocks: ['title.freeCrossing', 'modifier.tollSeason', 'district.ebuteMetta'],
  },
  consequence:
    'The junctions at Fadeyi and Somolu open to everyone, the green-vest marshals stand down and commuters cross free. The Chairman loses his passage control to the lagoon and sends word to the railway yard at Ebute-Metta. The next district opens.',
  consequenceFlags: ['fadeyiSomolu.passageFreed'],
  replayModifier: {
    id: 'tollSeason',
    name: 'Toll Season',
    description: 'Every junction takes longer to hold before it opens a route.',
    bonus: 'Earns the "Toll Season" badge for this district',
  },
};

export const FADEYI_SOMOLU: DistrictContent = {
  id: 'fadeyiSomolu',
  name: 'Fadeyi and Somolu',
  tagline: 'Who gets to cross the road',
  mapPos: { x: 50, y: 30 },
  arenaId: 'rumbleFadeyi',
  briefing: {
    title: 'The Toll at the Crossing',
    location: 'Fadeyi and Somolu: the footbridge, the BRT lane and the bank frontage',
    summary:
      'Three corridors, a lit wand and a ledger. Marshal Kobo decides who crosses and for how much. Hold each junction zone against his route marshals until it opens, then take the Garage Master off his painted box.',
    objectives: [
      'Hold junction zones against the route marshals',
      'Open routes by holding each junction in turn',
      'Finish Marshal Kobo when the last junction is open',
    ],
    intel: [
      'A junction only holds while you stand in its zone and the marshals are cleared from it.',
      'Opened routes help you move: use them to stay ahead of the crew.',
      'The footbridge crowd and Ore Street Watch cheer when you open a route: they are never targets.',
    ],
    warnings: [
      'Marshals loop on a fixed path: learn the loop and hold the zone on the quiet side.',
      'Blast carefully: the bank frontage glass is a hazard, not cover.',
    ],
    brokerMessage: {
      speaker: 'UNKNOWN NUMBER',
      text: 'The road belongs to whoever may close it. Remember that when you open it.',
      fromBroker: true,
    },
  },
  landmarks: [
    {
      id: 'fadeyiFootbridge',
      name: 'Footbridge',
      note: 'A long, steel pedestrian footbridge with stair towers and hawkers at the landing, painted panel signs reading only route numbers.',
    },
    {
      id: 'brtLane',
      name: 'BRT Lane',
      note: 'A raised dedicated bus lane painted red, with generic stop shelters (no operator branding) running the length of the arena.',
    },
    {
      id: 'bankFrontage',
      name: 'Bank Frontage',
      note: 'A glass-fronted bank and ATM kiosk row with a fictional name ("Pillar & Co Bank"), neon tickers and a queue of commuters.',
    },
  ],
  boss: FADEYI_SOMOLU_BOSS,
  requires: ['mushin'],
  factionIds: ['koboMarshals', 'gatehouseGuard', 'streetWatch'],
};
