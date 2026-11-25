/**
 * Generator Parts upgrades on the campaign map (decisions PR1-PR15, src/campaign/upgrades.ts). Campaign-wide: shown
 * beside any selected district once the campaign is started (the Parts and the levels are the same everywhere), with
 * that district's share of the Parts. Every number comes from `CAMPAIGN_PROGRESSION`; buying and the free refund go
 * through `commands`.
 */
import type { DistrictId } from '../../campaign';
import { commands } from '../../app/session';
import {
  CAMPAIGN_PROGRESSION,
  UPGRADE_KINDS,
  canBuy,
  districtParts,
  nextCost,
  partsAvailable,
  partsEarned,
  progressionDistrict,
  progressionEnabled,
  upgradeCap,
  upgradesOf,
} from '../../campaign';
import type { CampaignSave, UpgradeKind } from '../../campaign';
import { SecondaryButton } from '../menu/Frame';
import { useCampaignUi } from './parts';

/** "Now +1 blast range · next: +2 blast range for 14 Parts" (pure, tested). */
export function upgradeLevelText(save: CampaignSave, kind: UpgradeKind): string {
  const def = CAMPAIGN_PROGRESSION.upgrades[kind];
  const level = upgradesOf(save)[kind];
  const now = level > 0 ? `Now ${def.levelEffects[level - 1]}` : 'Not bought yet';
  const cost = nextCost(save, kind);
  return cost === null ? `${now} (maximum)` : `${now} · next: ${def.levelEffects[level]} for ${cost} Parts`;
}

export function Workshop({ districtId }: { districtId: DistrictId }) {
  const ui = useCampaignUi();
  if (!ui || !ui.started || !progressionEnabled()) return null;
  const save = ui.save;
  const levels = upgradesOf(save);
  const available = partsAvailable(save);
  const here = progressionDistrict(districtId) ? districtParts(save, districtId) : null;
  const anyBought = levels.capacity + levels.range > 0;
  return (
    <section className="cp-panel mn-panel cp-workshop" data-testid="campaign-workshop">
      <small className="mn-kicker">Generator Parts · campaign only</small>
      <p className="cp-chip-line">
        <b data-testid="workshop-parts">{available}</b> to spend · {partsEarned(save)} earned in the campaign
        {here && here.max > 0 && (
          <span data-testid="workshop-district-parts">
            {' '}
            · {here.earned} of {here.max} here
          </span>
        )}
      </p>
      <ul>
        {UPGRADE_KINDS.map((kind) => {
          const def = CAMPAIGN_PROGRESSION.upgrades[kind];
          const cost = nextCost(save, kind);
          return (
            <li key={kind} data-testid={`workshop-${kind}`} data-level={levels[kind]}>
              <span>
                <b>{def.name}</b> {levels[kind]} / {upgradeCap(kind)}
                <small data-testid={`workshop-${kind}-text`}>{upgradeLevelText(save, kind)}</small>
              </span>
              <SecondaryButton
                className="small"
                testId={`workshop-buy-${kind}`}
                disabled={!canBuy(save, kind)}
                onClick={() => commands.campaignBuyUpgrade(kind)}
              >
                {cost === null ? 'Maxed' : `Buy · ${cost}`}
              </SecondaryButton>
            </li>
          );
        })}
      </ul>
      {anyBought && (
        <SecondaryButton
          className="small"
          testId="workshop-refund"
          onClick={() => commands.campaignRefundUpgrades()}
        >
          Refund all (free)
        </SecondaryButton>
      )}
      <p className="cp-chip-line">
        <small>
          Earn Parts by clearing a mission the first time and by beating your best stars. Upgrades apply in
          campaign field and boss missions only, never in raids, Junction Blast, City Rumble or the Academy.
        </small>
      </p>
    </section>
  );
}
