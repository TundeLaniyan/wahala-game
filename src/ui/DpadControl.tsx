import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import type { Dir } from '../sim';
import { input } from '../app/session';
import { CROSS_DIRS, CrossPad, crossLayout } from '../input';
import './DpadControl.css';

const LABEL: Record<Dir, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
};

/**
 * The raid CROSS control (docs/RAID_PRESENTATION.md, decisions RR6, RR7): four large arrow buttons in the lower-left,
 * the movement control of a classic raid on a touch device. MOVEMENT only - the two action buttons stay on the right,
 * unchanged. Cardinal output only: one finger per arrow, the newest held arrow wins, a finger that slides onto another
 * arrow switches to it, and nothing ever sends two directions or a diagonal (`input/dpad.ts`, tested). The direction goes
 * to `InputManager.setTouchDir`, so the move gate gives one tile per press and repeats at the step cadence while held.
 */
export function CrossControl() {
  const pad = useRef(new CrossPad());
  const [dir, setDir] = useState<Dir | null>(null);
  const [button, setButton] = useState(
    () => crossLayout({ width: window.innerWidth, height: window.innerHeight }).button,
  );
  const send = (d: Dir | null): void => {
    setDir(d);
    if (d !== null) input.touchActive();
    input.setTouchDir(d);
  };
  useEffect(() => {
    const onResize = (): void => {
      setButton(crossLayout({ width: window.innerWidth, height: window.innerHeight }).button);
      pad.current.reset();
      send(null);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      pad.current.reset();
      input.setTouchDir(null);
    };
  }, []);
  const up = (e: RPointerEvent): void => {
    if (e.type === 'lostpointercapture' && !pad.current.active) return;
    send(pad.current.release(e.pointerId));
  };
  return (
    <div
      className={`cross${dir ? ' live' : ''}`}
      data-testid="cross-control"
      data-dir={dir ?? ''}
      role="group"
      aria-label="Movement"
      style={{ ['--cb' as string]: `${button}px` }}
    >
      {CROSS_DIRS.map((d) => (
        <button
          key={d}
          type="button"
          className={`cross-btn ${d}${dir === d ? ' on' : ''}`}
          data-testid={`cross-${d}`}
          data-dir={d}
          aria-label={LABEL[d]}
          onPointerDown={(e) => {
            e.preventDefault();
            send(pad.current.press(e.pointerId, d));
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* a synthetic pointer: the release still arrives on the button */
            }
          }}
          onPointerMove={(e) => {
            if (!pad.current.active) return;
            // a captured finger keeps reporting on the arrow it landed on: find the arrow under it
            const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
            const hit = under?.closest<HTMLElement>('.cross-btn')?.dataset.dir as Dir | undefined;
            const before = pad.current.dir;
            const next = pad.current.slide(e.pointerId, hit ?? null);
            if (next !== before) send(next);
          }}
          onPointerUp={up}
          onPointerCancel={up}
          onLostPointerCapture={up}
        >
          <i aria-hidden />
        </button>
      ))}
    </div>
  );
}
