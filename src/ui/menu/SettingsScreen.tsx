/**
 * Settings in four panels: Audio, Graphics, Controls, Accessibility. Two stores stay separate, as in the
 * engine: the persistent audio preferences (volumes and voices, src/audio/prefs.ts; the engine follows them
 * live) and the game settings (mute, subtitles, quality, touch controls, shake ...). Every change applies
 * and saves at once. "Restore defaults" resets both kinds of preference and never the match setup.
 * The same panel opens from the main menu and from the pause menu (the match stays paused behind it).
 */
import { useEffect, useState } from 'react';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { preferenceDefaults } from '../../app/settings';
import type { GameSettings, ShakeSetting, SubtitleMode } from '../../app/settings';
import type { MoveAssistSetting } from '../../input';
import { audioPrefs } from '../../audio/prefs';
import { AudioSettingsPanel } from '../AudioSettings';
import { LEGEND_ORDER, legendRows } from '../howToPlayControls';
import { Field, Option, PrimaryButton, ScreenFrame, Toggle } from './Frame';

export type SettingsTab = 'audio' | 'graphics' | 'controls' | 'access';

export const SETTINGS_TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'controls', label: 'Controls' },
  { id: 'access', label: 'Accessibility' },
];

type Set = (p: Partial<GameSettings>) => void;

function AudioTab({ s, set }: { s: GameSettings; set: Set }) {
  return (
    <AudioSettingsPanel
      muted={s.muted}
      onMutedChange={(muted) => set({ muted })}
      subtitles={s.subtitles}
      onSubtitlesChange={(subtitles) => set({ subtitles })}
    />
  );
}

function GraphicsTab({ s, set }: { s: GameSettings; set: Set }) {
  return (
    <>
      <Field
        label="Graphics quality"
        hint="Auto picks a level for this device. Low runs fastest on older phones; High adds shadows and effects."
      >
        <div className="mn-opts">
          {(['auto', 'low', 'medium', 'high'] as const).map((q) => (
            <Option key={q} value={q} current={s.quality} label={q} onPick={(quality) => set({ quality })} testId={`quality-${q}`} />
          ))}
        </div>
      </Field>
      <Field
        label="City Rumble camera"
        hint="Follow: the camera tracks your fighter. Whole stage: the wide overview. Press O in a Rumble to switch. Classic arenas always show the whole board."
      >
        <div className="mn-opts">
          <Option value="action" current={s.cameraView} label="Follow" onPick={(cameraView) => set({ cameraView })} testId="camera-action" />
          <Option value="overview" current={s.cameraView} label="Whole stage" onPick={(cameraView) => set({ cameraView })} testId="camera-overview" />
        </div>
      </Field>
    </>
  );
}

const ASSIST_LABEL: Record<MoveAssistSetting, string> = { auto: 'Auto', on: 'On', off: 'Off' };

