import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { CHARACTERS, VEHICLE_DEFS } from '../sim';
import type { Dir } from '../sim';
import { pickupIconUrl } from '../assets/pickupIcons';
import { commands, input } from '../app/session';
import { VirtualStick, stickConfigFor } from '../input/joystick';
import { SPECIAL_HOLD_MS } from '../input';
import { useGameStore } from '../app/store';
import type { HudMe } from '../app/hud';

/**
 * Floating thumbstick: a touch anywhere in the bottom-left activation zone becomes the stick's centre
 * and the drag picks one of the four grid directions (see `input/joystick.ts`). A quick tap that never
 * leaves the dead zone is passed through as a tap on the board, so a tutorial's vehicle entrances under
 * the zone can still be picked by touch.
 */
export function Joystick({ entryOpen }: { entryOpen: boolean }) {
  const zone = useRef<HTMLDivElement>(null);
  const stick = useRef(new VirtualStick(stickConfigFor(window.innerWidth, window.innerHeight)));
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
      stick.current.config = stickConfigFor(window.innerWidth, window.innerHeight);
      if (stick.current.active) release();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      input.setTouchDir(null);
    };
  }, []);
  const end = (e: RPointerEvent): void => {
    const result = stick.current.end(e.pointerId, e.timeStamp);
    if (!result) return;
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
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        input.touchActive();
        show();
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== stick.current.pointerId) return;
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

/** What button B does right now: its label (the position and look never change). */
export function specialLabel(
  me: HudMe,
  skill: string,
): { text: string; icon: 'voucher' | null; live: boolean } {
  if (me.special === 'vehicle')
    return { text: VEHICLE_DEFS[me.vehicle].name.toUpperCase(), icon: 'voucher', live: true };
  if (me.special === 'melee') return { text: skill.toUpperCase(), icon: null, live: me.skillReady };
  return { text: skill.toUpperCase(), icon: null, live: false };
}

/**
 * Button A (GENERATOR): tap = place a generator, HOLD = set off your remote generators while one is live (a
 * ring fills over the hold time and the label reads HOLD: BOOM!). One finger = one press; several fingers
 * never double-place within a tick. The input layer alone decides tap vs hold (input/specialHold.ts); with no
 * live remote generator a press places at once, exactly as before.
 */
function GeneratorButton({ remoteReady, full }: { remoteReady: boolean; full: boolean }) {
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
      aria-label={`A: Generator${remoteReady ? ', hold to set off remote' : ''}`}
      style={{ ['--hold-ms' as string]: `${SPECIAL_HOLD_MS}ms` }}
      onPointerDown={(e) => {
        e.preventDefault();
        fingers.current.add(`p${e.pointerId}`);
        input.touchDown('place', `p${e.pointerId}`);
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
      <em className="abtn-key" aria-hidden>
        A
      </em>
      <span>
        <b>GENERATOR</b>
        {remoteReady && <small data-testid="btn-place-hold">HOLD: BOOM!</small>}
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
      className={`abtn special${label.live ? '' : ' dim'}${label.icon ? ' vehicle' : ''}${holding ? ' holding' : ''}${pressed ? ' pressed' : ''}`}
      data-testid="btn-special"
      data-state={state}
      aria-disabled={!label.live || undefined}
      data-special={me.special ?? ''}
      data-remote={remoteReady ? 'ready' : ''}
      aria-label={`B: ${label.text}${remoteReady ? ', hold to set off remote' : ''}`}
      style={{ ['--hold-ms' as string]: `${SPECIAL_HOLD_MS}ms` }}
      onPointerDown={(e) => {
        e.preventDefault();
        fingers.current.add(`p${e.pointerId}`);
        input.touchDown('special', `p${e.pointerId}`);
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
      <em className="abtn-key" aria-hidden>
        B
      </em>
      <span>
        {label.icon && <img src={pickupIconUrl('voucher', 64)} alt="" />}
        {label.text}
        {remoteReady && <small data-testid="btn-special-hold">HOLD: BOOM!</small>}
      </span>
    </button>
  );
}

/**
 * V2 touch layout: a large movement pad on the left and EXACTLY two action buttons in the lower right, always
 * in the same place: A (GENERATOR, HOLD = remote) in the corner and B (SPECIAL, its label follows what it would
 * do) diagonally above and to its left, so the two never stack and a thumb rolls from one to the other.
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
  // out of the match: nothing to steer, and the stick zone must not cover the spectator buttons
  if (!localAlive) return null;
  if (!me || entry)
    return (
      <div className="touch">
        <Joystick entryOpen={!!entry} />
      </div>
    );
  const skill = CHARACTERS[character].skill;
  return (
    <div className="touch" data-testid="touch-controls">
      <Joystick entryOpen={false} />
      <div className="actions">
        <GeneratorButton remoteReady={me.remote && me.hasRemoteGenerator} full={me.active >= me.capacity} />
        <SpecialButton me={me} skill={skill} />
      </div>
    </div>
  );
}
