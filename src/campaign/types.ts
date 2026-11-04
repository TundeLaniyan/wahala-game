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
  CharacterId,
  MissionId,
  MissionModifierId,
  MissionOutcome,
  NpcRole,
  ObjectiveKind,
  Difficulty,
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
  /** Fictional name and title ("Oga Dispatch", "The Controller of Interchange"). */
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
  /** What winning changes in the campaign world (map changes, broker reaction, next district opens). */
  consequence: string;
  replayModifier: ReplayModifierDef;
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
}

export interface LandmarkAnchor {
  id: string;
  name: string;
  note: string;
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
  /** Districts that must be cleared first. */
  requires: DistrictId[];
  /** Factions met here. */
  factionIds: string[];
}

export interface CampaignContent {
  districts: Record<DistrictId, DistrictContent>;
  factions: Record<string, FactionDef>;
  prologue: StoryLine[];
  /** Played after all six districts are cleared: the empire collapses, the central broker escapes unseen. */
  finale: StoryLine[];
  ending: { title: string; summary: string; teaser: string };
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

export interface CampaignSave {
  version: 1;
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
