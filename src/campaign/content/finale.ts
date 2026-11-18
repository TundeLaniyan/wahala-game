/**
 * The OJUELEGBA FINALE chapter (missions 19-21, decisions FN1-FN10, docs/STORY_BIBLE.md 5.2 and 10): the last chapter of
 * BREAK THE RING, played at home once Lekki falls.
 *
 *   19  Return to Ojuelegba   reclaim the blocked routes into the junction (field, `ojuelegba.return`)
 *   20  Hold the Junction     keep the bus stop, wreck the Ring control boxes (field, `ojuelegba.junction`)
 *   21  Break the Ring        the territorial enforcer, beaten by shutting his control points down (boss, `ojuelegba.boss`)
 *
 * PROVISIONAL CONTENT (written for this milestone, not founder-approved canon; every new line carries `provisional`):
 *  - "The Landlord" is a WORKING TITLE (docs/STORY_BIBLE.md 12.3): the screens show it plainly; no biography is invented
 *    beyond the LOCKED role (an original fictional enforcer who "owns" Ojuelegba's blocked routes and control equipment);
 *    his look reuses the campaign's existing Boss variant until a bespoke one is approved.
 *  - Bayo speaks one line and is described in one more, both inside his LOCKED arc (he knowingly helped the Ring, now
 *    helps, and faces the community); his broken promise and Tayo are NOT used.
 *  - The Chairman stays unseen, is never fought and escapes in the finale scene (story.ts) AFTER the routes reopen.
 * Every name is fictional; Pidgin is affectionate (tests/campaign-content.test.ts denylists run over all of it).
 */
import type {
  BossDef,
  DistrictBriefing,
  FinaleChapterContent,
  RewardDef,
  SectionDef,
  StoryLine,
} from '../types';

/** A provisional line (FN8). */
const say = (speaker: string, text: string): StoryLine => ({ speaker, text, provisional: true });
const landlord = (text: string): StoryLine => say('THE LANDLORD', text);
const unknown = (text: string): StoryLine => ({
  speaker: 'UNKNOWN NUMBER',
  text,
  fromBroker: true,
  provisional: true,
});

/** The fictional crew of the finale (content faction, sim `FINALE_FACTION_ID`). */
export const FINALE_FACTION = 'underbridgeLockmen';

