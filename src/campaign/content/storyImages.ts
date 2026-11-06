/**
 * Story panels: which picture goes with which campaign card (docs/STORY_VISUALS.md).
 *
 * Pure data, no Vite and no DOM: a key maps to the file name under `src/assets/story/` (built by
 * `tools/story/build_story_art.py` from in-engine captures, never hand-edited), the alt text, the focal point and an
 * optional caption. The UI resolves the file name to a URL (`ui/campaign/storyImageUrls.ts`); a key without a file,
 * or a file that fails to load, simply shows no picture and never blocks a card or the campaign.
 *
 * Keys: `prologue`, `finale`, `ending`, `district.<id>.briefing`, `boss.<bossId>.intro`, `section.<missionId>`,
 * `raid.<raidId>`. A story card id maps to its key with `storyImageKeyForCard`.
 *
 * Rules (the ethics checklist in docs/CAMPAIGN_STORY.md applies): no picture shows the Chairman (no face, no
 * silhouette, no portrait); murals are symbols only; nothing is real signage or a real person; no picture shows
 * violence against, or the defeat of, a keeper (boss panels are arrival compositions).
 */
import { CAMPAIGN, getSectionMission } from './index';

export interface StoryImageDef {
  /** File under `src/assets/story/` (a 960 x 540 WebP). */
  file: string;
  /** What the picture shows, for a screen reader. Never empty. */
  alt: string;
  /** CSS `object-position` focal point, kept inside the crop when the box is wider or narrower than 16:9. */
  position: string;
  /** Optional one-line caption drawn over the scrim at the bottom of the picture (decorative; the card text is the story). */
  caption?: string;
}

/** The panel image budget the tests enforce. */
export const STORY_IMAGE_BUDGET = {
  width: 960,
  height: 540,
  /** One hero image. */
  maxBytes: 90 * 1024,
  /** The whole set. */
  maxTotalBytes: 2 * 1024 * 1024,
} as const;

const district = (
  id: string,
  alt: string,
  caption: string,
  position = '50% 55%',
): [string, StoryImageDef] => [
  `district.${id}.briefing`,
  { file: `district-${id}-briefing.webp`, alt, position, caption },
];

const boss = (id: string, alt: string, position = '50% 62%'): [string, StoryImageDef] => [
  `boss.${id}.intro`,
  { file: `boss-${id}-intro.webp`, alt, position },
];

