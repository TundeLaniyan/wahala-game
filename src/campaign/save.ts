/**
 * Campaign save/load over the `KeyValueStore` port. Nothing here throws: storage can be missing (private mode,
 * blocked site data), full (quota) or hold garbage (hand-edited, truncated, an older build). `loadSave` treats
 * everything it reads as untrusted: it validates, repairs what it can and returns null when nothing is usable.
 *
 * Rewards, unlocks and story flags are REBUILT from the districts that are cleared, so a repaired save can never
 * hold a reward the player did not earn nor miss one they did.
 */
import type { CharacterId, Difficulty, MissionModifierId } from '../sim';
import { CHARACTER_IDS, DIFFICULTIES, MODIFIER_FOR } from '../sim';
import { CAMPAIGN, MODIFIER_IDS } from './content';
import { createSave, freshProgress, grantsForClear } from './progress';
import type { CampaignSave, DistrictId, DistrictProgress, KeyValueStore } from './types';
import { CAMPAIGN_SAVE_KEY, DISTRICT_ORDER } from './types';

export const CAMPAIGN_SAVE_VERSION = 1 as const;

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
}

function time(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/**
 * Migrates an older save shape to the current one. Version 0 (or a missing version) is the pre-release shape
 * where cleared districts were a plain list: `{ cleared: ["oshodi", ...] }`. A newer version than we know is
 * rejected (null) rather than guessed at.
 */
export function migrateSave(raw: Json): Json | null {
  const version = raw.version;
  if (version === undefined || version === 0) {
    const cleared = Array.isArray(raw.cleared) ? raw.cleared : [];
    if (!isObject(raw.districts)) {
      const districts: Json = {};
      for (const id of cleared) {
        if (typeof id === 'string')
          districts[id] = { status: 'cleared', clears: 1, attempts: 1, bestStars: 1 };
      }
      return { ...raw, version: CAMPAIGN_SAVE_VERSION, districts };
    }
    return { ...raw, version: CAMPAIGN_SAVE_VERSION };
  }
  if (version === CAMPAIGN_SAVE_VERSION) return raw;
  return null;
}

function repairProgress(raw: unknown): DistrictProgress {
  const src = isObject(raw) ? raw : {};
  const clears = int(src.clears, 0, 1_000_000, 0);
  const modifiers = Array.isArray(src.modifiersCleared)
    ? [
        ...new Set(
          src.modifiersCleared.filter((m): m is MissionModifierId =>
            MODIFIER_IDS.includes(m as MissionModifierId),
          ),
        ),
      ]
    : [];
  const seconds = src.bestSeconds;
  return {
    ...freshProgress(src.status === 'cleared' || clears > 0 ? 'cleared' : 'locked'),
    attempts: Math.max(clears, int(src.attempts, 0, 1_000_000, 0)),
    clears,
    bestStars: int(src.bestStars, 0, 3, 0) as 0 | 1 | 2 | 3,
    bestSeconds: typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? seconds : null,
    introSeen: src.introSeen === true,
    modifiersCleared: modifiers,
  };
}

/**
 * Validates and repairs an untrusted, already-parsed value into a consistent CampaignSave. Returns null when it
 * is not a save at all (not an object) or comes from a newer build.
 */
export function repairSave(value: unknown): CampaignSave | null {
  if (!isObject(value)) return null;
  const raw = migrateSave(value);
  if (!raw) return null;

  const startedAt = time(raw.startedAt, 0);
  const save = createSave(startedAt);
  save.updatedAt = Math.max(startedAt, time(raw.updatedAt, startedAt));
  save.prologueSeen = raw.prologueSeen === true;
  save.character = (CHARACTER_IDS as readonly string[]).includes(raw.character as string)
    ? (raw.character as CharacterId)
    : save.character;
  save.difficulty = (DIFFICULTIES as readonly string[]).includes(raw.difficulty as string)
    ? (raw.difficulty as Difficulty)
    : save.difficulty;

  const src = isObject(raw.districts) ? raw.districts : {};
  const rewards: string[] = [];
  let unlocks: string[] = [];
  const flags: string[] = [];
  let previousCleared = true; // Ojuelegba, the hub
  for (const id of DISTRICT_ORDER) {
    if (id === 'ojuelegba') {
      save.districts.ojuelegba = {
        ...freshProgress('cleared'),
        introSeen: isObject(src.ojuelegba) && src.ojuelegba.introSeen === true,
      };
      continue;
    }
    const p = repairProgress(src[id]);
    // A district can only be cleared when everything before it is (no skipped bosses).
    const requiresMet = CAMPAIGN.districts[id].requires.every((r) => save.districts[r]?.status === 'cleared');
    const cleared: boolean = p.status === 'cleared' && requiresMet && previousCleared;
    previousCleared = cleared;
    p.status = cleared ? 'cleared' : requiresMet ? 'available' : 'locked';
    if (cleared) {
      p.clears = Math.max(1, p.clears);
      p.attempts = Math.max(p.clears, p.attempts);
      p.bestStars = Math.max(1, p.bestStars) as 1 | 2 | 3;
      const g = grantsForClear(id);
      if (g.reward) rewards.push(g.reward.id);
      unlocks = [...new Set([...unlocks, ...g.unlocks])];
      flags.push(...g.flags);
    } else {
      // No clear, no replay record, no stars.
      p.clears = 0;
      p.bestStars = 0;
      p.bestSeconds = null;
      p.modifiersCleared = [];
    }
    // Only this district's own modifier can have been cleared here.
    p.modifiersCleared = p.modifiersCleared.filter(
      (m) => m === MODIFIER_FOR[id as keyof typeof MODIFIER_FOR],
    );
    save.districts[id] = p;
  }
  const allCleared = DISTRICT_ORDER.every((id) => save.districts[id].status === 'cleared');
  save.completed = raw.completed === true && allCleared;
  if (save.completed) flags.push('campaign.completed');
  save.rewards = rewards;
  save.unlocks = unlocks;
  save.flags = [...new Set(flags)];
  return save;
}

/** Reads the save. Null when there is none, it is unreadable or from a newer build. Never throws. */
export function loadSave(store: KeyValueStore): CampaignSave | null {
  let text: string | null;
  try {
    text = store.getItem(CAMPAIGN_SAVE_KEY);
  } catch {
    return null;
  }
  if (text === null || text === undefined || text === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    keepCorruptCopy(store, text);
    return null;
  }
  try {
    const repaired = repairSave(value);
    if (!repaired) keepCorruptCopy(store, text);
    return repaired;
  } catch {
    return null;
  }
}

/** A save we cannot use is copied aside (best effort) instead of being silently destroyed on the next write. */
function keepCorruptCopy(store: KeyValueStore, text: string): void {
  try {
    store.setItem(`${CAMPAIGN_SAVE_KEY}.corrupt`, text.slice(0, 200_000));
  } catch {
    /* nothing to do: the original stays where it is */
  }
}

/** Writes the save. False when storage is unavailable or full. Never throws. */
export function persistSave(store: KeyValueStore, save: CampaignSave): boolean {
  try {
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(store: KeyValueStore): void {
  try {
    store.removeItem(CAMPAIGN_SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** window.localStorage as a KeyValueStore, or null when it is missing or blocked (private mode, site data off). */
export function browserStore(): KeyValueStore | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const ls = window.localStorage;
    const probe = `${CAMPAIGN_SAVE_KEY}.probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
    };
  } catch {
    return null;
  }
}

export type { DistrictId };
