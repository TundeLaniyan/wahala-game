import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { CHARACTERS } from '../sim';
import type { Dir } from '../sim';
import { pickupIconUrl } from '../assets/pickupIcons';
import { commands, input } from '../app/session';
import { VirtualStick, stickConfigFor } from '../input/joystick';
import { useGameStore } from '../app/store';
import type { ActionName } from '../input';

/**
 * Floating thumbstick: a touch anywhere in the bottom-left activation zone becomes the stick's centre
 * and the drag picks one of the four grid directions (see `input/joystick.ts`). A quick tap that never
 * leaves the dead zone is passed through as a tap on the board, so vehicle entrances under the zone can
 * still be picked by touch.
 */
function Joystick({ entryOpen }: { entryOpen: boolean }) {
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
      className="stick-zone"
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
        input.setTouchDir(stick.current.move(e.pointerId, e.clientX, e.clientY));
        show();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      {view ? (
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
      ) : (
        <div className="stick-hint" style={{ ['--r' as string]: `${r}px` }}>
          <span>MOVE</span>
        </div>
      )}
    </div>
  );
}

function ActionButton(props: {
  cls: string;
  label: React.ReactNode;
  action: ActionName;
  testId: string;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      className={`abtn ${props.cls}${props.dim ? ' dim' : ''}`}
      data-testid={props.testId}
      onPointerDown={(e) => {
        e.preventDefault();
        input.touchPress(props.action);
      }}
    >
      <span>{props.label}</span>
    </button>
  );
}

/** Contextual on-screen buttons: only what the player can currently use is shown (Bible: no icon jungle). */
export function TouchControls() {
  const me = useGameStore((s) => s.hud?.me);
  const entry = useGameStore((s) => s.hud?.entry);
  const character = useGameStore((s) => s.settings.character);
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
  const actionLabel = me.carrying ? (me.punch ? 'THROW' : 'DROP') : me.grip ? 'CARRY' : 'PUNCH';
  return (
    <div className="touch" data-testid="touch-controls">
      <Joystick entryOpen={false} />
      <div className="actions">
        <ActionButton cls="bomb" action="place" testId="btn-place" label={<b>GENERATOR</b>} />
        <ActionButton
          cls="a"
          action="skill"
          testId="btn-skill"
          dim={!me.skillReady}
          label={skill.toUpperCase()}
        />
        {me.canAction && <ActionButton cls="b" action="action" testId="btn-action" label={actionLabel} />}
        {me.remote && (
          <ActionButton
            cls="c"
            action="detonate"
            testId="btn-detonate"
            dim={!me.hasRemoteGenerator}
            label="BOOM!"
          />
        )}
        {me.canDisarm && <ActionButton cls="d" action="disarm" testId="btn-disarm" label="DISARM" />}
        {me.voucher && (
          <ActionButton
            cls="v"
            action="vehicle"
            testId="btn-vehicle"
            label={
              <>
                <img src={pickupIconUrl('voucher', 64)} alt="" />
                {me.vehicle.toUpperCase()}
              </>
            }
          />
        )}
      </div>
    </div>
  );
}