function ControlsTab({ s, set }: { s: GameSettings; set: Set }) {
  const rows = legendRows();
  return (
    <>
      <Field
        label="On-screen controls"
        hint="Floating joystick (lands wherever your thumb does, lower left) with the A and B buttons on the right. Auto shows them on touch screens."
      >
        <div className="mn-opts">
          {(['auto', 'on', 'off'] as const).map((t) => (
            <Option key={t} value={t} current={s.touchControls} label={t} onPick={(touchControls) => set({ touchControls })} testId={`touch-${t}`} />
          ))}
        </div>
      </Field>
      <Field
        label="Assisted movement"
        hint="Helps your thumb steer: a turn pressed a little early is taken at the corner, and a direction pushed against a wall slides to an opening one tile away. It never walks you into a generator, flames or a warned hazard. Auto: on for touch, the plain corner buffer with keyboard and gamepad."
      >
        <div className="mn-opts mn-opts-tall">
          {(['auto', 'on', 'off'] as const).map((m) => (
            <Option key={m} value={m} current={s.moveAssist} label={ASSIST_LABEL[m]} onPick={(moveAssist) => set({ moveAssist })} testId={`assist-${m}`} />
          ))}
        </div>
      </Field>
      <div className="mn-controls-note">
        <b>Two buttons on every device.</b> A places a generator. B taps for your special (melee when a rival is next to
        you, otherwise your vehicle if you hold a voucher) and, held, fires your remote detonator. Kick, punch, disarm and
        pass happen by walking into a generator.
      </div>
      <div className="mn-legend-wrap">
        <table className="mn-legend" data-testid="controls-legend">
          <thead>
            <tr>
              <th>Action</th>
              <th>Keyboard</th>
              <th>Gamepad</th>
              <th>Touch</th>
            </tr>
          </thead>
          <tbody>
            {LEGEND_ORDER.map((id) => {
              const r = rows[id];
              return (
                <tr key={id}>
                  <th scope="row">{r.label}</th>
                  <td>{r.keyboard.map((k) => <kbd key={k}>{k}</kbd>)}</td>
                  <td>{r.gamepad.map((k) => <kbd key={k}>{k}</kbd>)}</td>
                  <td>{r.touch}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

const SUBTITLE_LABEL: Record<SubtitleMode, string> = { off: 'Off', on: 'On', large: 'Large' };
const SHAKE_LABEL: Record<ShakeSetting, string> = { auto: 'Auto', off: 'Off', subtle: 'Subtle' };

function AccessTab({ s, set }: { s: GameSettings; set: Set }) {
  return (
    <>
      <Field label="Subtitles" hint="The voice line being spoken, shown beside the arena (never over it). Large uses bigger text.">
        <div className="mn-opts">
          {(['off', 'on', 'large'] as const).map((m) => (
            <Option key={m} value={m} current={s.subtitles} label={SUBTITLE_LABEL[m]} onPick={(subtitles) => set({ subtitles })} testId={`subtitles-${m}`} />
          ))}
        </div>
      </Field>
      <Field
        label="Camera shake"
        hint="Auto: off on touch screens, subtle with a mouse. Your system's reduce-motion setting always turns it off."
      >
        <div className="mn-opts">
          {(['auto', 'off', 'subtle'] as const).map((m) => (
            <Option key={m} value={m} current={s.shake} label={SHAKE_LABEL[m]} onPick={(shake) => set({ shake })} testId={`shake-${m}`} />
          ))}
        </div>
      </Field>
      <Field label="Academy narration" hint="Spoken guidance in the Training Academy">
        <Toggle on={s.narration} label={s.narration ? 'On' : 'Off'} onChange={(narration) => set({ narration })} testId="toggle-narration" />
      </Field>
      <p className="mn-note">
        Reduced motion: when your device asks for less motion, the menus stop animating and the camera never shakes.
      </p>
    </>
  );
}

/** Restores every device preference (audio mix, voices, quality, controls, subtitles, shake ...). */
export function restoreDefaults(): void {
  audioPrefs.reset();
  commands.updateSettings(preferenceDefaults());
}

export function SettingsPanel({ initialTab = 'audio' }: { initialTab?: SettingsTab }) {
  const s = useGameStore((st) => st.settings);
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [confirm, setConfirm] = useState(false);
  const set: Set = (p) => commands.updateSettings(p);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <div className="mn-settings" data-testid="settings-panel" data-tab={tab}>
      <div className="mn-tabs" role="tablist" aria-label="Settings">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`mn-tab${tab === t.id ? ' on' : ''}`}
            data-testid={`settings-tab-${t.id}`}
            onClick={() => {
              commands.click();
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mn-panel mn-settings-body" role="tabpanel">
        {tab === 'audio' && <AudioTab s={s} set={set} />}
        {tab === 'graphics' && <GraphicsTab s={s} set={set} />}
        {tab === 'controls' && <ControlsTab s={s} set={set} />}
        {tab === 'access' && <AccessTab s={s} set={set} />}
      </div>
      <div className="mn-settings-foot">
        <button
          type="button"
          className={`mn-btn mn-secondary small${confirm ? ' danger' : ''}`}
          data-testid="settings-restore"
          onClick={() => {
            if (!confirm) {
              commands.click();
              setConfirm(true);
              return;
            }
            setConfirm(false);
            restoreDefaults();
          }}
        >
          {confirm ? 'Tap again to restore all defaults' : 'Restore defaults'}
        </button>
        <span className="mn-saved">Changes apply and save instantly</span>
      </div>
    </div>
  );
}

export function SettingsScreen() {
  return (
    <ScreenFrame
      id="settings"
      kicker="Options"
      title="Settings"
      backLabel="Close"
      actions={
        <PrimaryButton testId="settings-close" onClick={() => commands.menuBack()}>
          Save &amp; close
        </PrimaryButton>
      }
    >
      <SettingsPanel />
    </ScreenFrame>
  );
}
