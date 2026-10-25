import { commands } from '../app/session';
import { useGameStore } from '../app/store';
import type { ShakeSetting } from '../app/settings';

const ORDER: readonly ShakeSetting[] = ['auto', 'off', 'subtle'];
const LABEL: Record<ShakeSetting, string> = {
  auto: 'Screen shake: auto',
  off: 'Screen shake: off',
  subtle: 'Screen shake: subtle',
};

/**
 * One chip in the pause menu that cycles the camera-shake setting (decision WA6): auto (off on touch
 * screens, subtle with a mouse), off, subtle. prefers-reduced-motion always wins.
 */
export function ShakeToggle() {
  const shake = useGameStore((s) => s.settings.shake);
  const next = ORDER[(ORDER.indexOf(shake) + 1) % ORDER.length] ?? 'auto';
  return (
    <div className="audio-buttons">
      <button
        type="button"
        className={`chip${shake === 'off' ? '' : ' on'}`}
        data-testid="toggle-shake"
        data-value={shake}
        title="Auto = off on touch screens, subtle with a mouse"
        onClick={() => commands.updateSettings({ shake: next })}
      >
        {LABEL[shake]}
      </button>
    </div>
  );
}
