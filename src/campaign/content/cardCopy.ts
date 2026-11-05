/**
 * Hand-written short copy for the campaign cards (docs/CAMPAIGN_TEXT_NARRATION.md), keyed by card id. A card
 * shows this summary (one or two sentences) and objective line (twelve words at most) by default; the long text
 * it stands for is kept whole in the card's Read more, so nothing is removed. A content field (`cardSummary`,
 * `objectiveCard`, `introCard` ...) wins over this table; a card with neither is derived from the long text
 * (`cards.ts`). The broker is only ever named in the third person here: his own words stay message cards.
 */
import type { CardCopy } from '../types';

export const CARD_COPY: Readonly<Record<string, CardCopy>> = {
  prologue: {
    summary:
      'The blackout hits only Ojuelegba’s lane, and Mama Put says a hidden network called the Ring sells the street its own light. Break its radio in Oshodi and the whole chain will feel it.',
    objective: 'Pick a fighter and head to Oshodi',
  },
  finale: {
    summary:
      'Six keepers have fallen and the whole island can see the stars. The Chairman says a ring is only a shape, then slips away by boat.',
    objective: 'Watch the Ring end',
  },
  ending: {
    summary:
      'The Oruka Ring collapses and the Chairman vanishes from the jetty. The empire is gone, the man is not.',
    objective: 'Replay districts for stars and modifiers',
  },

  'briefing.ojuelegba': {
    summary: 'Home turf. Mama Put points you at the first thread of the Ring: a radio net at Oshodi.',
    objective: 'Pick a fighter, then head to Oshodi',
  },
  'briefing.oshodi': {
    summary:
      'Oga Sunmola’s dispatch radio decides when every bus in Oshodi moves. Jam his relays, dodge the convoys he calls, then take him down.',
    objective: 'Jam the relays, then finish Oga Sunmola',
  },
  'briefing.mushin': {
    summary:
      'Madam Ronke hoards the brake pads and rents them back to the street. Blast her stacks and stop the runners who restock them.',
    objective: 'Blast the parts stacks, then finish Madam Ronke',
  },
  'briefing.fadeyiSomolu': {
    summary:
      'Marshal Kobo decides who crosses the road, and for how much. Hold each junction until it opens, then take him off his box.',
    objective: 'Hold every junction open, then finish Marshal Kobo',
  },
  'briefing.ebuteMetta': {
    summary:
      'Ikenna Wayside runs the rail yard on a timetable the Chairman wrote. Hit his switches only while their windows are open.',
    objective: 'Hit each switch in its window, then finish Ikenna',
  },
  'briefing.lagosIsland': {
    summary:
      'The Chairman’s proof is locked in the island’s ledgers. Carry them to the press before Barrister Quill’s auditors catch you.',
    objective: 'Deliver every ledger, then finish Barrister Quill',
  },
  'briefing.lekki': {
    summary:
      'The last stronghold is a standby plant behind a glowing plaza. Switch its systems off in the signalled order and take the Steward in the dark.',
    objective: 'Switch off the grid in order, then finish the Steward',
  },

  'intro.oshodi': {
    summary:
      'Mama Put points out Oga Sunmola, whose voice moves every bus in Oshodi. An unknown number tells him to let you dance, and the convoys wake up.',
  },
  'intro.mushin': {
    summary:
      'Madam Ronke sells the whole market its own spare parts at her price. The Chairman tells her to sell you nothing, and her crew stocks the shelves.',
  },
  'intro.fadeyiSomolu': {
    summary:
      'Marshal Kobo closes the crossing and tells you to wait. The Chairman agrees, and every marshal goes to their post.',
  },
  'intro.ebuteMetta': {
    summary:
      'Ikenna Wayside keeps the yard timetable and says you are early. The Chairman asks him to be gentle, and the next departure is in thirty seconds.',
  },
  'intro.lagosIsland': {
    summary:
      'Barrister Quill keeps the records nobody reads and has an objection ready. The Chairman lets you run, so the auditors take their places.',
  },
  'intro.lekki': {
    summary:
      'Steward Halcyon welcomes you to Halcyon Court with a drink and a warning. This is the last room, and the Chairman wants you to feel it.',
  },

  'defeat.oshodi': {
    summary:
      'The relays go dead and every convoy stops where it stood. Oga Sunmola is called to the Chairman’s car, and the buses are back in the drivers’ hands.',
  },
  'defeat.mushin': {
    summary:
      'Madam Ronke’s stock is on the ground and the honest traders open their stalls. Prices on the lane are already falling.',
  },
  'defeat.fadeyiSomolu': {
    summary:
      'All three junctions open and Marshal Kobo files his complaint. A bus rolls through without paying and the footbridge claps.',
  },
  'defeat.ebuteMetta': {
    summary:
      'The last switch falls and every wagon stands still. Ikenna Wayside says lateness is what freedom looks like on paper.',
  },
  'defeat.lagosIsland': {
    summary:
      'Every ledger reaches the press and Barrister Quill resigns. The first page to land is signed “C.”',
  },
  'defeat.lekki': {
    summary:
      'The estate grid goes dark and Steward Halcyon looks up at the stars. Down at the jetty, a pale boat starts its engine.',
  },
  'defeat.oshodi.ousted': {
    summary: 'Oga Sunmola walks away from a dead radio net. The Chairman lets him go.',
  },
  'defeat.mushin.ousted': {
    summary: 'Madam Ronke leaves the lane with the keys. Her stacks are open to everyone.',
  },
  'defeat.fadeyiSomolu.ousted': {
    summary:
      'Marshal Kobo leaves his box and the junctions stay open. The Chairman says they will draw another line.',
  },
  'defeat.ebuteMetta.ousted': {
    summary: 'Ikenna Wayside leaves the signal cabin. The yard runs on the drivers’ own timetable.',
  },
  'defeat.lagosIsland.ousted': {
    summary: 'Barrister Quill withdraws and leaves the ledgers behind. The press drop is open.',
  },
  'defeat.lekki.ousted': {
    summary:
      'Steward Halcyon slips away by boat with the grid off. The Chairman says he bought nine minutes.',
  },
};
