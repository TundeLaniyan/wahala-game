/**
 * The only voice provider that ships: it is always disabled and does nothing. It never asks for a microphone,
 * never opens a connection and never allocates an audio resource.
 */
import type { VoiceProvider, VoiceResult, VoiceSession } from './types';

const DISABLED = { code: 'disabled', message: 'Voice chat is not available yet.' } as const;

export const NullVoiceProvider: VoiceProvider = {
  name: 'null',
  status: 'disabled',
  createSession(): Promise<VoiceResult<VoiceSession>> {
    return Promise.resolve({ ok: false, error: DISABLED });
  },
};
