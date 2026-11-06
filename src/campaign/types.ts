/**
 * CONTRACT (campaign content, progress and save data). Written by the integrator; the `campaign-content`
 * worker owns `src/campaign/**` and may extend these types with OPTIONAL fields, but must not rename or remove
 * anything `src/ui/campaign` and `src/app/campaign*` import. Pure data + pure functions: no DOM, no React, no
 * Three. Storage goes through the `KeyValueStore` port (browser localStorage in the app, a Map in tests).
 *
 * Ethics (binding): every name, organisation and biography is FICTIONAL. The six bosses are inspired by the
 * cultural texture of real places (transport unions, markets, rail yards ...) and never depict real people or
 * agencies as criminals. The central power broker ("the Chairman" / see content) is inspired by a public image
 * only: never a real person's name, face, voice, exact biography or branding; he is NEVER shown, only heard
 * about (messages, silhouettes, phone calls) and he escapes at the end.
 */
import type {
  CampaignLevel,
  CharacterId,
  MissionId,
  MissionModifierId,
  MissionOutcome,
  NpcRole,
  ObjectiveKind,
  Difficulty,
  RaidId,
} from '../sim';

export type DistrictId = 'ojuelegba' | MissionId;

/** Campaign order. Ojuelegba is the hub / prologue; the six bosses follow in `MISSION_IDS` order; then the finale. */
export const DISTRICT_ORDER: readonly DistrictId[] = [
  'ojuelegba',
  'oshodi',
  'mushin',
  'fadeyiSomolu',
  'ebuteMetta',
  'lagosIsland',
  'lekki',
];

export type FactionKind =
  | 'transportEnforcers' // agbero-style
  | 'routeMarshals'
  | 'marketCrew'
  | 'logisticsCrew'
  | 'securityContractors'
  | 'railDispatch'
  | 'communityDefenders'
  | 'officials'; // fictional officials / infrastructure operators

export interface FactionDef {
  id: string;
  kind: FactionKind;
  /** Fictional name, e.g. "Eko Dispatch Collective". Never a real union, agency or company. */
  name: string;
  description: string;
  /** Hex colours (0xRRGGBB) and a short emblem description for the visual identity. */
  palette: { primary: number; accent: number };
  emblem: string;
  /** NPC roles this faction fields, with typical counts per fight. */
  roles: { role: NpcRole; count: number }[];
  /** Friendly to the player (community defenders can lend support)? */
  allied?: boolean;
}

/**
 * Optional hand-written card copy (docs/CAMPAIGN_TEXT_NARRATION.md). When absent, `src/campaign/cards.ts` derives
 * the summary (the first one or two sentences) and the objective line from the long text; nothing is removed
 * either way: the long text goes into the card's Read more.
 */
export interface CardCopy {
  /** One or two sentences (see `CARD_LIMITS`). */
  summary?: string;
  /** A short objective line, at most `CARD_LIMITS.objectiveWords` words. */
  objective?: string;
}

export interface StoryLine {
  /** Speaker label: a fictional name, "UNKNOWN NUMBER", "RADIO", "NARRATOR" ... */
  speaker: string;
  text: string;
  /** The central power broker speaking through a message (never shown on screen). */
  fromBroker?: boolean;
}

export interface RewardDef {
  id: string;
  kind: 'cosmetic' | 'title' | 'perk' | 'unlock' | 'currency';
  name: string;
  description: string;
  /** What it unlocks, by id, when relevant (a fighter costume, a replay modifier, the next district ...). */
  unlocks?: string[];
}

export interface ReplayModifierDef {
  id: MissionModifierId;
  name: string;
  description: string;
  /** Extra campaign currency / stars it is worth on a clear. */
  bonus: string;
}

export interface BossPhaseText {
  title: string;
  /** What the player must do in this phase (matches the sim phase of the district's objective). */
  objective: string;
  bossBehaviour: string;
  pressure: string;
  callout: string;
}

