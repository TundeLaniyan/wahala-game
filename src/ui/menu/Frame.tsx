/**
 * Building blocks shared by every menu screen: the screen frame (top bar with Back and the title; scrollable
 * body; action bar with the main button), buttons, option chips and toggles.
 */
import type { ReactNode } from 'react';
import { commands } from '../../app/session';
import type { MenuScreen } from '../../app/menu';

export function ScreenFrame(props: {
  id: MenuScreen;
  kicker: string;
  title: string;
  /** Back / Close in the top bar (default: one screen back). */
  onBack?: () => void;
  backLabel?: string;
  /** Right-hand side of the action bar (the main button). */
  actions?: ReactNode;
  /** Left side of the action bar (secondary info, e.g. the current choice). */
  status?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`mn-screen mn-screen-${props.id} ${props.className ?? ''}`}
      data-testid={`menu-${props.id}`}
    >
      <header className="mn-top">
        <button
          type="button"
          className="mn-back"
          data-testid="menu-back"
          onClick={props.onBack ?? (() => commands.menuBack())}
        >
          <span aria-hidden>‹</span> {props.backLabel ?? 'Back'}
        </button>
        <div className="mn-heading">
          <small>{props.kicker}</small>
          <h2>{props.title}</h2>
        </div>
      </header>
      <div className="mn-body">{props.children}</div>
      {(props.actions || props.status) && (
        <footer className="mn-foot">
          <div className="mn-status">{props.status}</div>
          <div className="mn-actions">{props.actions}</div>
        </footer>
      )}
    </section>
  );
}

export function PrimaryButton(props: {
  children: ReactNode;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`mn-btn mn-primary ${props.className ?? ''}`}
      data-testid={props.testId}
      disabled={props.disabled}
      data-autofocus={props.autoFocus ? '' : undefined}
      onClick={props.onClick}
    >
      {props.children}
      <span className="mn-arrow" aria-hidden>
        →
      </span>
    </button>
  );
}

export function SecondaryButton(props: {
  children: ReactNode;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
  tone?: 'danger';
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`mn-btn mn-secondary${props.tone === 'danger' ? ' danger' : ''} ${props.className ?? ''}`}
      data-testid={props.testId}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

/** One option of a segmented choice (fighters count, length, quality ...). */
export function Option<T extends string | number | boolean>(props: {
  value: T;
  current: T;
  label: ReactNode;
  onPick: (v: T) => void;
  testId?: string;
  title?: string;
}) {
  const on = props.value === props.current;
  return (
    <button
      type="button"
      className={`chip mn-opt${on ? ' on' : ''}`}
      data-testid={props.testId}
      aria-pressed={on}
      title={props.title}
      onClick={() => {
        commands.click();
        props.onPick(props.value);
      }}
    >
      {props.label}
    </button>
  );
}

/** An on / off switch row. */
export function Toggle(props: {
  on: boolean;
  label: ReactNode;
  hint?: ReactNode;
  onChange: (on: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      className={`mn-toggle${props.on ? ' on' : ''}`}
      data-testid={props.testId}
      onClick={() => {
        commands.click();
        props.onChange(!props.on);
      }}
    >
      <span className="mn-toggle-text">
        <b>{props.label}</b>
        {props.hint && <small>{props.hint}</small>}
      </span>
      <i className="mn-switch" aria-hidden />
    </button>
  );
}

/** A labelled settings group: label on the left (or above on phones), controls on the right. */
export function Field(props: { label: ReactNode; hint?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <div className="mn-field" data-testid={props.testId}>
      <div className="mn-field-label">
        <b>{props.label}</b>
        {props.hint && <small>{props.hint}</small>}
      </div>
      <div className="mn-field-ctl">{props.children}</div>
    </div>
  );
}
