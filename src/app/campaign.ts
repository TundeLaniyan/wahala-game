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
  CAMPAIGN,
  CAMPAIGN_SAVE_KEY,
  applyMissionResult,
  applyRaidResult,
  applySectionResult,
  availableModifiers,
  bossAvailable,
  canPlayMission,
  clearSave,
  completeCampaign,
  createSave,
  districtStatus,
  finaleAvailable,
  getSectionMission,
  loadSave,
  markIntroSeen,
  markPrologueSeen,
  missionByRef,
  nextDistrict,
  nextMission,
  persistSave,
  sectionOfMission,
  setCampaignLevel,
  setLoadout,
} from '../campaign';
import type { CampaignSave, DistrictId, KeyValueStore, SectionMissionDef } from '../campaign';
import {
  DEFAULT_CAMPAIGN_LEVEL,
  MISSION_IDS,
  buildMissionGame,
  campaignEnemyLevel,
  resolveRaid,
} from '../sim';
import { buildRaidGame } from '../sim/raid/build';
import type {
  CampaignLevel,
  CharacterId,
  Difficulty,
  GameOptions,
  GameState,
  MissionId,
  MissionModifierId,
  MissionOutcome,
  MissionSpec,
  RaidId,
  RaidOutcome,
  RaidRequest,
  SimEvent,
} from '../sim';
import { defaultDistrict, freshCampaignUi } from './campaignState';
import type { CampaignUi, RewardSummary } from './campaignState';
import { raidAbandoned } from './raidOutcome';
import { currentScreen, menuAt, openScreen, replaceScreen } from './menu';
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
  buildMission?(args: {
    spec: MissionSpec;
    humanCharacter: CharacterId;
    seed: number;
    level?: CampaignLevel;
  }): GameOptions;
  /** The fighter a brand-new campaign starts with (the menu's current pick); read only. */
  startingFighter?(): CharacterId;
  /** The raid-game builder (raid-sim's `buildRaidGame`; tests inject a fake). */
  buildRaid?(args: {
    raidId: RaidId;
    humanCharacter: CharacterId;
    seed: number;
    hp?: number;
    lives?: number;
    difficulty?: Difficulty;
    level?: CampaignLevel;
  }): GameOptions;
}

/** The raid in play: the door request it answers (null: a standalone section raid) and the section mission it belongs to. */
interface RaidContext {
  request: RaidRequest | null;
  raidId: RaidId;
  missionId: string | null;
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

/** A short HUD line when a raid hands the player back to the field map. */
export function raidNotice(outcome: RaidOutcome): string {
  if (outcome.result === 'completed') return 'RAID DONE: BACK ON THE MAP';
  if (outcome.result === 'failed') return 'RAID FAILED: THE DOOR IS OPEN, TRY AGAIN';
  return 'LEFT THE RAID: THE DOOR IS OPEN';
}

/** A section field mission that ended without the sim reporting an outcome (the same safety net as the boss missions'). */
export function sectionOutcomeFromMatch(
  state: GameState,
  def: SectionMissionDef,
  districtId: MissionId,
): MissionOutcome {
  return {
    ...outcomeFromMatch(state, districtId, []),
    sectionMissionId: def.missionRef,
    phasesCleared: 0,
    defeat: null,
  };
}

export class CampaignController {
  /** The raid being played (door or standalone); null outside raids. */
  private raidCtx: RaidContext | null = null;

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

  /** Opens the campaign map (Home -> Campaign), on the district of the next available section. */
  open(): void {
    const ui = this.need();
    const next = nextMission(ui.save);
    if (next && next.districtId !== ui.selected) this.update({ selected: next.districtId });
    patch({ menu: openScreen(useGameStore.getState().menu, 'campaign') });
  }

