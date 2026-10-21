import { useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { CHARACTERS } from '../sim';
import type { Dir } from '../sim';
import { pickupIconUrl } from '../assets/pickupIcons';
import { input } from '../app/session';
import { useGameStore } from '../app/store';
import type { ActionName } from '../input';

function DPad() {
  const [dir, setDir] = useState<Dir | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  /** Only the finger that first touched the pad steers it; a second finger cannot add phantom presses. */
  const owner = useRef<number | null>(null);
  const update = (e: RPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dead = r.width * 0.12;
    let d: Dir | null = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > dead)
      d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    setDir(d);
    input.setTouchDir(d);
  };
  const end = (e: RPointerEvent) => {
    if (owner.current !== null && e.pointerId !== owner.current) return;
    owner.current = null;
    setDir(null);
    input.setTouchDir(null);
  };
  return (
    <div
      ref={ref}
      className="dpad"
      data-testid="dpad"
      onPointerDown={(e) => {
        if (owner.current !== null) return;
        owner.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => e.pointerId === owner.current && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div className="base" />
      {(['up', 'down', 'left', 'right'] as Dir[]).map((d) => (
        <div key={d} className={`arm ${d}${dir === d ? ' on' : ''}`} data-dir={d}>
          {{ up: '▲', down: '▼', left: '◀', right: '▶' }[d]}
        </div>
      ))}
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
  if (!me || entry)
    return (
      <div className="touch">
        <DPad />
      </div>
    );
  const skill = CHARACTERS[character].skill;
  const actionLabel = me.carrying ? (me.punch ? 'THROW' : 'DROP') : me.grip ? 'CARRY' : 'PUNCH';
  return (
    <div className="touch" data-testid="touch-controls">
      <DPad />
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
