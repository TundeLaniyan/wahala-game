/** Small pieces shared by the online screens. */
import type { ReactNode } from 'react';

/** Shown while the session is the in-memory fake (no real server behind the screens). */
export function TestSessionNote() {
  return (
    <span className="ro-fake" data-testid="ro-fake-note">
      Test session: no real server
    </span>
  );
}

/** HUMAN / HOST / READY / YOU / BOT label. */
export function Tag({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`ro-tag ${kind.toLowerCase()}`}>{children}</span>;
}
