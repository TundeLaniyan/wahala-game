/**
 * Registers the offline cache worker (src/platform/sw/sw.template.js, docs/MOBILE_PERFORMANCE.md).
 *
 *   - production builds only (`import.meta.env.PROD`): the dev server and `vite preview` of tests never run a worker,
 *     and browsers under automation (`navigator.webdriver`, i.e. the Playwright suite) skip it unless `?sw` asks for it,
 *     so the existing browser tests keep exercising the plain network path;
 *   - `?nosw` unregisters any worker and clears its cache (an escape hatch for a player or a support session);
 *   - never throws: no worker support, a blocked registration or private mode simply leave the game as it was.
 */
export function registerOfflineCache(win: Window = window): void {
  const nav = win.navigator;
  if (!('serviceWorker' in nav)) return;
  const params = new URLSearchParams(win.location.search);
  const base = import.meta.env.BASE_URL;
  if (params.has('nosw')) {
    void nav.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => win.caches?.delete('wahala-assets-v1'))
      .catch(() => undefined);
    return;
  }
  const wanted = params.has('sw') || (import.meta.env.PROD && !nav.webdriver);
  if (!wanted) return;
  const register = (): void => {
    nav.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined);
  };
  // after load: registering must never compete with the game's own start-up transfers
  if (win.document.readyState === 'complete') register();
  else win.addEventListener('load', register, { once: true });
}
