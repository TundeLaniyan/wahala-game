/** Best-effort fullscreen + landscape lock for phones. Must be called from a user gesture; every failure is ignored. */
export async function enterImmersiveMode(): Promise<void> {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen)
      await el.requestFullscreen({ navigationUI: 'hide' });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation?.lock?.('landscape');
  } catch {
    /* unsupported (e.g. iPhone Safari) or denied: the rotate-device overlay covers portrait */
  }
}