export interface BossDef {
  id: string;
  districtId: MissionId;
  /** Fictional name and title ("Oga Sunmola", "Park Master of the Interchange"). */
  name: string;
  title: string;
  /** The real cultural texture that inspired the boss (never a real person). */
  culturalInspiration: string;
  areaConnection: string;
  /** The model / look: which existing fighter rig it borrows and the costume direction. */
  visualDirection: {
    characterId: CharacterId;
    description: string;
    palette: { primary: number; accent: number };
    /** Art / animation still required (documented, not blocking). */
    artNeeds: string;
  };
  personality: string;
  protectionCrew: { factionId: string; roles: { role: NpcRole; count: number }[] };
  /** The network or system the boss controls ("the dispatch radio net"). */
  systemControlled: string;
  /** What must be done to expose the boss. */
  exposeObjective: string;
  objectiveKind: ObjectiveKind;
  signatureAbility: { name: string; description: string };
  counterplay: string;
  phases: [BossPhaseText, BossPhaseText, BossPhaseText];
  introduction: StoryLine[];
  /** Played when the mission is won (the empire-collapse beat for this district). */
  defeatSequence: StoryLine[];
  reward: RewardDef;
  /** Optional: a short nickname the crew uses ("Oga Mic"). */
  nickname?: string;
  /** Optional presentation: who walks with the boss (shown under Read more, drawn in the boss-intro panel). */
  entourage?: string;
  /** Optional presentation: how the boss arrives (the first thing the crowd sees or hears). */
  entrance?: string;
  /** Optional: played instead of `defeatSequence` when the sim reports `defeat: 'ousted'` (the boss flees / is removed). */
  defeatSequenceOusted?: StoryLine[];
  /** Optional: story flags set on the first clear (`CampaignSave.flags`), e.g. "oshodi.dispatchBroken". */
  consequenceFlags?: string[];
  /** What winning changes in the campaign world (map changes, broker reaction, next district opens). */
  consequence: string;
  replayModifier: ReplayModifierDef;
  /** Optional short card copy for the boss introduction, the defeat scene and the ousted defeat scene (cards.ts). */
  introCard?: CardCopy;
  defeatCard?: CardCopy;
  defeatOustedCard?: CardCopy;
}

export interface DistrictBriefing {
  title: string;
  location: string;
  summary: string;
  objectives: string[];
  intel: string[];
  warnings: string[];
  /** A message from the unseen central broker, if this district has one. */
  brokerMessage?: StoryLine;
  /** Optional short card copy; absent = derived from `summary` / `objectives` (cards.ts). */
  cardSummary?: string;
  objectiveCard?: string;
}

export interface LandmarkAnchor {
  id: string;
  name: string;
  note: string;
}

/**
 * A non-combat local figure of a district that has no boss (the Ojuelegba hub). Presentation only: it changes no
 * progression, mission or save, and may become a boss later if the founder decides so.
 */
export interface LocalFigureDef {
  id: string;
  name: string;
  nickname: string;
  title: string;
  /** The cultural texture behind the figure (never a real person). */
  culturalInspiration: string;
  look: { characterId: CharacterId; description: string; palette: { primary: number; accent: number } };
  entourage: string;
  entrance: string;
  personality: string;
  /** The introduction scene (kept as data for the story panels and a possible future boss). */
  introduction: StoryLine[];
}

export interface DistrictContent {
  id: DistrictId;
  name: string;
  tagline: string;
  /** Position on the campaign map in 0..100 units (x right, y down). */
  mapPos: { x: number; y: number };
  /** The arena the mission is played on (from the sim mission data; the hub shows the Ojuelegba stage). */
  arenaId: string;
  briefing: DistrictBriefing;
  /** Three recognisable visual anchors (map identity). */
  landmarks: [LandmarkAnchor, LandmarkAnchor, LandmarkAnchor];
  boss: BossDef | null;
  /** Optional non-combat local figure (the Ojuelegba hub); changes nothing in progression. */
  figure?: LocalFigureDef;
  /** Districts that must be cleared first. */
  requires: DistrictId[];
  /** Factions met here. */
  factionIds: string[];
}

/** The unseen central power broker (fiction notes live in docs/CAMPAIGN_STORY.md). NEVER shown on screen. */
export interface BrokerDef {
  /** Fictional name and title. */
  name: string;
  title: string;
  biography: string;
  /** How the player perceives him: voice on a phone, signage, a silhouette. Never a face or a model. */
  presence: string[];
  /** Hard rules for every consumer (UI, art, audio). */
  neverShown: true;
}

// ---------------------------------------------------------------- sections (docs/CAMPAIGN_SECTIONS.md)

/** field = a large scrolling district mission; raid = a compact classic raid; boss = the district's boss mission. */
export type SectionMissionFormat = 'field' | 'raid' | 'boss';

/** A door of a field mission that opens a raid (the field mission definition in the sim holds the tiles). */
export interface SectionDoorRef {
  doorId: string;
  raidId: RaidId;
}

