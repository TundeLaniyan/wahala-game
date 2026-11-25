/**
 * The Test Lab's launcher (docs/TEST_LAB.md, decisions TL1-TL6): starts each entry through the game's own start paths,
 * restarts it cleanly, returns to the lab and records feedback. It adds no rule: Junction Blast and City Rumble start
 * through `commands.start` (their settings live in the in-memory store), raids, the field mission and the boss through
 * the real campaign controller (whose save is in memory too), and the scenarios through the controller's no-save raid
 * path with a set-up hook.
 */
import { commands, labCampaign, labRunScene } from '../app/session';
import { patch, useGameStore } from '../app/store';
import { campaignEnemyLevel } from '../sim';
import type { CharacterId } from '../sim';
import { copyText } from './clipboard';
import { saveFeedback, summarizeFeedback, withFeedback } from './feedback';
import type { FeedbackStatus, LabLevel } from './feedback';
import { currentIsolation } from './isolation';
import { labPatch, levelOf, useLab, variantOf } from './labStore';
import { normalGameUrl } from './params';
import { LAB_ENTRIES, entryById, scenarioIdFor } from './registry';
import type { LabEntry } from './registry';
import { rumbleFeedbackSetup } from './labActions';
import { applyRumbleConfig } from './rumbleSetup';
import { scenarioById } from './scenarios/defs';
import { buildTeamBlastScene } from './teamBlast';

/** Did the in-memory isolation install? (Without it the lab refuses to start anything: a test could write a save.) */
export function isolationOk(): boolean {
  return currentIsolation()?.ok === true;
}

/** Launches `entry` at `level`. Starting over a running test replaces it. */
function launch(entry: LabEntry, level: LabLevel): boolean {
  const campaign = labCampaign();
  const l = entry.launch;
  // a fresh in-memory campaign for every start: a restart never inherits what the last attempt wrote
  campaign?.deleteSave();
  const showStats = !!entry.fps || new URLSearchParams(location.search).has('fps');
  patch({ showStats });
  switch (l.kind) {
    case 'raid':
      return campaign?.qaStartRaid(l.raidId, level) ?? false;
    case 'scenario': {
      const def = scenarioById(scenarioIdFor(entry, variantOf(useLab.getState(), entry.id)) ?? l.scenarioId);
      if (!def || !campaign) return false;
      return campaign.qaStartRaid(def.raidId, level, {
        prepare: def.prepare,
        seed: def.seed,
        timeLimitSec: def.timeLimitSec,
      });
    }
    case 'field':
      campaign?.setLevel(level);
      return campaign?.startSectionMission(l.missionId) ?? false;
    case 'boss':
      campaign?.setLevel(level);
      return campaign?.startMission(l.districtId) ?? false;
    case 'classic': {
      const d = campaignEnemyLevel(level);
      commands.updateSettings({
        play: 'classic',
        competitors: 4,
        arenaId: l.arenaId,
        difficulty: d,
        botDifficulties: [d, d, d],
      });
      commands.start();
      return true;
    }
    case 'rumble': {
      if (entry.fighter) commands.updateSettings({ character: fighterChoice() });
      commands.updateSettings({
        play: 'rumble',
        rumbleMode: l.mode,
        rumbleArenaId: l.arenaId,
        rumbleCompetitors: l.competitors,
        difficulty: l.difficulty ?? campaignEnemyLevel(level),
        rumbleMixed: false,
      });
      commands.start();
      return true;
    }
    case 'rumbleConfigured': {
      // the normal match start with exactly the set-up the card shows (decision TL6): the same settings, the same path
      commands.updateSettings(applyRumbleConfig(useGameStore.getState().settings, useLab.getState().rumble));
      commands.start();
      return true;
    }
    case 'suddenDeath':
      commands.start('suddenDeathTest');
      return true;
    case 'teamBlast': {
      // a small real Team Rumble: the player's own fighter, the other seats laying generators through the real intent
      const scene = buildTeamBlastScene(l.variant, useGameStore.getState().settings);
      if (!scene) return false;
      labRunScene(scene.state, scene.director);
      return true;
    }
  }
}

function fighterChoice(): CharacterId {
  return useGameStore.getState().settings.character;
}

/** Start Test: the entry's chosen level. */
export function startEntry(entryId: string): void {
  const entry = entryById(entryId);
  if (!entry || !isolationOk()) return;
  const level = entry.levels ? levelOf(useLab.getState(), entryId) : 'normal';
  labPatch({ run: { entryId, level } });
  launch(entry, level);
}

/** Restart Test: the same entry at the same level, from a clean state. */
export function restartRun(): void {
  const run = useLab.getState().run;
  if (run) startEntry(run.entryId);
}

/** Return to Test Lab: leaves whatever is running (the caller asked the founder to confirm) and shows the lab. */
export function returnToLab(): void {
  commands.toTitle(); // stops the match controller (raid, mission or match) and drops the campaign's running marker
  labCampaign()?.toMap(); // forgets any result the campaign showed
  patch({ showStats: new URLSearchParams(location.search).has('fps') });
  labPatch({ run: null, view: 'home', entryId: null });
}

/** Exit Test Lab: the normal game's URL, as a full reload (so nothing of the lab's state or isolation survives). */
export function exitTestLab(): void {
  location.assign(normalGameUrl(location.href));
}

export function openEntry(entryId: string): void {
  labPatch({ view: 'entry', entryId });
}

export function closeEntry(): void {
  labPatch({ view: 'home', entryId: null });
}

export function setLevel(entryId: string, level: LabLevel): void {
  const s = useLab.getState();
  labPatch({ levels: { ...s.levels, [entryId]: level } });
}

export function setFighter(character: CharacterId): void {
  commands.updateSettings({ character });
}

/** The set-up a feedback entry is marked at: the City Rumble configuration, or the chosen one-hit enemy. */
function setupDetail(entry: LabEntry): string | undefined {
  if (entry.launch.kind === 'rumbleConfigured') return rumbleFeedbackSetup();
  const label = entry.variants?.find((v) => v.id === variantOf(useLab.getState(), entry.id))?.label;
  return entry.variants ? (label ?? entry.variants[0]!.label) : undefined;
}

/** Records a status and/or note for one test (the only way a status is ever set). */
export function setFeedback(entryId: string, change: { status?: FeedbackStatus; note?: string }): void {
  const s = useLab.getState();
  const entry = entryById(entryId);
  const level = entry?.levels ? levelOf(s, entryId) : undefined;
  const detail = entry ? setupDetail(entry) : undefined;
  const next = withFeedback(s.feedback, entryId, {
    ...change,
    ...(level ? { level } : {}),
    ...(detail ? { detail } : {}),
  });
  const saved = saveFeedback(window.localStorage, next);
  labPatch({ feedback: next, feedbackUnsaved: !saved });
}

/** The plain-text summary the founder pastes into a chat. */
export function feedbackSummary(): string {
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const device = `${window.innerWidth}x${window.innerHeight}, ${useGameStore.getState().touchCapable ? 'touch' : 'pointer'}`;
  return summarizeFeedback(useLab.getState().feedback, LAB_ENTRIES, { when, device });
}

export function copySummary(): Promise<boolean> {
  return copyText(feedbackSummary());
}
