/**
 * Oshodi field missions after the district encounter pass (docs/CAMPAIGN_SECTOR_AI.md "Districts: Oshodi ...",
 * decisions DA1-DA9): encounter data, measured scripted playthroughs against the real enemy bots at Easy / Normal / Hard,
 * and the "seen generator" escapes. The checks themselves live in tests/field-districts-a.ts.
 */
import { describeDistrictPlay, describeMissionData } from './field-districts-a';

const IDS = ['oshodi.approach', 'oshodi.railEdge'] as const;

for (const id of IDS) describeMissionData(id);
describeDistrictPlay(IDS);