export interface SectionMissionDef {
  /** Unique over the campaign ("oshodi.approach", "oshodi.boss"). A field mission's id is its field spec id. */
  id: string;
  format: SectionMissionFormat;
  name: string;
  /** The short objective card (at most 12 words). */
  objectiveCard: string;
  /** One or two sentences. */
  summary: string;
  /** field: the `FIELD_MISSION_DEFS` id; raid: a `RaidId`; boss: the district (`MissionId`). */
  missionRef: string;
  /** The doors of a field mission (each opens one raid). */
  doors?: SectionDoorRef[];
  /** Paid once, on the first clear. The boss mission's reward is the district boss reward. */
  reward: RewardDef | null;
  /** What clearing it opens, by id (`section.oshodi.s2`, the boss reward unlocks ...): informational and tested. */
  unlocks: string[];
  /** Optional longer text for the "Read more" card and the story scenes. */
  readMore?: string;
  intro?: StoryLine[];
  outro?: StoryLine[];
}

export interface SectionDef {
  /** "oshodi.s1" ... "oshodi.s3". */
  id: string;
  districtId: MissionId;
  /** 1, 2 or 3; the third is always the boss section. */
  order: 1 | 2 | 3;
  name: string;
  /** One or two sentences. */
  summary: string;
  /** Section ids that must be cleared first (the district itself must be open too). */
  requires: string[];
  /** In play order; every mission is required (a section is cleared when all of them are). */
  missions: SectionMissionDef[];
}

export interface CampaignContent {
  broker?: BrokerDef;
  districts: Record<DistrictId, DistrictContent>;
  /** The three sections of every mission district, in order. */
  sections: Record<MissionId, SectionDef[]>;
  factions: Record<string, FactionDef>;
  prologue: StoryLine[];
  /** Played after all six districts are cleared: the empire collapses, the central broker escapes unseen. */
  finale: StoryLine[];
  ending: { title: string; summary: string; teaser: string };
  /** Optional short card copy for the prologue, the finale and the ending (cards.ts). */
  prologueCard?: CardCopy;
  finaleCard?: CardCopy;
  endingCard?: CardCopy;
}

// ---------------------------------------------------------------- progress / save

export type DistrictStatus = 'locked' | 'available' | 'cleared';

export interface DistrictProgress {
  status: DistrictStatus;
  attempts: number;
  clears: number;
  bestStars: 0 | 1 | 2 | 3;
  bestSeconds: number | null;
  /** The boss introduction was watched (it can be skipped afterwards). */
  introSeen: boolean;
  /** Replay modifiers beaten here (modifier ids). */
  modifiersCleared: MissionModifierId[];
}

export type SectionStatus = 'locked' | 'available' | 'cleared';

/** One field or raid mission of a section. Only `cleared` is authoritative (`available` is derived from the save). */
export interface MissionProgress {
  status: SectionStatus;
  attempts: number;
  clears: number;
  bestStars: 0 | 1 | 2 | 3;
  bestSeconds: number | null;
}

export interface SectionProgress {
  status: SectionStatus;
  attempts: number;
  clears: number;
  /** The lowest best-stars among the section's missions once it is cleared (0 before). */
  bestStars: 0 | 1 | 2 | 3;
}

export interface CampaignSave {
  /** 2 = sections added (docs/CAMPAIGN_SECTIONS.md); a version-1 save is migrated on load (save.ts). */
  version: 2;
  /** The local save slot this is (one slot; room for more later). */
  startedAt: number;
  updatedAt: number;
  prologueSeen: boolean;
  districts: Record<DistrictId, DistrictProgress>;
  /** Reward ids earned (campaign rewards, cosmetic unlocks). */
  rewards: string[];
  /** Unlock ids (fighters, costumes, replay modifiers, titles). */
  unlocks: string[];
  /** The finale was watched: the campaign is complete (replay modifiers stay available). */
  completed: boolean;
  /** Story flags set by consequences ("oshodi.dispatchBroken" ...). */
  flags: string[];
  /** Chosen fighter and level for the next mission. */
  character: CharacterId;
  difficulty: Difficulty;
  /**
   * Campaign difficulty (Easy / Normal / Hard, docs/CAMPAIGN_DIFFICULTY.md): how forgiving the health and recovery are.
   * A save without it (made before the levels existed) loads as Normal. Not the crew level above.
   */
  campaignLevel: CampaignLevel;
  /** Per-section status (all 18 sections), keyed by section id. */
  sections: Record<string, SectionProgress>;
  /** Per-mission progress of the field and raid missions (the boss missions live in `districts`), keyed by mission id. */
  missions: Record<string, MissionProgress>;
  /** Section mission reward ids earned (kept apart from the boss `rewards`). */
  sectionRewards: string[];
}

/** What a finished mission hands the campaign (built from the sim's MissionOutcome). */
export interface MissionResultInput {
  outcome: MissionOutcome;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const CAMPAIGN_SAVE_KEY = 'wahala.campaign.v1';
