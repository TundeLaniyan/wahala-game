/**
 * The campaign frame: the unseen broker, the prologue (Ojuelegba hub), the finale and the ending.
 *
 * THE BROKER RULE (binding, see docs/CAMPAIGN_STORY.md): "Baba Alaga" ("the Chairman") is a FICTIONAL kingmaker
 * of the Oruka Ring, the invented power network the player dismantles. He is inspired only by a public image
 * (a powerful behind-the-scenes figure of Lagos infrastructure and street politics). He has no real person's
 * name, face, voice, biography or branding, and he is NEVER shown: only heard (messages, calls), read (signage,
 * stamped notes) or seen as a silhouette behind glass.
 */
import type { BrokerDef, StoryLine } from '../types';

export const BROKER: BrokerDef = {
  name: 'Baba Alaga',
  title: 'The Chairman of the Oruka Ring',
  biography:
    'Invented. Started as a motor-park treasurer who learned that whoever keeps the schedule keeps the street, then bought the schedule: park dispatch, parts supply, junction passage, rail timetables, trade records and, last, standby power for the estates that never wanted to hear a blackout. He never holds an office. He holds the numbers people call when something must be arranged. He speaks softly, in proverbs, and signs nothing but "- C."',
  presence: [
    'A calm voice on UNKNOWN NUMBER messages and phone calls',
    'A stamped note: a circuit ring with a lit window ("The Ring")',
    'A silhouette behind frosted glass or a car window: never a face, never a model',
    'Signage and ledger headings that only say "C."',
  ],
  neverShown: true,
};

const broker = (text: string): StoryLine => ({ speaker: 'THE CHAIRMAN', text, fromBroker: true });

export const PROLOGUE: StoryLine[] = [
  {
    speaker: 'NARRATOR',
    text: 'Ojuelegba, evening. The underbridge hums, the danfo conductors shout their stops, and every light on the junction is on a schedule you were never told about.',
  },
  {
    speaker: 'MAMA PUT',
    text: 'You see that blackout last night? Only our lane. The big houses on the island never blink. Somebody is selling us our own light.',
  },
  {
    speaker: 'RADIO',
    text: 'Ojuelegba to all units: another bus held at the park gate for "dispatch fees". Nobody remembers voting for a toll on the road.',
  },
  {
    speaker: 'NARRATOR',
    text: 'Behind it all runs a quiet network the street calls the Ring: park dispatch, parts supply, junction passage, rail timetables, the paperwork, the standby power. Each link has a man who thinks he is untouchable.',
  },
  {
    speaker: 'UNKNOWN NUMBER',
    text: 'I hear you have been asking questions at the Stadium Road junction. Questions are cheap, small one. Light is expensive.',
    fromBroker: true,
  },
  {
    speaker: 'MAMA PUT',
    text: 'Ignore am. Go where the schedule starts: Oshodi. Break the radio there and the Ring will feel it all the way down to Lekki.',
  },
  {
    speaker: 'NARRATOR',
    text: 'Six districts. Six keepers. One Ring. Pick your fighter. This is Wahala.',
  },
];

/** A line written for the Ojuelegba finale milestone (provisional, decision FN8). */
const provisional = (speaker: string, text: string): StoryLine => ({ speaker, text, provisional: true });

/**
 * The finale scene, played after the Ojuelegba finale's boss falls (decision FN9). Before the finale chapter existed it
 * played after Lekki; its Lekki opening is now the interim beat (`INTERIM`, content/finale.ts). The operational victory
 * comes first (the routes reopen, the impounded danfo is released, the stall and the junction are lit), then the
 * Chairman's lines and his escape by the lagoon-side jetty (kept as shipped), then the teaser (`ENDING`).
 */
export const FINALE: StoryLine[] = [
  provisional(
    'NARRATOR',
    'Ojuelegba, dawn. The gate across the corner lies open, and the whole street walks through it.',
  ),
  provisional(
    'RADIO',
    'Ojuelegba to all units: every route into the junction is open. The impounded danfo has been released. The bus stop is lit.',
  ),
  provisional(
    'MAMA PUT',
    'Look am. My stall get light, the junction get light, and nobody paid anybody for it.',
  ),
  // Bayo's LOCKED arc: he faces the community (provisional wording; nothing more is invented)
  provisional(
    'NARRATOR',
    'Bayo walks up to the stall and tells the street, out loud, what he did for the Ring. Then he waits for their answer.',
  ),
  {
    speaker: 'MAMA PUT',
    text: 'You hear that? That is not a generator. That is the whole of Lagos exhaling.',
  },
  broker('Six rooms, six keys, and you walked through every door. I congratulate you. Truly.'),
  broker(
    'But a ring is only a shape, small one. Take away the links and the shape remains in the minds of the people who needed it.',
  ),
  broker(
    'I leave the keys where you found them. I am not in any of your districts. I was never in any of them.',
  ),
  provisional('NARRATOR', 'Far across the lagoon, at the end of a pale jetty, an engine starts.'),
  {
    speaker: 'NARRATOR',
    text: 'A pale boat slides out from the jetty with its lights off. Behind the glass, only a silhouette. By the time the drones reach the water it is gone.',
  },
  {
    speaker: 'RADIO',
    text: 'The Ring is broken. The man is not caught. Eko will be watching the lagoon for a long time.',
  },
];

/** The ending card (its summary names the Ojuelegba finale since FN9; the teaser is unchanged). */
export const ENDING = {
  title: 'The Ring Breaks',
  summary:
    'Six keepers fall, the dispatch radio goes quiet, the parts hoard is broken open, the junctions are free, the yard runs on honest timetables, the ledgers reach the press and the estate grid goes dark. Then Ojuelegba takes its own corner back: the routes reopen, the danfo is released and the junction is lit. The Oruka Ring collapses. The Chairman steps out of the lagoon-side jetty and vanishes: the empire is gone, the man is not.',
  teaser:
    'A message arrives on a phone that does not belong to you: "Eko is bigger than six districts. Come and see the other side of the bridge. - C." Season two travels beyond the lagoon.',
};
