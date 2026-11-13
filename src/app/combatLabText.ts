/**
 * Plain-words text for the combat test lab (docs/COMBAT_TEST_LAB.md, decision CL-L9). Every number and every
 * sentence is derived from `COMBAT_LAB_PRESETS` and the catalogue's own Punch through `labAttackSpec`, so the menu
 * can never say something the rules do not do. Pure functions (tested in tests/combat-lab-feedback.test.ts; in `app/` so the HUD snapshot and the pause menu share it).
 */
import { COMBAT_LAB_PRESETS, DEFAULT_CONFIG, labAttackSpec } from '../sim';
import type { AttackSpec, CombatLabLevel, CombatLabPreset } from '../sim';

/** The accent colour of each level as CSS (the same hues as `render/combatLabLook.ts`). */
export const LAB_CSS_COLORS: Readonly<Record<number, string>> = {
  1: '#ffffff',
  2: '#62e6ff',
  3: '#ffd23f',
  4: '#ff5a3c',
};

const BASE_PUNCH: AttackSpec = DEFAULT_CONFIG.skills.attacks.push;
const secs = (ticks: number): string => `${(ticks / 60).toFixed(ticks % 6 === 0 ? 1 : 2)} s`;

/** What a level does to the catalogue Punch (the other attacks scale the same way). */
function punchOf(level: CombatLabLevel | 0): { spec: AttackSpec; preset: CombatLabPreset | null } {
  if (level === 0) return { spec: BASE_PUNCH, preset: null };
  const preset = COMBAT_LAB_PRESETS[level];
  return { spec: labAttackSpec(BASE_PUNCH, preset), preset };
}

/** Reach in words, from the preset's flags. */
export function reachWords(preset: CombatLabPreset | null): string {
  if (!preset) return 'the 4 tiles around you';
  if (preset.reachTwoWide) return 'two tiles ahead and one to the side, plus the corners';
  if (preset.reachTwo) return 'two tiles straight ahead, plus the corners';
  if (preset.forwardDiagonals) return 'the 4 neighbours and the 2 forward corners';
  return 'the 4 tiles around you';
}

/**
 * What changes going from `level - 1` (Off for level 1) to `level`, as short plain sentences. Only things that differ
 * are listed, then what never changes. Example for 2: "Punch hits 1 tick sooner ..., recovery after a hit 0.4 s (was 0.6 s)".
 */
export function labChangeLines(level: CombatLabLevel): string[] {
  const prev = punchOf((level - 1) as CombatLabLevel | 0);
  const now = punchOf(level);
  const was = prev.preset;
  const p = now.preset!;
  const lines: string[] = [];
  const d = now.spec.startupTicks - prev.spec.startupTicks;
  if (d !== 0)
    lines.push(
      `Punch lands ${Math.abs(d)} tick${Math.abs(d) === 1 ? '' : 's'} sooner (${now.spec.startupTicks} vs ${prev.spec.startupTicks}, 60 ticks = 1 s).`,
    );
  if (now.spec.hitRecoveryTicks !== prev.spec.hitRecoveryTicks)
    lines.push(
      `Ready again ${secs(now.spec.hitRecoveryTicks)} after a hit (was ${secs(prev.spec.hitRecoveryTicks)}).`,
    );
  if (now.spec.whiffRecoveryTicks !== prev.spec.whiffRecoveryTicks)
    lines.push(
      `Ready again ${secs(now.spec.whiffRecoveryTicks)} after a miss (was ${secs(prev.spec.whiffRecoveryTicks)}).`,
    );
  if (now.spec.targetLockoutTicks !== prev.spec.targetLockoutTicks)
    lines.push(
      `Same rival can be hit again after ${secs(now.spec.targetLockoutTicks)} (was ${secs(prev.spec.targetLockoutTicks)}).`,
    );
  if (reachWords(was) !== reachWords(p)) lines.push(`Reach: ${reachWords(p)}.`);
  if (p.autoTarget && !was?.autoTarget) lines.push('Turns to a rival it can hit.');
  if (p.bufferTicks !== (was?.bufferTicks ?? 0))
    lines.push(
      `A B press while recovering is kept ${p.bufferTicks} ticks (${was ? `was ${was.bufferTicks}` : 'was ignored'}).`,
    );
  if (p.airSwing && !was?.airSwing) lines.push('B with nobody in reach swings, so a miss is visible.');
  if (p.feedback !== (was?.feedback ?? 1)) lines.push('Bigger hit flash and ring.');
  return lines;
}

/** The whole line shown under the level buttons: "<name> vs <previous>: ...". */
export function labChangeText(level: CombatLabLevel | 0): string {
  if (level === 0)
    return 'Off: today’s rules. Presses while recovering are ignored and a punch at nobody does nothing.';
  const before =
    level === 1 ? 'Off' : `${level - 1} ${COMBAT_LAB_PRESETS[(level - 1) as CombatLabLevel].name}`;
  const lines = labChangeLines(level);
  const prefix = `${level} ${COMBAT_LAB_PRESETS[level].name} vs ${before}: `;
  return prefix + (lines.length ? lines.join(' ') : 'nothing in the numbers changes.');
}

/** The chip's second line: what this level reaches and whether it aims for you. Short; never over the board. */
export function labChipDetail(preset: CombatLabPreset): string {
  const reach = preset.reachTwoWide
    ? '2 ahead + side'
    : preset.reachTwo
      ? '8 + 2 ahead'
      : preset.forwardDiagonals
        ? '8 around'
        : '4 around';
  return preset.autoTarget ? `${reach} · aim help` : reach;
}
