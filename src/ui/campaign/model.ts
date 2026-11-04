/**
 * Pure helpers behind the campaign screens (unit-tested without React): map nodes, result wording, unlock
 * names, times and colours. Everything is derived from the campaign content and the save; nothing is invented.
 */
import {
  CAMPAIGN,
  DISTRICT_ORDER,
  FACTIONS,
  NPC_ROLE_INFO,
  allReplayModifiers,
  campaignProgress,
  districtStatus,
  finaleAvailable,
} from '../../campaign';
import type { BossDef, CampaignSave, DistrictId, DistrictStatus } from '../../campaign';
import { MISSION_IDS } from '../../sim';
import type { MissionModifierId, MissionOutcome } from '../../sim';
import type { CampaignUi } from '../../app/campaignState';
import { CAMPAIGN_SCREENS } from '../../app/menu';
import type { MenuScreen } from '../../app/menu';

/** 0xRRGGBB -> `#rrggbb` (boss palettes in the content are numbers). */
export const hexCss = (n: number): string => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;

/** Seconds as m:ss. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface MapNode {
  id: DistrictId;
  name: string;
  tagline: string;
  status: DistrictStatus;
  stars: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  hub: boolean;
  /** Landmark names (three recognisable anchors), shown on hover / selection. */
  landmarks: string[];
  /** The previous node in campaign order (the road to it is drawn lit once this one is cleared). */
  after: DistrictId | null;
}

/** The seven map nodes in campaign order, with the save's status and stars. */
export function mapNodes(save: CampaignSave): MapNode[] {
  return DISTRICT_ORDER.map((id, i) => {
    const d = CAMPAIGN.districts[id];
    return {
      id,
      name: d.name,
      tagline: d.tagline,
      status: districtStatus(save, id),
      stars: save.districts[id]?.bestStars ?? 0,
      x: d.mapPos.x,
      y: d.mapPos.y,
      hub: d.boss === null,
      landmarks: d.landmarks.map((l) => l.name),
      after: i > 0 ? DISTRICT_ORDER[i - 1]! : null,
    };
  });
}

/** "Clear Oshodi first" for a locked district; null otherwise. */
export function lockedReason(save: CampaignSave, id: DistrictId): string | null {
  if (districtStatus(save, id) !== 'locked') return null;
  const need = CAMPAIGN.districts[id].requires
    .filter((r) => districtStatus(save, r) !== 'cleared')
    .map((r) => CAMPAIGN.districts[r].name);
  const i = DISTRICT_ORDER.indexOf(id);
  const before = i > 0 ? CAMPAIGN.districts[DISTRICT_ORDER[i - 1]!].name : null;
  return `Clear ${need[0] ?? before ?? 'the earlier districts'} first`;
}

export const statusLabel: Record<DistrictStatus, string> = {
  locked: 'Locked',
  available: 'Open',
  cleared: 'Cleared',
};

/** The position of a mission district in the campaign (1..6), 0 for the hub. */
export const districtNumber = (id: DistrictId): number => DISTRICT_ORDER.indexOf(id);

export function progressText(save: CampaignSave): string {
  const p = campaignProgress(save);
  return `${p.cleared} of ${p.total} districts cleared`;
}

export function totalStars(save: CampaignSave): { got: number; max: number } {
  const missions = DISTRICT_ORDER.filter((d) => d !== 'ojuelegba');
  return {
    got: missions.reduce((n, d) => n + (save.districts[d]?.bestStars ?? 0), 0),
    max: missions.length * 3,
  };
}

export const canPlayFinale = (save: CampaignSave): boolean => finaleAvailable(save);

/** The protection crew as "Orita Park Wardens: 3 Guards, 2 Blockers, 1 Runner". */
export function crewText(boss: BossDef): { faction: string; roles: string } {
  const faction = FACTIONS[boss.protectionCrew.factionId]?.name ?? boss.protectionCrew.factionId;
  const roles = boss.protectionCrew.roles
    .map((r) => {
      const name = NPC_ROLE_INFO[r.role].name;
      return `${r.count} ${name}${r.count === 1 ? '' : 's'}`;
    })
    .join(', ');
  return { faction, roles };
}

/** Replay modifier names the save can use right now, by district. */
export function modifierName(id: MissionModifierId): string {
  return allReplayModifiers().find((m) => m.id === id)?.name ?? id;
}

const words = (id: string): string =>
  id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

/** A readable name for an unlock id (`district.mushin`, `modifier.rushHourDispatch`, `costume.x.y` ...). */
export function unlockLabel(id: string): string {
  const [kind, ...rest] = id.split('.');
  const tail = rest[rest.length - 1] ?? id;
  switch (kind) {
    case 'district': {
      const d = CAMPAIGN.districts[tail as DistrictId];
      return d ? `District opened: ${d.name}` : words(id);
    }
    case 'modifier':
      return `Replay modifier: ${modifierName(tail as MissionModifierId)}`;
    case 'finale':
      return 'The finale scene is unlocked';
    case 'costume':
      return `Costume: ${words(tail)}`;
    case 'title':
      return `Title: ${words(tail)}`;
    case 'perk':
      return `Perk: ${words(tail)}`;
    default:
      return words(id);
  }
}

/** Why a mission was not won, in plain words. */
export function failureText(o: MissionOutcome): string {
  const phase = Math.min(3, o.phasesCleared + 1);
  if (o.result === 'timeout')
    return `Time ran out in phase ${phase} of 3. The district keeps its hold, so go again with a plan.`;
  return `You were put down for the last time in phase ${phase} of 3 (${o.livesUsed} ${o.livesUsed === 1 ? 'life' : 'lives'} spent).`;
}

/** A hint for the next try: the phase's call-out plus the boss's counterplay. */
export function retryHint(boss: BossDef, o: MissionOutcome): { phase: string; counterplay: string } {
  const p = boss.phases[Math.min(2, Math.max(0, o.phasesCleared))]!;
  return { phase: `${p.title}: ${p.objective}`, counterplay: boss.counterplay };
}

/** The victory headline. */
export function victoryTitle(boss: BossDef, o: MissionOutcome): string {
  return o.defeat === 'ousted' ? `${boss.name} is out` : `${boss.name} is down`;
}

export const starsText = (n: number): string => `${n} of 3 stars`;

/** Does a campaign screen have the data it needs? (Other screens are always fine.) */
export function campaignScreenReady(screen: MenuScreen, ui: CampaignUi | null): boolean {
  if (!CAMPAIGN_SCREENS.includes(screen)) return true;
  if (!ui) return false;
  if (screen === 'briefing' || screen === 'bossIntro')
    return (MISSION_IDS as readonly string[]).includes(ui.selected);
  if (screen === 'campaignResult') return ui.result !== null;
  return true;
}
