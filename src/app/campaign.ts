/**
 * Campaign controller (docs/CAMPAIGN_UI.md): holds the CampaignSave in the UI store (`UiState.campaign`), loads
 * it on startup, persists after every change and drives the campaign flow (map -> briefing -> boss introduction ->
 * mission -> result -> next district / retry / finale). It never calls a network, never touches `settings` (the
 * menu setup) and never writes the normal MatchSummary: a mission has its own result screen.
 *
 * Dependencies are injected so the whole flow runs headless in tests: a `KeyValueStore` (a Map in tests,
 * `browserStore()` in the app), the mission host (the MatchController), the mission-game builder and clocks.
 */
import {
  CAMPAIGN_SAVE_KEY,
  applyMissionResult,
  availableModifiers,
  clearSave,
  completeCampaign,
  createSave,
  districtStatus,
  finaleAvailable,
  loadSave,
  markIntroSeen,
  markPrologueSeen,
  nextDistrict,
  persistSave,
  setLoadout,
} from '../campaign';
import type { CampaignSave, DistrictId, KeyValueStore } from '../campaign';
import { MISSION_IDS, buildMissionGame } from '../sim';
import type {
  CharacterId,
  Difficulty,
  GameOptions,
  GameState,
  MissionId,
  MissionModifierId,
  MissionOutcome,
  MissionSpec,
} from '../sim';
import { defaultDistrict, freshCampaignUi } from './campaignState';
import type { CampaignUi, RewardSummary } from './campaignState';
import { menuAt, openScreen, replaceScreen } from './menu';
import type { MenuScreen } from './menu';
import type { MissionHost } from './ports';
import { patch, useGameStore } from './store';

/** Human lives in a mission (the sim's default; shown in the briefing). */
export const MISSION_LIVES = 3;

export interface CampaignDeps {
  /** localStorage or a Map-backed store; null = storage is unavailable (progress stays in memory). */
  store: KeyValueStore | null;
  host: MissionHost;
  /** Clock for save timestamps (the sim never sees it). */
  now(): number;
  /** Seed for the next mission match. */
  seed(): number;
  /** The mission-game builder (the sim's `buildMissionGame`; tests inject a fake while the runtime is missing). */
  buildMission?(args: { spec: MissionSpec; humanCharacter: CharacterId; seed: number }): GameOptions;
  /** The fighter a brand-new campaign starts with (the menu's current pick); read only. */
  startingFighter?(): CharacterId;
}

export const isMissionId = (id: string): id is MissionId => (MISSION_IDS as readonly string[]).includes(id);

/**
 * The outcome of a mission match that ended without the sim reporting one (a plain win or loss of the match): used
 * only as a safety net so the campaign never gets stuck on a finished match.
 */
export function outcomeFromMatch(
  state: GameState,
  missionId: MissionId,
  modifiers: MissionModifierId[],
): MissionOutcome {
  const r = state.match.result;
  const won = r?.kind === 'win' && r.winnerId === 0;
  return {
    result: won ? 'won' : 'lost',
    missionId,
    modifiers,
    seconds: Math.round(state.match.playTicks / 60),
    livesUsed: 0,
    phasesCleared: won ? 3 : 0,
    defeat: won ? 'eliminated' : null,
    stars: won ? 1 : 0,
    creditedKills: state.players[0]?.stats.kills ?? 0,
  };
}

export class CampaignController {
  constructor(private readonly deps: CampaignDeps) {}

  // ------------------------------------------------------------------ state access

  /** The campaign slice of the store (null before `load`). */
  get ui(): CampaignUi | null {
    return useGameStore.getState().campaign;
  }

  private need(): CampaignUi {
    return this.ui ?? this.load();
  }

  private update(p: Partial<CampaignUi>): CampaignUi {
    const next = { ...this.need(), ...p };
    patch({ campaign: next });
    return next;
  }

  private setMenu(path: readonly MenuScreen[]): void {
    patch({ menu: menuAt(path), pauseSettings: false });
  }

  // ------------------------------------------------------------------ load / persist

  /** Loads the save (startup). Corrupt or unavailable storage gives a fresh in-memory save and a notice. */
  load(): CampaignUi {
    const { store } = this.deps;
    let save: CampaignSave | null = null;
    let notice: string | null = null;
    if (store) {
      save = loadSave(store);
      if (!save && this.hasStoredText(store))
        notice =
          'Your saved campaign could not be read, so a fresh one is ready. A copy of the old file was kept in this browser.';
    } else {
      notice =
        'This browser is not letting WAHALA! save progress (private mode?). The campaign works, but it is forgotten when you close the page.';
    }
    const ui = freshCampaignUi(save ?? createSave(this.deps.now()), {
      started: save !== null,
      storage: store ? 'ok' : 'unavailable',
      notice,
    });
    patch({ campaign: ui });
    return ui;
  }

