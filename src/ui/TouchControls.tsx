import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { CHARACTERS } from '../sim';
import type { Dir } from '../sim';
import { pickupIconUrl } from '../assets/pickupIcons';
import { StreakIcon } from './streakIcons';
import { specialLabel } from './specialLabel';
import { commands, input } from '../app/session';
import { VirtualStick, stickConfigFor } from '../input/joystick';
import { SPECIAL_HOLD_MS, inputTrace } from '../input';
import { useGameStore } from '../app/store';
import { TAP_MS, vibrate } from '../platform/haptics';
import type { HudMe } from '../app/hud';

/**
 * Floating thumbstick: a touch anywhere in the bottom-left activation zone becomes the stick's centre
 * and the drag picks one of the four grid directions (see `input/joystick.ts`). A quick tap that never
 * leaves the dead zone is passed through as a tap on the board, so a tutorial's vehicle entrances under
 * the zone can still be picked by touch.
 */
/** Settings > Control size: Large (decision NV3) scales the stick by this, and styles.css the buttons by the same. */
export const LARGE_SCALE = 1.15;

const touchClass = (large: boolean): string => (large ? 'touch large' : 'touch');

export function Joystick({ entryOpen }: { entryOpen: boolean }) {
  const zone = useRef<HTMLDivElement>(null);
  // Settings > Control size (decision NV3): Large grows the stick with the buttons
  const scale = useGameStore((s) => (s.settings.controlSize === 'large' ? LARGE_SCALE : 1));
  const stick = useRef(new VirtualStick(stickConfigFor(window.innerWidth, window.innerHeight, scale)));
  const [view, setView] = useState<{ x: number; y: number; kx: number; ky: number; dir: Dir | null } | null>(
    null,
  );
  const show = (): void => {
    const s = stick.current;
    if (!s.active || !zone.current) return setView(null);
    const r = zone.current.getBoundingClientRect();
    setView({ x: s.originX - r.left, y: s.originY - r.top, kx: s.knobX, ky: s.knobY, dir: s.dir });
  };
  const release = (): void => {
    stick.current.reset();
    input.setTouchDir(null);
    setView(null);
  };
  // a rotation or resize mid-drag invalidates the origin: drop the touch and resize the stick
  useEffect(() => {
    const onResize = (): void => {
      stick.current.config = stickConfigFor(window.innerWidth, window.innerHeight, scale);
      if (stick.current.active) release();
    };
    onResize(); // the size setting changed (or first mount): resize the stick now
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      input.setTouchDir(null);
    };
  }, [scale]);
  const end = (e: RPointerEvent): void => {
    const result = stick.current.end(e.pointerId, e.timeStamp);
    if (!result) return;
    inputTrace.record({
      k: 'raw',
      ms: Math.round(e.timeStamp),
      type: e.type === 'pointerup' ? 'up' : 'cancel',
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
    });
    input.setTouchDir(null);
    setView(null);
    if (result.tap && entryOpen && e.type === 'pointerup') commands.pickEntry(e.clientX, e.clientY);
  };
  const r = stick.current.config.radius;
  return (
    <div
      ref={zone}
      className={`stick-zone${view ? ' live' : ''}`}
      data-testid="stick-zone"
      data-dir={view?.dir ?? ''}
      onPointerDown={(e) => {
        if (!stick.current.begin(e.pointerId, e.clientX, e.clientY, e.timeStamp)) return;
        inputTrace.record({
          k: 'raw',
          ms: Math.round(e.timeStamp),
          type: 'down',
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
        });
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        input.touchActive();
        show();
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== stick.current.pointerId) return;
        inputTrace.record({
          k: 'raw',
          ms: Math.round(e.timeStamp),
          type: 'move',
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
        });
        input.setTouchDir(stick.current.move(e.pointerId, e.clientX, e.clientY), stick.current.wish);
        show();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div
        className={`stick-hint${view ? ' live' : ''}`}
        data-testid="stick-pad"
        style={{ ['--r' as string]: `${r}px` }}
      >
        {(['up', 'down', 'left', 'right'] as Dir[]).map((d) => (
          <i key={d} className={`stick-tick ${d}${view?.dir === d ? ' on' : ''}`} />
        ))}
        <span>MOVE</span>
        <small>press anywhere on this pad</small>
      </div>
      {view && (
        <div className="stick" style={{ left: view.x, top: view.y, ['--r' as string]: `${r}px` }}>
          <div className="stick-base">
            {(['up', 'down', 'left', 'right'] as Dir[]).map((d) => (
              <i key={d} className={`stick-tick ${d}${view.dir === d ? ' on' : ''}`} />
            ))}
          </div>
          <div
            className={`stick-knob${view.dir ? ' on' : ''}`}
            style={{ transform: `translate(calc(-50% + ${view.kx}px), calc(-50% + ${view.ky}px))` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Button A (GENERATOR): tap = place a generator, HOLD = set off your remote generators while one is live (a
 * ring fills over the hold time and the label reads HOLD: BOOM!). One finger = one press; several fingers
 * never double-place within a tick. The input layer alone decides tap vs hold (input/specialHold.ts); with no
 * live remote generator a press places at once, exactly as before.
 */
function GeneratorButton({
  remoteReady,
  full,
  quickHands,
}: {
  remoteReady: boolean;
  full: boolean;
  quickHands: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const [pressed, setPressed] = useState(false);
  const fingers = useRef(new Set<string>());
  // same safeguard as B: a finger still on A when it leaves the HUD must not leave A "down" in the input layer
  useEffect(() => {
    const held = fingers.current;
    return () => {
      for (const source of held) input.touchUp('place', source);
      held.clear();
    };
  }, []);
  const up = (e: RPointerEvent): void => {
    fingers.current.delete(`p${e.pointerId}`);
    input.touchUp('place', `p${e.pointerId}`);
    setHolding(false);
    setPressed(fingers.current.size > 0);
  };
  // visual state only: pressed = a finger is down, holding = the remote ring is filling, remote = a remote
  // generator is waiting, disabled = every generator is already out (a press would do nothing)
  const disabled = full && !remoteReady;
  const state = holding
    ? 'holding'
    : pressed
      ? 'pressed'
      : remoteReady
        ? 'remote'
        : disabled
          ? 'disabled'
          : 'idle';
  return (
    <button
      type="button"
      className={`abtn bomb${holding ? ' holding' : ''}${pressed ? ' pressed' : ''}${disabled ? ' dim' : ''}`}
      data-testid="btn-place"
      data-state={state}
      aria-disabled={disabled || undefined}
      data-remote={remoteReady ? 'ready' : ''}
      aria-label={`Generator${remoteReady ? ', hold to set off remote' : ''}`}
      style={{ ['--hold-ms' as string]: `${SPECIAL_HOLD_MS}ms` }}
      onPointerDown={(e) => {
        e.preventDefault();
        fingers.current.add(`p${e.pointerId}`);
        input.touchDown('place', `p${e.pointerId}`);
        vibrate(TAP_MS, useGameStore.getState().settings.vibration === 'on'); // optional tick (NV4)
        setPressed(true);
        if (remoteReady) setHolding(true);
        try {
          // keep receiving this finger's release even if it slides off the button
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* not an active pointer (synthetic event): the release still arrives on the button */
        }
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
    >
      {remoteReady && <i className="hold-ring" aria-hidden />}
      <span>
        <img src={pickupIconUrl('socket', 64)} alt="" />
        <b>GENERATOR</b>
        {remoteReady && <small data-testid="btn-place-hold">HOLD: BOOM!</small>}
        {quickHands && !remoteReady && <small data-testid="btn-place-lay">HOLD: LAY</small>}
      </span>
    </button>
  );
}

/**
 * Button B: tap = the context special (melee an adjacent rival, else the vehicle); HOLD still sets off the
 * remote as well (kept from V2, a ring fills over the hold time). The press and the
 * release both go to the input layer, which alone decides tap vs hold (input/specialHold.ts).
 */
function SpecialButton({ me, skill }: { me: HudMe; skill: string }) {
  const [holding, setHolding] = useState(false);
  const [pressed, setPressed] = useState(false);
  // fingers on B that have not been released yet (input sources)
  const fingers = useRef(new Set<string>());
  // B leaves the HUD while a finger is still on it (the player is knocked out, a Deathmatch respawn wait):
  // that finger's release lands on a detached button that React never hears from, so release it here.
  // Otherwise the input layer keeps B "down" and swallows every later press until the input is cleared.
  useEffect(() => {
    const held = fingers.current;
    return () => {
      for (const source of held) input.touchUp('special', source);
      held.clear();
    };
  }, []);
  const label = specialLabel(me, skill);
  const remoteReady = me.remote && me.hasRemoteGenerator;
  const up = (e: RPointerEvent): void => {
    fingers.current.delete(`p${e.pointerId}`);
    input.touchUp('special', `p${e.pointerId}`);
    setHolding(false);
    setPressed(fingers.current.size > 0);
  };
  // visual state only (see GeneratorButton); B stays pressable when it has nothing to do, exactly as before
  const state = holding
    ? 'holding'
    : pressed
      ? 'pressed'
      : remoteReady
        ? 'remote'
        : label.live
          ? 'idle'
          : 'disabled';
  return (
    <button
      type="button"
      className={`abtn special${label.live ? '' : ' dim'}${label.icon && label.icon !== 'knockdown' && label.icon !== 'localChampion' ? ' vehicle' : ''}${label.icon === 'knockdown' || label.icon === 'localChampion' ? ' knockdown' : ''}${holding ? ' holding' : ''}${pressed ? ' pressed' : ''}`}
      data-testid="btn-special"
      data-state={state}
      aria-disabled={!label.live || undefined}
      data-special={me.special ?? ''}
      data-remote={remoteReady ? 'ready' : ''}
      aria-label={`${label.text}${remoteReady ? ', hold to set off remote' : ''}`}
      style={{ ['--hold-ms' as string]: `${SPECIAL_HOLD_MS}ms` }}
      onPointerDown={(e) => {
        e.preventDefault();
        fingers.current.add(`p${e.pointerId}`);
        input.touchDown('special', `p${e.pointerId}`);
        vibrate(TAP_MS, useGameStore.getState().settings.vibration === 'on'); // optional tick (NV4)
        setPressed(true);
        if (remoteReady) setHolding(true);
        try {
          // keep receiving this finger's release even if it slides off the button
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* not an active pointer (synthetic event): the release still arrives on the button */
        }
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
    >
      {remoteReady && <i className="hold-ring" aria-hidden />}
      <span>
        {label.icon === 'knockdown' ? (
          <StreakIcon kind="globalKnockdown" size={64} />
        ) : label.icon === 'localChampion' ? (
          <StreakIcon kind="localChampion" size={64} />
        ) : label.icon ? (
          <img src={pickupIconUrl(label.icon === 'generator' ? 'socket' : 'voucher', 64)} alt="" />
        ) : null}
        {label.text}
        {label.sub && <small data-testid="btn-special-sub">{label.sub}</small>}
        {remoteReady && <small data-testid="btn-special-hold">HOLD: BOOM!</small>}
      </span>
    </button>
  );
}

/**
 * V2 touch layout: a large movement pad on the left and EXACTLY two action buttons in the lower right, always
 * in the same place: the first action (GENERATOR with its generator icon, HOLD = remote) is the lower-left button
 * of the cluster and the second (its label follows what it would do: the vehicle, or the fighter's own ability)
 * sits diagonally above and to the right of it, so the two never stack and a thumb rolls from one to the other.
 * The buttons carry the action's own name and icon, never a controller letter (decision MC3).
 * Contact abilities (kick / punch / disarm / pass) have no button: walk into a generator.
 */
export function TouchControls() {
  const me = useGameStore((s) => s.hud?.me);
  const entry = useGameStore((s) => s.hud?.entry);
  // the local player's own character (a tutorial may play someone other than the saved choice)
  const character = useGameStore(
    (s) => s.hud?.players.find((p) => p.isLocal)?.characterId ?? s.settings.character,
  );
  const localAlive = useGameStore((s) => s.hud?.localAlive ?? true);
  const large = useGameStore((s) => s.settings.controlSize === 'large');
  // a classic raid uses the same floating thumbstick as every other match (decision TN1): the input layer quantises the
  // thumb to ONE cardinal direction (`input.isCardinalOnly`, input/inputMode.ts), so the grid stays strict
  // out of the match: nothing to steer, and the stick zone must not cover the spectator buttons
  if (!localAlive) return null;
  if (!me || entry)
    return (
      <div className={touchClass(large)} data-size={large ? 'large' : 'normal'}>
        <Joystick entryOpen={!!entry} />
      </div>
    );
  const skill = CHARACTERS[character].skill;
  return (
    <div className={touchClass(large)} data-testid="touch-controls" data-size={large ? 'large' : 'normal'}>
      <Joystick entryOpen={false} />
      <div className="actions">
        <GeneratorButton
          remoteReady={me.remote && me.hasRemoteGenerator}
          full={me.active >= me.capacity}
          quickHands={!!me.rewards?.quickHands}
        />
        <SpecialButton me={me} skill={skill} />
      </div>
    </div>
  );
}
