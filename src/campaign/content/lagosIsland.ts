import type { BossDef, DistrictContent, StoryLine } from '../types';

const registrar = (text: string): StoryLine => ({ speaker: 'BARRISTER QUILL', text });
const chairman = (text: string): StoryLine => ({ speaker: 'THE CHAIRMAN', text, fromBroker: true });

/** BOSS 5. Mechanic: evidenceRun (collect ledgers, deliver them to the press drop while auditors chase the carrier). */
export const LAGOS_ISLAND_BOSS: BossDef = {
  id: 'barristerQuill',
  districtId: 'lagosIsland',
  name: 'Barrister Tolani Quill',
  nickname: 'The Registrar',
  title: 'Registrar of Receipts',
  culturalInspiration:
    'The old commercial core of the island: trade houses, court-adjacent offices, a civic square under a great dome, cargo warehouses by the water and market lanes where every sale leaves a paper trace. Inspired by the world of records and receipts, not by any real firm, court or official.',
  areaConnection:
    'Everything the Chairman has done in five districts is written down somewhere, in the island’s ledgers. The Registrar keeps them safe, stamped and out of daylight; if they reach the press, the Ring has nothing left to hide behind.',
  visualDirection: {
    characterId: 'campusQueen',
    description:
      'Immaculate grey and burgundy: a tailored robe-like coat, a white collar tab, a quill-shaped pen she tucks behind one ear, round spectacles. Carries a leather portfolio like a shield. Her office door is always slightly open.',
    palette: { primary: 0x8a8d93, accent: 0xb3202a },
    artNeeds:
      'Boss costume variant of the campus rig; portfolio + pen props; idle: adjusts spectacles and stamps something; ledger props (stack, loose pages); press-drop prop; carrier-chase marker FX; defeat: ledgers fly out of her portfolio like startled birds.',
  },
  personality:
    'Polished, courteous and quietly contemptuous. Speaks in motions and objections ("noted and dismissed"), and never loses her temper because she has never been surprised. Believes anything is legal if it was filed on time.',
  protectionCrew: {
    factionId: 'ledgerBureau',
    roles: [
      { role: 'runner', count: 3 },
      { role: 'escort', count: 2 },
      { role: 'meleeGuard', count: 1 },
    ],
  },
  systemControlled: 'The island ledgers: trade records, receipts and the paper trail of every district',
  exposeObjective:
    'Collect the Chairman’s ledgers and deliver them to the press drop while the bureau auditors chase the carrier; when the last ledger is delivered, the Registrar is exposed in her own office.',
  objectiveKind: 'evidenceRun',
  signatureAbility: {
    name: 'Right of Seizure',
    description:
      'Auditors lock onto whoever carries a ledger and run them down: a carrier is hunted by the bureau until the ledger is delivered.',
  },
  counterplay:
    'Break the chase with generator blasts in the market lanes, use the bridge approach as a shortcut, or draw the auditors away before you pick up a ledger.',
  phases: [
    {
      title: 'Discovery',
      objective: 'Collect the first ledger and deliver it to the press drop.',
      bossBehaviour: 'Keeps to her office and sends two auditors to shadow the nearest ledger.',
      pressure: 'Auditors pick up your trail the moment you hold a ledger.',
      callout: 'Pick up the ledger, run it to the press drop. Do not stop in a lane.',
    },
    {
      title: 'Cross-Examination',
      objective: 'Deliver two more ledgers while auditors close in from the market lanes.',
      bossBehaviour: 'Calls in more auditors and "objects" by blocking the shortest routes with escorts.',
      pressure: 'More auditors, escorts on the main route, the clock running.',
      callout: 'Two more ledgers. Use the side lanes: the main route is watched.',
    },
    {
      title: 'Contempt of Court',
      objective: 'Deliver the final ledger, then finish the exposed Registrar.',
      bossBehaviour: 'Leaves her office to guard the last ledger in the civic square herself.',
      pressure: 'The whole bureau is on the carrier; the route to the press drop is narrow.',
      callout: 'The last ledger. Get it to the press, then she is exposed.',
    },
  ],
  introduction: [
    {
      speaker: 'MAMA PUT',
      text: 'Lagos Island. Money wey nobody see, records wey nobody read. Quill keeps am all.',
    },
    registrar('Good evening. You are in the wrong building, but you are welcome to wait. Everyone waits.'),
    {
      speaker: 'RADIO',
      text: 'Ledgers are marked on the board. Collect and deliver to the press drop by the marina. Auditors will chase whoever holds one.',
    },
    registrar(
      'I should tell you, for the record, that what you intend to do is a breach of seven different procedures. I have thought of them all.',
    ),
    registrar('Please note my objection.'),
    chairman('Tolani. Let her run. Ink is patient.'),
    registrar('As you wish, Chairman. Auditors, take your places. The court is in session.'),
  ],
  defeatSequence: [
    registrar('Objection. This is highly irregular. Objection!'),
    {
      speaker: 'RADIO',
      text: 'Press drop confirmed: every ledger is out. The papers are being printed tonight.',
    },
    registrar('You think exposure is a verdict? It is a headline. Headlines expire.'),
    {
      speaker: 'MAMA PUT',
      text: 'Maybe. But a headline can walk into every house in Lagos before breakfast.',
    },
    registrar('Then we shall see. Auditors, stand down. File my resignation under "unavoidable".'),
    {
      speaker: 'NARRATOR',
      text: 'The portfolio drops open. Pages scatter across the civic square, and the first one to land reads, in careful handwriting, "C."',
    },
  ],
  defeatSequenceOusted: [
    registrar('The record will show that I withdrew, not that I lost.'),
    { speaker: 'RADIO', text: 'The bureau has abandoned the ledgers. The press drop is open.' },
    chairman('She was always better at leaving a room than winning one.'),
  ],
  reward: {
    id: 'reward.lagosIsland.openRecord',
    kind: 'perk',
    name: 'Open Record',
    description:
      'A convenience perk: the campaign map shows a record of your best stars and times for every district. Informational only; no effect on missions.',
    unlocks: ['perk.openRecord', 'modifier.auditWeek', 'district.lekki'],
  },
  consequence:
    'The ledgers reach the press and the island wakes up to the paper trail. The Registrar’s bureau is dissolved overnight. The Chairman retreats to the one place where he still controls everything: the private estates and standby power of Lekki. The final district opens.',
  consequenceFlags: ['lagosIsland.recordsExposed'],
  replayModifier: {
    id: 'auditWeek',
    name: 'Audit Week',
    description: 'One more ledger to deliver and a shorter clock.',
    bonus: 'Earns the "Audit Week" badge for this district',
  },
};

