/** Public API of the campaign layer (pure content, progress and save logic). UI and app code import from here. */
export * from './types';
export {
  BROKER,
  CAMPAIGN,
  ENDING,
  FACTIONS,
  FACTION_IDS,
  FINALE,
  FINALE_UNLOCK,
  MODIFIER_IDS,
  NPC_ROLE_INFO,
  PROLOGUE,
  allFlags,
  allReplayModifiers,
  allRewardIds,
  allRewards,
  allUnlockIds,
  bossFor,
  bossList,
  defeatLines,
  districtList,
  nextDistrict,
  replayModifierFor,
  unlockIdsOfKind,
} from './content';
export {
  applyMissionResult,
  availableModifiers,
  campaignProgress,
  completeCampaign,
  createSave,
  districtStatus,
  finaleAvailable,
  isUnlockedFighterContent,
  markIntroSeen,
  markPrologueSeen,
  setLoadout,
} from './progress';
export type { MissionResultSummary } from './progress';
export { browserStore, clearSave, loadSave, migrateSave, persistSave, repairSave } from './save';