export const STORY_IMAGES: Readonly<Record<string, StoryImageDef>> = Object.fromEntries([
  // ---- the campaign opening and ending
  [
    'prologue',
    {
      file: 'prologue.webp',
      alt: 'Dusk under the Ojuelegba flyover: concrete piers, bagged water and crates stacked beside a yellow danfo, tenement buildings beyond, and an orange and violet sky.',
      position: '50% 55%',
    },
  ],
  [
    'finale',
    {
      file: 'finale.webp',
      alt: 'Three fighters stand on the Lekki promenade at blue hour, looking up past a row of palms at the tower and cables of the Lagoon Link Bridge.',
      position: '50% 60%',
    },
  ],
  [
    'ending',
    {
      file: 'ending.webp',
      alt: 'Three fighters seen from behind walk back towards the Ojuelegba underbridge beneath a road-sign gantry, the flyover piers ahead and a glowing orange and violet sky above.',
      position: '50% 62%',
    },
  ],

  // ---- district briefings
  district(
    'ojuelegba',
    'Under the Ojuelegba flyover at dusk: the stop master in a bright print shirt stands with two young conductors and a hawker in front of the concrete piers and stacks of water sachets.',
    'Ojuelegba · the underbridge stop',
    '45% 60%',
  ),
  district(
    'oshodi',
    'The Oshodi interchange terminal at dusk: terminal canopies with bus-bay signs, a row of yellow danfo and a skywalk stair under the flyover steelwork.',
    'Oshodi · the interchange terminal',
  ),
  district(
    'mushin',
    'A Mushin market lane at dusk seen from above the umbrellas: shopfront signs for tyres, batteries and motor spares under a red-brick building, with two fighters walking in.',
    'Mushin · the parts market lane',
  ),
  district(
    'fadeyiSomolu',
    'The Fadeyi BRT lane at dusk: a bus shelter with painted signs beside a bus-stop marking, a line of shopfronts behind it, and two fighters waiting at the shelter.',
    'Fadeyi · the BRT lane',
  ),
  district(
    'ebuteMetta',
    'The Ebute-Metta station forecourt at dusk: a station building with a platforms sign, railway tracks crossing the road, and two fighters at the edge of the street.',
    'Ebute-Metta · the station crossing',
  ),
  district(
    'lagosIsland',
    'The old cathedral and civic hall on Lagos Island at dusk: a stone facade with pointed windows, a green dome beside it, trees in the square, and two fighters crossing the plaza.',
    'Lagos Island · the civic square',
  ),
  district(
    'lekki',
    'The Lekki Link Bridge promenade at dusk: palms along a stone embankment, the bridge tower and its cables against an orange sky, and two fighters at the water.',
    'Lekki · the Link Bridge promenade',
  ),

  // ---- boss introductions: arrival compositions (the game has no boss costume art yet, so the keeper is the figure at the front
  // of the group and the colour of the light is the keeper's palette)
  boss(
    'ogaSunmola',
    'Oga Sunmola arrives at the Oshodi interchange: the park master stands at the front of his entourage in a line before the terminal canopy and a parked danfo, in warm yellow dusk light.',
  ),
  boss(
    'madamRonke',
    'Madam Ronke in her Mushin parts yard: the broker stands at the front of her crew among crates and tyre stacks, red-brown stalls and tall buildings behind, under a flame-coloured sky.',
  ),
  boss(
    'marshalKobo',
    'Marshal Kobo at the Fadeyi crossing: the garage master stands at the front of a group of marshals and followers before a BRT shelter and its painted sign, in green-tinted evening light.',
  ),
  boss(
    'ikennaWayside',
    'Ikenna Wayside at Ebute-Metta station: the timetable keeper stands at the front of his aides below the station sign, rail-yard buildings behind, in brown evening light.',
  ),
  boss(
    'barristerQuill',
    'Barrister Quill on Lagos Island: the registrar stands at the front of her clerks before the old cathedral facade, a tree beside them, in cool grey evening light.',
  ),
  boss(
    'stewardHalcyon',
    'Steward Halcyon at the Lekki Link Bridge plaza: the steward stands at the front of his staff by a fountain, palms and the bridge cables behind, in steel-blue evening light.',
  ),

  // ---- field and raid sections (thumbnails in the district's section list)
  [
    'section.oshodi.approach',
    {
      file: 'section-oshodi-approach.webp',
      alt: 'Rows of yellow danfo fill the Oshodi bus park at dusk, a fighter in a blue shirt walking between them towards the terminal and its ticket hall.',
      position: '50% 55%',
      caption: 'Oshodi · the terminal approach',
    },
  ],
  [
    'raid.warehouseDispatchDepot',
    {
      file: 'raid-warehouseDispatchDepot.webp',
      alt: 'Inside the Oshodi dispatch depot: a maze of stacked crates and low walls with a fighter and park wardens moving between the stacks in a brown, dusty haze.',
      position: '50% 55%',
      caption: 'Oshodi · the dispatch depot',
    },
  ],
  [
    'section.ebuteMetta.railYard',
    {
      file: 'section-ebuteMetta-railYard.webp',
      alt: 'The Ebute-Metta rail-yard goods bay at dusk: a walled yard of low stacks with marked freight crates ringed in yellow, a fighter among the stacks and park staff beyond.',
      position: '50% 50%',
      caption: 'Ebute-Metta · the rail-yard goods bay',
    },
  ],
]);

/** The picture of a key (a story card id goes through `storyImageKeyForCard` first), or null when it has none. */
export function storyImageDef(
  key: string,
  table: Readonly<Record<string, StoryImageDef>> = STORY_IMAGES,
): StoryImageDef | null {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key]! : null;
}

/** The image key of a story card id (`briefing.oshodi` -> `district.oshodi.briefing`), or null when the card has none. */
export function storyImageKeyForCard(cardId: string): string | null {
  if (cardId === 'prologue' || cardId === 'finale' || cardId === 'ending') return cardId;
  const [kind, ...rest] = cardId.split('.');
  const tail = rest.join('.');
  if (!tail) return null;
  if (kind === 'briefing') return `district.${tail}.briefing`;
  if (kind === 'intro') {
    const keeper = (CAMPAIGN.districts as Record<string, { boss: { id: string } | null }>)[tail]?.boss;
    return keeper ? `boss.${keeper.id}.intro` : null;
  }
  if (kind === 'section') return cardId;
  return null;
}

/** The picture keys of a section mission row: its own panel, then one per raid door it has (`raid.<raidId>`). */
export function sectionImageKeys(missionId: string): string[] {
  const doors = getSectionMission(missionId)?.doors ?? [];
  return [`section.${missionId}`, ...doors.map((d) => `raid.${d.raidId}`)];
}
