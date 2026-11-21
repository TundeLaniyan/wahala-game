/**
 * TEMPORARY founder QA entry (docs/QA_ENTRY.md, decision QA1): `?qaraid=<raidId>[&qalevel=easy|normal|hard]` adds one
 * button to Home that starts that classic raid on its own (the Records Vault night raid is otherwise 15 missions in).
 * It never touches the campaign save: no progress, unlock or reward is written, and the raid's result is shown and
 * forgotten. Without the query nothing changes. Remove this file, its Home button, `commands.qaStartRaid` and
 * `CampaignController.qaStartRaid` once the founder's phone tests are done (docs/QA_ENTRY.md, "Removal").
 */
import { RAID_IDS } from '../sim';
import type { CampaignLevel, RaidId } from '../sim';

export interface QaRaidEntry {
  raidId: RaidId;
  /** The enemy level to play at (the save's own level when not given). */
  level: CampaignLevel | null;
}

const LEVELS: readonly CampaignLevel[] = ['easy', 'normal', 'hard'];

/** Parses the QA query (pure). Null when absent or when it names no raid of this build. */
export function parseQaRaid(search: string): QaRaidEntry | null {
  const q = new URLSearchParams(search);
  const raid = q.get('qaraid');
  if (!raid || !(RAID_IDS as readonly string[]).includes(raid)) return null;
  const level = q.get('qalevel');
  return {
    raidId: raid as RaidId,
    level: level && (LEVELS as readonly string[]).includes(level) ? (level as CampaignLevel) : null,
  };
}

let cached: QaRaidEntry | null | undefined;

/** The QA raid entry of this page load (resolved once from the URL). */
export function qaRaidEntry(): QaRaidEntry | null {
  if (cached === undefined) cached = typeof location !== 'undefined' ? parseQaRaid(location.search) : null;
  return cached;
}