/** BOSS 7 (the finale). Mechanic: controlPoints (shut the control points down with blasts; lockers re-lock them). */
export const LANDLORD: BossDef = {
  id: 'theLandlord',
  districtId: 'ojuelegba',
  name: 'The Landlord',
  title: 'Enforcer of the Locked Routes (working title)',
  provisional: true,
  culturalInspiration:
    'Working title, provisional. An original, fictional enforcer drawn from a feeling every neighbourhood knows: a road somebody has fenced, chained and put a price on. Not inspired by, and not a portrait of, any real person.',
  areaConnection:
    'Ojuelegba is where the Ring was first noticed, and where its last physical control equipment still stands: the gate locks, control boxes and the impound that decide which route into the junction is open.',
  visualDirection: {
    characterId: 'streetBaller',
    description:
      'TEMPORARY: reuses the campaign’s existing Boss variant look (the heavier boss rig, cream suit, fedora with a gold band, shades and chain, gold leader ring). No bespoke look, name or art is approved yet.',
    palette: { primary: 0xe8dcc0, accent: 0xd8a83a },
    artNeeds:
      'Founder-approved name and look first. Then a bespoke boss rig, a key ring and padlock props, and control-point cabinets with route lamps that go dark when shut down.',
  },
  personality:
    'Talks about streets as property and people as tenants. Calm while his locks hold, short-tempered when they break. (Working characterisation, provisional.)',
  protectionCrew: {
    factionId: FINALE_FACTION,
    roles: [
      { role: 'escort', count: 1 },
      { role: 'meleeGuard', count: 1 },
      { role: 'runner', count: 2 },
      { role: 'blocker', count: 1 },
      { role: 'rangedAttacker', count: 1 },
    ],
  },
  systemControlled:
    'The control points at the mouths of Ojuelegba’s routes: gate locks, control boxes and the impound gate',
  exposeObjective:
    'Shut his control points down with blasts; every phase broken brings him to re-lock the point broken last, and one blast there breaks his hold. Three blasts and he falls.',
  objectiveKind: 'controlPoints',
  signatureAbility: {
    name: 'Lockdown',
    description:
      'A live control point calls a warned lockdown along its route. Step off the marked lane before it lands.',
  },
  counterplay:
    'Blast the control points, not him: each one shut reopens a route. Put the lockers down before they re-lock what you broke. When he walks to the point broken last, be there first with a generator.',
  phases: [
    {
      title: 'Locked Out',
      objective: 'Blast two of the three control points.',
      bossBehaviour: 'Watches from the impound and sends his crew to the points you go for.',
      pressure: 'Live points call warned lockdowns along their routes.',
      callout: 'Two control points down. Each one reopens a road.',
    },
    {
      title: 'Re-Lock',
      objective: 'Blast three of four control points while the lockers try to re-lock them.',
      bossBehaviour: 'Sends lockers to every shut point and walks the yard himself.',
      pressure: 'Faster lockdowns; a locker on a shut point re-locks it in six seconds.',
      callout: 'Put the lockers down, then blast three points.',
    },
    {
      title: 'Last Key',
      objective:
        'Shut three tougher control points down (two blasts each), then blast the Landlord a last time.',
      bossBehaviour: 'Calls his whole crew back and guards the last points himself.',
      pressure: 'The fastest lockdowns and lockers; every point takes two separate blasts.',
      callout: 'Two blasts per point. Shut three, then finish him.',
    },
  ],
  introduction: [
    say(
      'NARRATOR',
      'Ojuelegba, night. The lights are back on every street but this one. Across the corner: a steel gate, a chain, and a padlock nobody here agreed to.',
    ),
    landlord(
      'Welcome home, tenant. The roads are mine, the bus stop is mine, the danfo in my impound is mine.',
    ),
    say('MAMA PUT', 'Na our street, no be your property. We go open am ourselves.'),
    say(
      'RADIO',
      'Control points are live at every route into the junction. Blast them down: every one shut reopens a road.',
    ),
    landlord('Every lock you break, my lockers put back. Every road you open, I close again.'),
    unknown('He keeps the last key, small one. Do not expect me to come and collect it.'),
  ],
  defeatSequence: [
    landlord('My locks... Who gave you the right to open my roads?'),
    say('MAMA PUT', 'Nobody gave you the right to close them.'),
    say(
      'RADIO',
      'Every control point at Ojuelegba is down. The corner gate is open. The impound is unlocked.',
    ),
    say(
      'NARRATOR',
      'Drivers, traders and neighbours walk through the open gate together and lift the chain off the impounded danfo themselves.',
    ),
    landlord('Then the junction belongs to nobody.'),
    say('MAMA PUT', 'E belong to everybody. Na so e suppose be.'),
  ],
  reward: {
    id: 'reward.ojuelegba.openRoad',
    kind: 'title',
    name: 'Open Road',
    description:
      'The title "Open Road" and the Curfew replay modifier for the finale. (Provisional reward, FN8.)',
    unlocks: ['title.openRoad', 'modifier.curfew'],
  },
  consequence:
    'Ojuelegba’s routes reopen. The corner gate stands open, the impounded danfo is released, and Mama Put’s stall and the junction are lit again. The Chairman has nothing left to sell.',
  consequenceFlags: ['ojuelegba.routesReopened'],
  replayModifier: {
    id: 'curfew',
    name: 'Curfew',
    description: 'The Landlord re-locks faster: every exposure window is a fifth shorter.',
    bonus: 'Earns the "Curfew" badge for the finale',
  },
};

/** The boss mission's briefing (the hub keeps its own prologue briefing). */
export const FINALE_BRIEFING: DistrictBriefing = {
  title: 'Break the Ring',
  location: 'Ojuelegba: the danfo pocket under the flyover and the repair court behind it',
  summary:
    'The Landlord holds the last control points of the Ring: the locks on every route into the junction and the impound where the danfo stands. Shut his control points down with blasts, put his lockers down, and blast him when he comes to re-lock the one you broke last.',
  objectives: [
    'Shut the control points down with blasts (punches do nothing to them)',
    'Each phase broken exposes the Landlord at the point broken last: one blast there each time, three in all',
    'Put the lockers down before they re-lock a shut point',
  ],
  intel: [
    'Every control point you shut down reopens a route: the yard opens up as you win.',
    'Lockdowns are always warned along a route: step off the marked lane.',
    'A danfo still pulls out of the depot up the departure strip: its lane is warned too.',
  ],
  warnings: [
    'His escort follows him to the point he re-locks: lay your generator before he arrives.',
    'The Landlord is a working title. The fight is real.',
  ],
  brokerMessage: unknown('Ojuelegba was always the last door, small one. I never needed it. He does.'),
  cardSummary:
    'The Landlord holds the last control points of the Ring around the junction. Shut them down with blasts and catch him when he comes to re-lock one.',
  objectiveCard: 'Shut the control points down, then blast the Landlord.',
};

/** Played after Lekki falls, before the chapter (FN9): the old Lekki ending, turned into an interim beat. */
export const INTERIM: StoryLine[] = [
  {
    speaker: 'NARRATOR',
    text: 'Lekki, after midnight. The estates go dark one by one, and for the first time in years the whole island can see the stars over the lagoon.',
  },
  {
    speaker: 'RADIO',
    text: 'All districts: Oshodi dispatch is off the air. Mushin stock is on the ground. The junctions are open. The yard is on its own clock. The ledgers are in the press. The estate grid is dark.',
  },
  say(
    'RADIO',
    'Ojuelegba: the gate across the corner is still chained, the junction is still fenced, and the danfo at the impound has not moved.',
  ),
  say('MAMA PUT', 'Six keepers down, and our own corner is still locked. The Ring kept Ojuelegba for last.'),
  say(
    'MAMA PUT',
    'The estates go dark, but Ojuelegba is still locked. Come home. We finish it where it started.',
  ),
];