export const LAGOS_ISLAND: DistrictContent = {
  id: 'lagosIsland',
  name: 'Lagos Island',
  tagline: 'Every receipt tells on somebody',
  mapPos: { x: 68, y: 74 },
  arenaId: 'rumbleLagosIsland',
  briefing: {
    title: 'The Paper Trail',
    location:
      'Lagos Island: the cathedral and civic dome, the Third-Mainland-type bridge approach, the Marina and market lanes',
    summary:
      'The Chairman’s proof of everything lives in ledgers locked in the island’s old trade houses. Carry them to the press before Barrister Quill’s auditors run you down, then close her office for good.',
    objectives: [
      'Collect ledgers from the marked locations',
      'Deliver them to the press drop while the auditors chase you',
      'Finish Barrister Quill when the last ledger is delivered',
    ],
    intel: [
      'Auditors lock on to the ledger carrier: break the chase with blasts or by using the market lanes.',
      'The bridge approach is the fastest route to the press drop but the most watched.',
      'Traders in the market lanes are bystanders and not your enemies.',
    ],
    warnings: [
      'Auditors can run faster than a nervous carrier: plan your route before you pick a ledger up.',
      'The Marina side is open: do not get cornered against the water.',
    ],
    brokerMessage: {
      speaker: 'UNKNOWN NUMBER',
      text: 'Paper is patient, small one. It will outlive both of us. I merely prefer to choose which pages are read.',
      fromBroker: true,
    },
  },
  landmarks: [
    {
      id: 'civicDome',
      name: 'Cathedral and Civic Dome',
      note: 'A pale colonial-era dome and cathedral spire over a civic square, fictional name boards only, pigeons and a clock.',
    },
    {
      id: 'bridgeApproach',
      name: 'Third-Mainland-Type Bridge Approach',
      note: 'A long concrete bridge approach with sodium lamps and a ramp curving down into the island, no real signage.',
    },
    {
      id: 'marinaMarket',
      name: 'Marina and Balogun-Style Market',
      note: 'A waterfront promenade next to a maze of fabric and trinket market lanes under striped awnings; fictional stall names only.',
    },
  ],
  boss: LAGOS_ISLAND_BOSS,
  requires: ['ebuteMetta'],
  factionIds: ['ledgerBureau', 'continuityOffice', 'mamaPutMutual'],
};
