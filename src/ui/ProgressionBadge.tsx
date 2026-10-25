/**
 * V2 City Rumble progression badge (workstream C, decision WC3): one compact pill with the local
 * fighter's credited eliminations, the reward the NEXT elimination pays (icons), the protection layers
 * they wear (Okada + one pip per Armour plate) and their Square Blast tier. Mobile friendly: a single
 * row of small icons, no text over the board. Renders nothing outside a reward ruleset unless the
 * player wears Armour / Square Blast.
 *
 * Usage: `<ProgressionBadge me={hud.me} />` inside the Rumble HUD; add `floating` to pin it under the
 * match clock when it is mounted on its own.
 */
import { PICKUP_DEFS } from '../sim';
import type { PickupKind } from '../sim';
import { pickupIconUrl } from '../assets/pickupIcons';
import type { HudMe } from '../app/hud';
import './ProgressionBadge.css';

export type ProgressionView = Pick<HudMe, 'kills' | 'streak' | 'nextRewards' | 'mounted' | 'armour' | 'squareTier'>;

/** Square Blast tier label: the side of the square (tier 1 = 3 x 3, tier 2 = 5 x 5 ...). */
export const squareLabel = (tier: number): string => `${2 * tier + 1}×${2 * tier + 1}`;

/** Collapses repeated reward kinds into [kind, count] pairs, in order of first appearance. */
export function groupRewards(kinds: readonly PickupKind[]): [PickupKind, number][] {
  const out: [PickupKind, number][] = [];
  for (const k of kinds) {
    const hit = out.find((e) => e[0] === k);
    if (hit) hit[1]++;
    else out.push([k, 1]);
  }
  return out;
}

export function ProgressionBadge({ me, floating = false }: { me: ProgressionView; floating?: boolean }) {
  const rewards = me.nextRewards.length > 0;
  if (!rewards && me.armour <= 0 && me.squareTier <= 0) return null;
  const next = groupRewards(me.nextRewards);
  const nextTitle = me.nextRewards.map((k) => PICKUP_DEFS[k].name).join(', ');
  return (
    <div
      className={`pbadge${floating ? ' floating' : ''}`}
      data-testid="progression-badge"
      data-kills={me.kills}
      data-armour={me.armour}
      data-square={me.squareTier}
    >
      {rewards && (
        <span className="pb-kills" title="Your eliminations">
          <b>{me.kills}</b>
          <small>KO</small>
        </span>
      )}
      {rewards && next.length > 0 && (
        <span className="pb-next" title={`Next elimination: ${nextTitle}`} data-testid="next-reward">
          <small>NEXT</small>
          {next.map(([kind, n]) => (
            <span key={kind} className="pb-icon">
              <img src={pickupIconUrl(kind, 48)} alt={PICKUP_DEFS[kind].short} />
              {n > 1 && <i>×{n}</i>}
            </span>
          ))}
        </span>
      )}
      {(me.mounted || me.armour > 0) && (
        <span className="pb-guard" title="Protection: each layer absorbs one separate lethal hit" data-testid="protection-layers">
          {me.mounted && <i className="pb-pip okada" aria-label="Okada" />}
          {Array.from({ length: Math.min(me.armour, 5) }, (_, i) => (
            <i key={i} className="pb-pip armour" aria-label="Armour" />
          ))}
          {me.armour > 5 && <small>+{me.armour - 5}</small>}
        </span>
      )}
      {me.squareTier > 0 && (
        <span className="pb-square" title={`Square Blast ${squareLabel(me.squareTier)}`} data-testid="square-tier">
          <i className="pb-sq" />
          {squareLabel(me.squareTier)}
        </span>
      )}
    </div>
  );
}