  /** Starts a brand-new campaign (the UI asks first when one exists), then plays the prologue. */
  startNew(level: CampaignLevel = DEFAULT_CAMPAIGN_LEVEL): void {
    const save = setCampaignLevel(createSave(this.deps.now()), level, this.deps.now());
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
    if (!bossAvailable(ui.save, id)) {
      // the boss is playable only after the district's earlier sections are cleared
      this.update({
        selected: id,
        notice: `Clear the earlier sections of ${CAMPAIGN.districts[id].name} first.`,
      });
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
    const next = nextMission(ui.save);
    const def = next ? getSectionMission(next.missionId) : undefined;
    if (next && def && def.format !== 'boss') {
      this.update({ selected: next.districtId });
      this.startSectionMission(def.id);
      return;
    }
    this.beginBriefing(next?.districtId ?? defaultDistrict(ui.save));
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

  /**
   * Changes the campaign difficulty. Only between missions (map, briefing, section list): a live mission, a raid or
   * the result screen of one never changes level, so a run is always played at the level it started at.
   */
  setLevel(level: CampaignLevel): boolean {
    const ui = this.need();
    if (ui.active) {
      this.update({ notice: 'Difficulty can be changed from the campaign map, not during a mission.' });
      return false;
    }
    const save = setCampaignLevel(ui.save, level, this.deps.now());
    if (save !== ui.save) this.commit(save);
    return true;
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
    if (!bossAvailable(ui.save, id)) {
      this.update({ notice: `Clear the earlier sections of ${CAMPAIGN.districts[id].name} first.` });
      return false;
    }
    const modifiers = modifier && availableModifiers(ui.save, id).includes(modifier) ? [modifier] : [];
    const build = this.deps.buildMission ?? buildMissionGame;
    try {
      const options = build({
        spec: { id, modifiers, difficulty: ui.save.difficulty, lives: MISSION_LIVES },
        humanCharacter: ui.save.character,
        seed: this.deps.seed(),
        level: ui.save.campaignLevel,
      });
      this.update({
        active: { missionId: id, modifiers },
        selected: id,
        modifier,
        result: null,
        sectionResult: null,
        notice: null,
      });
      this.deps.host.startMission(options, {
        missionId: id,
        difficulty: ui.save.difficulty,
        onEnd: (outcome, state) => this.finishMission(outcome ?? outcomeFromMatch(state, id, modifiers)),
      });
      return true;
    } catch (error) {
      // the boss introduction has no place to say so: go back to the briefing, which shows the notice
      if (currentScreen(useGameStore.getState().menu) === 'bossIntro') this.setMenu(['campaign', 'briefing']);
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
    if (outcome.sectionMissionId) return this.finishSection(outcome);
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
      sectionResult: null,
      lastReward: paid ? reward : ui.lastReward,
    });
    this.setMenu(['campaign', 'campaignResult']);
  }

  /** Retry the mission just played (result screen or the pause menu): same modifiers, a fresh seed. */
  retry(): void {
    const ui = this.need();
    const section = ui.active?.sectionMissionId ?? ui.sectionResult?.missionId;
    if (section) {
      this.deps.host.stop();
      this.raidCtx = null;
      this.startSectionMission(section);
      return;
    }
    const id = ui.active?.missionId ?? ui.result?.outcome.missionId ?? ui.selected;
    const modifiers = ui.active?.modifiers ?? ui.result?.outcome.modifiers ?? [];
    this.deps.host.stop();
    this.startMission(id, modifiers[0] ?? null);
  }

  /** Back to the campaign map from the pause menu or a result: the save is kept as it is. */
  toMap(): void {
    if (this.ui?.active) this.deps.host.stop();
    this.raidCtx = null;
    this.setMenu(['campaign']); // first: a result screen must never show without its result
    this.update({ active: null, result: null, sectionResult: null });
  }

  /** Result screen: the next district's briefing (the one this win opened, or the next in order). */
  nextDistrict(): void {
    const ui = this.need();
    const done = ui.result?.outcome.missionId ?? ui.selected;
    const next = ui.result?.reward.unlockedDistricts[0] ?? nextDistrict(done);
    if (next && isMissionId(next) && districtStatus(ui.save, next) !== 'locked') {
      // the new district opens on its first section; the boss briefing only once the sections before it are cleared
      if (bossAvailable(ui.save, next)) this.beginBriefing(next);
      else {
        this.setMenu(['campaign']);
        this.update({ selected: next });
      }
    } else this.setMenu(['campaign']);
    this.update({ result: null, sectionResult: null });
  }

  /** The match was left some other way (Main menu): drop the running-mission marker. */
  leave(): void {
    this.raidCtx = null;
    if (this.ui?.active) this.update({ active: null });
  }

  // ------------------------------------------------------------------ section missions (docs/CAMPAIGN_SECTIONS.md)

  /**
   * Starts a section mission from the map: a FIELD mission (a district mission with doors) or a standalone RAID. The boss
   * section goes through the briefing instead. False (with a notice) when it is locked or cannot start.
   */
  startSectionMission(missionId: string): boolean {
    const ui = this.need();
    const def = getSectionMission(missionId);
    const sec = sectionOfMission(missionId);
    if (!def || !sec) return false;
    if (def.format === 'boss') {
      this.beginBriefing(sec.districtId);
      return false;
    }
    if (!canPlayMission(ui.save, missionId)) {
      this.update({ notice: 'Clear the earlier sections first.' });
      return false;
    }
    this.raidCtx = null;
    return def.format === 'field'
      ? this.startField(def, sec.districtId)
      : this.startStandaloneRaid(def, sec.districtId);
  }

  private startField(def: SectionMissionDef, districtId: MissionId): boolean {
    const ui = this.need();
    const build = this.deps.buildMission ?? buildMissionGame;
    // field enemies play at the campaign level's enemy bot level (decision CI1), not the boss fight's crew level
    const enemyLevel = campaignEnemyLevel(ui.save.campaignLevel);
    try {
      const options = build({
        spec: {
          id: districtId,
          fieldId: def.missionRef,
          difficulty: enemyLevel,
          lives: MISSION_LIVES,
        },
        humanCharacter: ui.save.character,
        seed: this.deps.seed(),
        level: ui.save.campaignLevel,
      });
      this.update({
        active: { missionId: districtId, modifiers: [], sectionMissionId: def.id },
        selected: districtId,
        modifier: null,
        result: null,
        sectionResult: null,
        notice: null,
      });
      this.deps.host.startMission(options, {
        missionId: districtId,
        difficulty: enemyLevel,
        onEnd: (outcome, state) =>
          this.finishMission(outcome ?? sectionOutcomeFromMatch(state, def, districtId)),
        onRaid: (request, state) => this.enterRaid(request, state),
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
   * Debug / e2e only (reached through `?debug` -> `__WAHALA__.campaign()`): plays a classic raid on its own, skipping
   * the section unlock gate. It records nothing in the save beyond what a normal raid result would.
   */
  debugStartRaid(raidId: RaidId): boolean {
    this.need();
    this.raidCtx = { request: null, raidId, missionId: null };
    if (!this.playRaid(this.raidCtx, undefined)) {
      this.raidCtx = null;
      return false;
    }
    return true;
  }

  private startStandaloneRaid(def: SectionMissionDef, districtId: MissionId): boolean {
    const ui = this.need();
    const raidId = def.missionRef as RaidId;
    this.raidCtx = { request: null, raidId, missionId: def.id };
    if (!this.playRaid(this.raidCtx, undefined)) {
      this.raidCtx = null;
      return false;
    }
    this.update({
      active: {
        missionId: districtId,
        modifiers: [],
        sectionMissionId: def.id,
        raid: { doorId: null, raidId },
      },
      selected: districtId,
      modifier: null,
      result: null,
      sectionResult: null,
      notice: null,
    });
    void ui;
    return true;
  }

  /** Builds the raid game for `ctx` and hands it to the host (a fresh seed each time: Retry raid). */
  private playRaid(ctx: RaidContext, hp: number | undefined): boolean {
    const ui = this.need();
    const host = this.deps.host;
    if (!host.playRaid) {
      this.update({ notice: 'Raids are not available in this build.' });
      return false;
    }
    try {
      const options = (this.deps.buildRaid ?? buildRaidGame)({
        raidId: ctx.raidId,
        humanCharacter: ui.save.character,
        seed: this.deps.seed(),
        ...(hp !== undefined ? { hp } : {}),
        // raid enemies play at the campaign level's enemy bot level (decision CI1)
        difficulty: campaignEnemyLevel(ui.save.campaignLevel),
        level: ui.save.campaignLevel,
      });
      host.playRaid(options, {
        raidId: ctx.raidId,
        difficulty: campaignEnemyLevel(ui.save.campaignLevel),
        onEnd: (outcome) => this.raidEnded(ctx, outcome),
      });
      return true;
    } catch (error) {
      this.update({
        notice: `This raid could not start (${error instanceof Error ? error.message : 'unknown error'}).`,
      });
      return false;
    }
  }

  /** A door of the field mission raised a request: the field stays paused underneath and the raid is played. */
  private enterRaid(request: RaidRequest, state: GameState): void {
    const ui = this.need();
    const ctx: RaidContext = {
      request,
      raidId: request.raidId,
      missionId: ui.active?.sectionMissionId ?? null,
    };
    this.raidCtx = ctx;
    if (!this.playRaid(ctx, state.players[0]?.vitals?.hp)) {
      // the raid cannot start: answer the door as left, so the field mission goes on (and the notice says why)
      this.answerDoor(ctx, raidAbandoned(null, request.raidId));
      return;
    }
    if (ui.active)
      this.update({ active: { ...ui.active, raid: { doorId: request.doorId, raidId: request.raidId } } });
  }

  private raidEnded(ctx: RaidContext, outcome: RaidOutcome): void {
    if (ctx.request) this.answerDoor(ctx, outcome);
    else this.finishRaidMission(ctx.missionId, outcome);
  }

  /** Raid -> field: the field mission comes back, its door is answered (`resolveRaid`) and the player is on the return tile. */
  private answerDoor(ctx: RaidContext, outcome: RaidOutcome): void {
    const request = ctx.request!;
    const host = this.deps.host;
    this.raidCtx = null;
    const resumed =
      host.resumeField?.((field) => {
        const events: SimEvent[] = [];
        resolveRaid(field, request.doorId, outcome, events);
        return events;
      }) ?? false;
    const ui = this.need();
    if (ui.active) {
      const { raid: _raid, ...rest } = ui.active;
      void _raid;
      this.update({ active: rest });
    }
    if (resumed) host.notice?.(raidNotice(outcome));
    else this.toMap(); // no field mission underneath (it was left): back to the map
  }

  /** Pause menu, inside a raid: start the same raid again (the field mission stays paused underneath). */
  retryRaid(): void {
    const ctx = this.raidCtx;
    if (!ctx) return;
    const hp = this.deps.host.current?.()?.players[0]?.vitals?.hp;
    this.playRaid(ctx, hp);
  }

  /** Pause menu, inside a raid: leave it. A door raid returns to the field (the door stays open); a standalone raid to the map. */
  leaveRaid(): void {
    const ctx = this.raidCtx;
    if (!ctx) return;
    const outcome = raidAbandoned(this.deps.host.current?.() ?? null, ctx.raidId);
    if (ctx.request) this.answerDoor(ctx, outcome);
    else this.toMap();
  }

  /** A section field mission ended: the result is applied, saved and shown (the next section opens). */
  private finishSection(outcome: MissionOutcome): void {
    const ui = this.need();
    const summary = applySectionResult(ui.save, outcome, this.deps.now());
    const def = outcome.sectionMissionId ? missionByRef('field', outcome.sectionMissionId) : undefined;
    this.deps.host.stop();
    this.raidCtx = null;
    this.commit(summary.save, {
      active: null,
      selected: isMissionId(outcome.missionId) ? outcome.missionId : ui.selected,
      modifier: null,
      result: null,
      sectionResult: {
        missionId: summary.missionId ?? def?.id ?? outcome.sectionMissionId ?? '',
        kind: 'field',
        outcome,
        summary,
      },
    });
    this.setMenu(['campaign', 'campaignResult']);
  }

  /** A standalone section raid ended (public, like `finishMission`, so tests can finish one with an outcome). */
  finishRaidMission(missionId: string | null, outcome: RaidOutcome): void {
    const ui = this.need();
    const summary = missionId
      ? applyRaidResult(ui.save, missionId, outcome, this.deps.now())
      : {
          save: ui.save,
          missionId: null,
          sectionId: null,
          firstClear: false,
          newRewards: [],
          sectionCleared: false,
          unlockedSections: [],
          unlockedMissions: [],
          bossUnlocked: false,
        };
    const district = missionId ? sectionOfMission(missionId)?.districtId : undefined;
    this.deps.host.stop();
    this.raidCtx = null;
    this.commit(summary.save, {
      active: null,
      selected: district ?? ui.selected,
      modifier: null,
      result: null,
      sectionResult: { missionId: missionId ?? '', kind: 'raid', outcome, summary },
    });
    this.setMenu(['campaign', 'campaignResult']);
  }
}