  private hasStoredText(store: KeyValueStore): boolean {
    try {
      const text = store.getItem(CAMPAIGN_SAVE_KEY);
      return typeof text === 'string' && text !== '';
    } catch {
      return false;
    }
  }

  /** Saves `save` into the store and the UI. Storage trouble becomes a notice, never an exception. */
  private commit(save: CampaignSave, p: Partial<CampaignUi> = {}): CampaignUi {
    const ui = this.need();
    let storage = ui.storage;
    let notice = p.notice !== undefined ? p.notice : ui.notice;
    if (this.deps.store) {
      if (persistSave(this.deps.store, save)) storage = 'ok';
      else {
        storage = 'unavailable';
        notice = 'Progress could not be saved (the browser refused). It is kept until you close the page.';
      }
    }
    return this.update({ ...p, save, started: true, storage, notice });
  }

  dismissNotice(): void {
    this.update({ notice: null });
  }

  // ------------------------------------------------------------------ map and story

  /** Opens the campaign map (Home -> Campaign). */
  open(): void {
    this.need();
    patch({ menu: openScreen(useGameStore.getState().menu, 'campaign') });
  }

  /** Starts a brand-new campaign (the UI asks first when one exists), then plays the prologue. */
  startNew(): void {
    const save = createSave(this.deps.now());
    const fighter = this.deps.startingFighter?.();
    const fresh = fighter ? setLoadout(save, { character: fighter }, save.startedAt) : save;
    this.commit(fresh, {
      selected: defaultDistrict(fresh),
      modifier: null,
      result: null,
      lastReward: null,
      active: null,
      story: 'prologue',
      notice: null,
    });
    this.setMenu(['campaign', 'campaignStory']);
  }

  /** Delete save: forgets the progress and shows the empty map. */
  deleteSave(): void {
    if (this.deps.store) clearSave(this.deps.store);
    const save = createSave(this.deps.now());
    patch({
      campaign: freshCampaignUi(save, { storage: this.ui?.storage ?? 'ok', notice: 'Save deleted.' }),
    });
    this.setMenu(['campaign']);
  }

  /** Replays the prologue (or the finale) from the map without changing progress. */
  playStory(kind: 'prologue' | 'finale'): void {
    const ui = this.need();
    if (kind === 'finale' && !finaleAvailable(ui.save)) return;
    this.update({ story: kind });
    this.setMenu(['campaign', 'campaignStory']);
  }

  /** The story player reached its end (or was skipped). */
  storyDone(): void {
    const ui = this.need();
    if (ui.story === 'prologue') {
      const save = markPrologueSeen(ui.save, this.deps.now());
      if (save !== ui.save) this.commit(save);
      this.setMenu(['campaign']);
      return;
    }
    const save = completeCampaign(ui.save, this.deps.now());
    if (save !== ui.save) this.commit(save);
    patch({ menu: replaceScreen(useGameStore.getState().menu, 'campaignComplete') });
  }

  selectDistrict(id: DistrictId): void {
    const ui = this.need();
    if (!ui.save.districts[id] || ui.selected === id) return;
    this.update({ selected: id, modifier: null });
  }

  /** Map: the selected district's Continue / Open briefing. Locked districts and the hub have none. */
  beginBriefing(id: DistrictId = this.need().selected, modifier: MissionModifierId | null = null): void {
    const ui = this.need();
    if (!isMissionId(id) || districtStatus(ui.save, id) === 'locked') {
      this.selectDistrict(id);
      return;
    }
    const allowed = modifier && availableModifiers(ui.save, id).includes(modifier) ? modifier : null;
    this.update({ selected: id, modifier: allowed, notice: null });
    this.setMenu(['campaign', 'briefing']);
  }

  /** Continue: the first mission that is not cleared yet (or the finale / ending when all are). */
  continue(): void {
    const ui = this.need();
    if (finaleAvailable(ui.save)) {
      if (ui.save.completed) this.setMenu(['campaign', 'campaignComplete']);
      else this.playStory('finale');
      return;
    }
    this.beginBriefing(defaultDistrict(ui.save));
  }

  // ------------------------------------------------------------------ briefing

  setModifier(modifier: MissionModifierId | null): void {
    const ui = this.need();
    if (
      modifier !== null &&
      (!isMissionId(ui.selected) || !availableModifiers(ui.save, ui.selected).includes(modifier))
    )
      return;
    this.update({ modifier });
  }

