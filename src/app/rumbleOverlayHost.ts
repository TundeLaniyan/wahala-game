/**
 * The one bit of online state the MAIN bundle reads: "an online match (or its results) is on screen", so App.tsx can mount
 * the lazily loaded overlay (status chip, reconnect banner, results) ONLY while one is. It holds no online code and no
 * connection: the online controller (src/app/rumbleOnline.ts, online chunk) writes it. Default builds never write it.
 */
import { create } from 'zustand';

export const useRumbleOverlay = create<{ active: boolean }>(() => ({ active: false }));

export function setRumbleOverlayActive(active: boolean): void {
  if (useRumbleOverlay.getState().active !== active) useRumbleOverlay.setState({ active });
}
