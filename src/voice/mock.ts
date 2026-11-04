/**
 * An in-memory voice provider for tests and UI states. It moves no audio: it only models the session rules
 * (default muted, deafen, per-participant mute, reports, permissions from the policy, the match ending, an
 * explicit and counted microphone request). It never touches a microphone or a peer connection.
 */
import { permissionsFor } from './policy';
import type {
  MicPermission,
  VoiceMatchPhase,
  VoicePermissions,
  VoiceProvider,
  VoiceResult,
  VoiceServerFlags,
  VoiceSession,
  VoiceSessionRequest,
  VoiceSessionStatus,
} from './types';

export interface MockVoiceOptions {
  flags?: Partial<VoiceServerFlags>;
  /** What the (pretend) user answers to a microphone request. Default 'granted'. */
  micAnswer?: MicPermission;
}

export interface MockVoiceReport {
  reporterId: string;
  participantId: string;
  reason: string;
}

const ok = <T>(value: T): VoiceResult<T> => ({ ok: true, value });
const fail = (code: 'notInSession' | 'forbidden' | 'notFound', message: string): VoiceResult<never> => ({
  ok: false,
  error: { code, message },
});

export class MockVoiceProvider implements VoiceProvider {
  readonly name = 'mock';
  readonly status = 'ready' as const;
  readonly reports: MockVoiceReport[] = [];
  /** How many times any session asked for the microphone (it must only be after an explicit user action). */
  micRequests = 0;
  readonly flags: VoiceServerFlags;
  private readonly micAnswer: MicPermission;

  constructor(opts: MockVoiceOptions = {}) {
    this.flags = { voiceEnabled: true, matchWideInFreeForAll: false, ...opts.flags };
    this.micAnswer = opts.micAnswer ?? 'granted';
  }

  createSession(request: VoiceSessionRequest): Promise<VoiceResult<VoiceSession>> {
    return Promise.resolve(ok(new MockVoiceSession(this, request)));
  }

  /** @internal used by the session */
  answerMic(): MicPermission {
    this.micRequests++;
    return this.micAnswer;
  }
}

class MockVoiceSession implements VoiceSession {
  status: VoiceSessionStatus = 'idle';
  selfMuted = true;
  deafened = false;
  micPermission: MicPermission = 'unknown';
  private phase: VoiceMatchPhase;
  private readonly muted = new Set<string>();

  constructor(
    private readonly provider: MockVoiceProvider,
    private readonly request: VoiceSessionRequest,
  ) {
    this.phase = request.phase;
  }

  get permissions(): VoicePermissions {
    return permissionsFor(
      { game: this.request.game, phase: this.phase, flags: this.provider.flags },
      this.request.self,
      this.request.participants,
      { deafened: this.deafened },
    );
  }

  join(): Promise<VoiceResult<void>> {
    if (this.status === 'ended') return Promise.resolve(fail('forbidden', 'The match has ended.'));
    this.status = 'connected';
    return Promise.resolve(ok(undefined));
  }

  leave(): Promise<VoiceResult<void>> {
    this.status = 'ended';
    return Promise.resolve(ok(undefined));
  }

  private live(): boolean {
    return this.status === 'connected';
  }

  setSelfMuted(muted: boolean): VoiceResult<void> {
    if (!this.live()) return fail('notInSession', 'Join voice first.');
    // unmuting needs the right to speak AND an explicit microphone grant
    if (!muted && !this.permissions.canSpeak)
      return fail('forbidden', this.permissions.reason || 'Not allowed.');
    if (!muted && this.micPermission !== 'granted') return fail('forbidden', 'Microphone not allowed yet.');
    this.selfMuted = muted;
    return ok(undefined);
  }

  setDeafened(deafened: boolean): VoiceResult<void> {
    if (!this.live()) return fail('notInSession', 'Join voice first.');
    this.deafened = deafened;
    return ok(undefined);
  }

  setParticipantMuted(participantId: string, muted: boolean): VoiceResult<void> {
    if (!this.request.participants.some((p) => p.id === participantId))
      return fail('notFound', 'No such participant.');
    if (muted) this.muted.add(participantId);
    else this.muted.delete(participantId);
    return ok(undefined);
  }

  isParticipantMuted(participantId: string): boolean {
    return this.muted.has(participantId);
  }

  report(participantId: string, reason: string): Promise<VoiceResult<void>> {
    if (!this.request.participants.some((p) => p.id === participantId)) {
      return Promise.resolve(fail('notFound', 'No such participant.'));
    }
    this.provider.reports.push({
      reporterId: this.request.self.id,
      participantId,
      reason: reason.slice(0, 200),
    });
    return Promise.resolve(ok(undefined));
  }

  requestMicrophone(): Promise<VoiceResult<MicPermission>> {
    this.micPermission = this.provider.answerMic();
    return Promise.resolve(ok(this.micPermission));
  }

  setPhase(phase: VoiceMatchPhase): void {
    this.phase = phase;
    if (phase === 'ended' || phase === 'resultsPosted') {
      this.selfMuted = true;
      this.status = 'ended';
    }
  }

  disconnect(): void {
    this.status = 'ended';
    this.selfMuted = true;
  }
}
