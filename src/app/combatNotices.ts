/**
 * Wording of the combat status notices that go to the HUD rail as toasts (decision HC2): a protection layer
 * absorbing a lethal hit, and QUICK HANDS being stored through a death or resumed on the respawn. Pure and
 * read-only: the sim decides, these only say it. A shield that absorbs a hit is NOT a death, so no elimination
 * wording is ever produced for it (the kill feed only reacts to `eliminatedTick`).
 */
import type { Toast } from './store';

type Notice = Pick<Toast, 'text' | 'tone'>;

const seconds = (ticks: number): number => Math.max(1, Math.ceil(ticks / 60));

/** The Okada (mount) or an Armour plate absorbed a lethal hit of the local player; `armourLeft` plates remain. */
export function protectionNotice(layer: 'okada' | 'armour', armourLeft: number): Notice {
  if (layer === 'okada') return { text: 'OKADA SAVED YOU', tone: 'good' };
  return {
    text: armourLeft > 0 ? `ARMOUR USED · ${armourLeft} LEFT` : 'ARMOUR USED',
    tone: 'good',
  };
}

/** A death paused a running QUICK HANDS: `bankTicks` of it are stored for the respawn. */
export function quickHandsStoredNotice(bankTicks: number): Notice {
  return { text: `QUICK HANDS STORED · ${seconds(bankTicks)}s`, tone: 'info' };
}

/** The respawn gave back the stored QUICK HANDS time. */
export function quickHandsResumedNotice(ticksLeft: number): Notice {
  return { text: `QUICK HANDS RESUMED · ${seconds(ticksLeft)}s`, tone: 'good' };
}