const title = (id: string, name: string, description: string): RewardDef => ({
  id: `reward.section.${id}`,
  kind: 'title',
  name,
  description,
});

/** The three sections of the finale (stored like every district's: docs/CAMPAIGN_SECTIONS.md). */
export const FINALE_SECTIONS: SectionDef[] = [
  {
    id: 'ojuelegba.s1',
    districtId: 'ojuelegba',
    order: 1,
    name: 'Return to Ojuelegba',
    summary:
      'The Ring has chained a gate across the corner where the shop lane meets the junction. Trap its patrols, blast the two gate locks and walk through.',
    requires: [],
    missions: [
      {
        id: 'ojuelegba.return',
        format: 'field',
        name: 'Return to Ojuelegba',
        objectiveCard: 'Trap the patrols, blast the gate locks, open the corner.',
        summary:
          'Two Ring patrols walk the shop lane and two lock guards stand at the corner gate. Blast both locks and the gate opens.',
        missionRef: 'ojuelegba.return',
        provisional: true,
        reward: title('ojuelegba.return', 'Corner Regular', 'The shop lane waves you through again.'),
        unlocks: ['section.ojuelegba.s2'],
        ringWeakened: 'The corner gate is open: the shop lane reaches the junction again.',
        intro: [
          say('MAMA PUT', 'Welcome home. See that gate? Two padlocks and a chain, on our own corner.'),
          say('RADIO', 'Ring patrols on the shop lane. Lock guards at the corner. Blasts open locks.'),
        ],
        outro: [say('NARRATOR', 'The chain drops. Shopkeepers drag the gate back and leave it open.')],
      },
    ],
  },
  {
    id: 'ojuelegba.s2',
    districtId: 'ojuelegba',
    order: 2,
    name: 'Hold the Junction',
    summary:
      'Under the flyover the Ring sends its crews to take the bus stop back. Keep it while they come, then wreck the control boxes their lieutenant guards.',
    requires: ['ojuelegba.s1'],
    missions: [
      {
        id: 'ojuelegba.junction',
        format: 'field',
        name: 'Hold the Junction',
        objectiveCard: 'Keep the bus stop, then wreck the three control boxes.',
        summary:
          'Two waves come for the bus stop. Once it is yours, a Ring lieutenant guards the control boxes under the bridge: blast all three.',
        missionRef: 'ojuelegba.junction',
        provisional: true,
        reward: title('ojuelegba.junction', 'Bus Stop Regular', 'The conductors call your stop first.'),
        unlocks: ['section.ojuelegba.s3'],
        ringWeakened:
          'The control boxes under the bridge are wrecked: the Ring can no longer close the junction from its yard.',
        intro: [
          say('MAMA PUT', 'Bayo came. He says he wants to help hold the bus stop.'),
          // Bayo's LOCKED arc (he knowingly helped the Ring and now helps); one provisional line, no new canon
          say('BAYO', 'I helped them lock this junction. Tonight I help you hold it open.'),
        ],
        outro: [say('RADIO', 'The junction is open. The Landlord has gone back to his impound.')],
      },
    ],
  },
  {
    id: 'ojuelegba.s3',
    districtId: 'ojuelegba',
    order: 3,
    name: 'Break the Ring',
    summary:
      'The Landlord keeps the last control points in the danfo pocket and the repair court. Shut them down and break his hold for good.',
    requires: ['ojuelegba.s2'],
    missions: [
      {
        id: 'ojuelegba.boss',
        format: 'boss',
        name: LANDLORD.name,
        objectiveCard: 'Shut his control points down, then blast the Landlord.',
        summary: `${LANDLORD.name}, ${LANDLORD.title}. ${LANDLORD.exposeObjective.split(';')[0]}.`,
        missionRef: 'ojuelegba',
        provisional: true,
        reward: LANDLORD.reward,
        unlocks: LANDLORD.reward.unlocks ?? [],
        ringWeakened:
          'The Landlord’s last control points are down: the Ring holds no gate in Lagos any more.',
      },
    ],
  },
];

export const FINALE_CHAPTER: FinaleChapterContent = {
  boss: LANDLORD,
  briefing: FINALE_BRIEFING,
  interim: INTERIM,
  interimCard: {
    summary:
      'The estates go dark and every district is free, but Ojuelegba’s own corner is still chained. Mama Put calls you home.',
    objective: 'Go home to Ojuelegba',
  },
};