  setLoadout(loadout: { character?: CharacterId; difficulty?: Difficulty }): void {
    const ui = this.need();
    const save = setLoadout(ui.save, loadout, this.deps.now());
    if (save !== ui.save) this.commit(save);
  }

  /** Briefing's main button: the boss introduction the first time, then straight into the mission. */
  startFromBriefing(): void {
    const ui = this.need();
    if (!isMissionId(ui.selected)) return;
    if (ui.save.districts[ui.selected]?.introSeen) {
      this.startMission(ui.selected, ui.modifier);
      return;
    }
    patch({ menu: openScreen(useGameStore.getState().menu, 'bossIntro') });
  }

  /** The boss introduction ended (or was skipped): remember it and start the mission. */
  bossIntroDone(): void {
    const ui = this.need();
    if (!isMissionId(ui.selected)) return;
    const save = markIntroSeen(ui.save, ui.selected, this.deps.now());
    if (save !== ui.save) this.commit(save);
    this.startMission(ui.selected, ui.modifier);
  }

  // ------------------------------------------------------------------ mission

  /** Builds the mission game and starts it. False (with a notice) when it cannot start. */
  startMission(id: DistrictId, modifier: MissionModifierId | null = null): boolean {
    const ui = this.need();
    if (!isMissionId(id) || districtStatus(ui.save, id) === 'locked') return false;
    const modifiers = modifier && availableModifiers(ui.save, id).includes(modifier) ? [modifier] : [];
    const build = this.deps.buildMission ?? buildMissionGame;
    try {
      const options = build({
        spec: { id, modifiers, difficulty: ui.save.difficulty, lives: MISSION_LIVES },
        humanCharacter: ui.save.character,
        seed: this.deps.seed(),
      });
      this.update({
        active: { missionId: id, modifiers },
        selected: id,
        modifier,
        result: null,
        notice: null,
      });
      this.deps.host.startMission(options, {
        missionId: id,
        difficulty: ui.save.difficulty,
        onEnd: (outcome, state) => this.finishMission(outcome ?? outcomeFromMatch(state, id, modifiers)),
      });
      return true;
    } catch (error) {
      this.update({
        active: null,
        notice: `This mission could not start (${error instanceof Error ? error.message : 'unknown error'}).`,
      });
      return false;
    }
  }

  /**
   * A mission ended: applies it to the save, persists, leaves the match and shows the result screen. Public so
   * tests (and the match end hook) can finish a mission with an outcome.
   */
  finishMission(outcome: MissionOutcome): void {
    const ui = this.need();
    const summary = applyMissionResult(ui.save, outcome, this.deps.now());
    const reward: RewardSummary = {
      rewards: summary.newRewards,
      unlocks: summary.newUnlocks,
      unlockedDistricts: summary.unlockedDistricts,
      firstClear: summary.firstClear,
      campaignComplete: summary.campaignComplete,
    };
    const paid = reward.rewards.length + reward.unlocks.length + reward.unlockedDistricts.length > 0;
    this.deps.host.stop();
    this.commit(summary.save, {
      active: null,
      selected: isMissionId(outcome.missionId) ? outcome.missionId : ui.selected,
      modifier: null,
      result: { outcome, reward },
      lastReward: paid ? reward : ui.lastReward,
    });
    this.setMenu(['campaign', 'campaignResult']);
  }

  /** Retry the mission just played (result screen or the pause menu): same modifiers, a fresh seed. */
  retry(): void {
    const ui = this.need();
    const id = ui.active?.missionId ?? ui.result?.outcome.missionId ?? ui.selected;
    const modifiers = ui.active?.modifiers ?? ui.result?.outcome.modifiers ?? [];
    this.deps.host.stop();
    this.startMission(id, modifiers[0] ?? null);
  }

  /** Back to the campaign map from the pause menu or a result: the save is kept as it is. */
  toMap(): void {
    if (this.ui?.active) this.deps.host.stop();
    this.setMenu(['campaign']); // first: a result screen must never show without its result
    this.update({ active: null, result: null });
  }

  /** Result screen: the next district's briefing (the one this win opened, or the next in order). */
  nextDistrict(): void {
    const ui = this.need();
    const done = ui.result?.outcome.missionId ?? ui.selected;
    const next = ui.result?.reward.unlockedDistricts[0] ?? nextDistrict(done);
    if (next && isMissionId(next) && districtStatus(ui.save, next) !== 'locked') this.beginBriefing(next);
    else this.setMenu(['campaign']);
    this.update({ result: null });
  }

  /** The match was left some other way (Main menu): drop the running-mission marker. */
  leave(): void {
    if (this.ui?.active) this.update({ active: null });
  }
}
