# iOS viewport: the enlarged landscape match

Branch `claude/wahala-ios-viewport`, from production `acaeae7`. Decisions IV1-IV6 (`docs/DECISIONS.md`).

**Status: fixed and tested in emulation only. Confirmation on a real iPhone (Safari and Chrome) is pending.** No WebKit
browser is available on the build machine; every browser check below ran in Chromium.

## The report

On an iPhone 17, in landscape during a match, the game occasionally becomes enlarged or no longer fits the screen, in
both Safari and Chrome, and cannot reliably be brought back. Android is fine. On iOS every browser is WebKit, so this is
treated as WebKit behaviour.

## Browser zoom or the game's own scaling?

The game's own scaling cannot enlarge the match:

- the standard-match camera is the fixed whole-arena camera (`render/cameraModes.ts` mode `arena`): no follow, no zoom;
- the canvas is sized by a `ResizeObserver` on its own CSS box (`app/session.ts` `sizeCanvas` -> `renderer.resize`), so
  it always matches its element; `devicePixelRatio` only changes the drawing buffer (capped by the quality preset), never
  the CSS size;
- the HUD rail is sized from `renderer.boardScreenCorners()` and the canvas position.

What does enlarge a page, persistently, is the browser's zoom (the visual viewport scale). That is the cause.

## Causes found (most likely first)

1. **WebKit ignores `user-scalable=no` and `maximum-scale=1` for the player's own zoom** (an accessibility rule since
   iOS 10). The page relied on the viewport tag plus `touch-action: none` on `html, body, #root`, with no `gesturestart`
   handler and no `visualViewport` handling. Gaps through which a zoom can still start:
   - WebKit computes the effective `touch-action` only up to the nearest scroll container (`overflow: auto/scroll`) and
     resets it to `auto` there. Every scroller without its own value (the City Rumble roster list over a live match, the
     results list, several menu, campaign and Academy lists) accepted a double-tap zoom and a pinch;
   - nothing cancelled Safari's own `gesturestart` / `gesturechange` events or a two-finger `touchmove` on the document;
   - fast repeated taps on the controls (two thumbs on the pad and A/B) are exactly the pattern WebKit's double-tap and
     pinch recognisers look at.
2. **Once zoomed, there was no way back.** The whole game surface is `touch-action: none`, so a player cannot pinch back
   out, and nothing in the code noticed `visualViewport.scale > 1`. The match stays enlarged and cropped until the tab
   is reloaded: the "cannot be returned to its intended view" part of the report.
3. **Rotation and toolbar changes read stale sizes.** WebKit's first `resize` / `orientationchange` after a rotation can
   carry the old sizes; the canvas follows its own `ResizeObserver`, but the HUD rail, the thumbstick and the mission dock
   measured only on `resize` and from `window.innerWidth/innerHeight` (which WebKit reports for the visible area). No
   re-read happened once the sizes settled, and nothing listened to `visualViewport` at all.
4. **Landscape text inflation.** Without `-webkit-text-size-adjust`, iPhone Safari enlarges text when the phone turns to
   landscape, which grows the HUD text and can push HUD blocks out of their places.
5. **Page scroll / overscroll.** `overflow: hidden` and `overscroll-behavior: none` were already set; a rotation can still
   leave the document offset, and nothing put it back. Low likelihood, now guarded.

Checked and not a cause (already guarded):

- **Focus zoom** (iOS zooms on a focused input under 16 px): `maximum-scale=1` stops automatic focus zoom on iOS, and
  there are no text inputs during a match (the range sliders live in Settings).
- **Fullscreen** (`app/fullscreen.ts` `enterImmersiveMode`): an iPhone has no element fullscreen and no orientation lock;
  the calls are absent there and every failure is caught. It cannot zoom the page. (On Android it can: fullscreen changes
  are now a refit trigger.)
- **Safe areas**: `viewport-fit=cover` and `env(safe-area-inset-*)` on the HUD and controls; unchanged.
- **`100vh`**: not used for layout (only `vh` inside `clamp()`s), so the toolbar's `vh` difference does not resize the
  game root.
- **Text selection and callouts** on the controls: already `user-select: none` and `-webkit-touch-callout: none`.

## What changed

Render / UI / input-surface code only. No sim, AI, camera, rule or input-timing change; `input/moveGate.ts` and the
assist rules are untouched; there are still exactly two action buttons.

- **`src/platform/viewport.ts` (new): the viewport guard**, installed by `app/session.ts` `mount` and driven by the store
  (`match` = a match is on screen, `active` = it is being played, not paused).
  - While a match is played: Safari's `gesturestart/change/end` are cancelled; a two-finger `touchmove` is cancelled; a
    one-finger `touchmove` is cancelled unless it started in a real scroller (the Academy lesson panel keeps scrolling);
    a second touch release within 350 ms is cancelled unless it is on a click control (pause, mute, menus), which kills
    WebKit's double-tap zoom without touching the pad's or A/B's pointer events (they fire before `touchend`); `dblclick`
    is cancelled. These document listeners are non-passive only during play, so menus keep fast scrolling.
  - After any `resize`, `orientationchange`, `visualViewport` resize / scroll, `screen.orientation` change or
    `fullscreenchange`, the viewport is read now, on the next frame and again at 120 / 350 / 800 ms; when the sizes moved
    since the last event, a `resize` is re-sent so the HUD rail, the thumbstick and the mission dock measure again. A
    scrolled page is put back to 0, 0 during a match.
  - **Recovery when the page is zoomed anyway** (`visualViewport.scale > 1.01` during a match): the game root is moved to
    the visual viewport's offset and scaled by 1 / zoom (`html[data-vv-fit]`, `--vv-left/top/scale`). The match is then
    drawn at its normal size over exactly the visible area: the whole board, the HUD and both controls, which hit where
    they are drawn. The root keeps its layout size, so the canvas, `vw`/`vh` and the HUD do not reflow and no state is
    touched. Measuring code maps client coordinates back into the root (`rootRect`, `clientToRoot`, `rootSize`): the
    board position published for the HUD, the HUD rail, the mission dock, the compass, the minimap and the thumbstick
    (identity when nothing is zoomed, so nothing changes in normal play).
  - **Escape**: when the page is zoomed and the match is paused (or on the results / menus), `html`, `body` and `#root`
    allow `pinch-zoom`, so the player can pinch back out from the pause menu; the layout returns to normal by itself.
- **`src/ui/styles.css`**: `:where(*) { touch-action: manipulation }` (zero specificity) so a scroller without its own
  value never accepts a double-tap zoom (every explicit value still wins; on Android the effective values are the same as
  before); `-webkit-text-size-adjust: 100%` (not `none`); `overscroll-behavior: none` on the game root; the fit and
  escape rules. **`src/ui/RumbleHud.css`**: the roster list is `pan-y` + `overscroll-behavior: contain`.
- **`index.html`** is unchanged: `maximum-scale=1, user-scalable=no` stay (Android honours them and they stop iOS focus
  zoom), but nothing relies on them alone. `shrink-to-fit=no` was not added: Chromium logs it as a console error, which
  several specs treat as a failure, and the tests check instead that the page never overflows.

### Accessibility

- Browser text / page zoom (Safari's aA menu, Chrome's text zoom) still works: `text-size-adjust: 100%` keeps the user's
  setting and only stops the automatic landscape inflation; the layout is responsive to any viewport size.
- Menus keep the browser's behaviour: pinch is handled as before (blocked by the existing root `touch-action: none`
  except inside lists), only double-tap zoom in lists is gone. The gesture guard is active only while a match is played.
- A zoomed page can always be pinched back out outside active play.

## Tests

- `tests/ui/ios-viewport.test.ts` (Vitest, 10 tests): the pure fit (`viewportFit`, epsilon, bad numbers), the exact
  client -> root mapping, the rapid-repeat rule; the guard on a fake window: gestures / two-finger moves / pans / rapid
  repeats cancelled only during play, the counter-scale written and removed, menus never transformed, late rotation sizes
  re-read and `resize` re-sent once, a scrolled page put back.
- `e2e/ios-viewport.spec.ts` (Playwright, mobile project). **Engine: Chromium** (`/opt/pw-browsers/chromium`, Playwright
  build 1243; no WebKit build exists under `/opt/pw-browsers`), emulating an iPhone 17 in landscape: iPhone Safari user
  agent, 874 x 402, `isMobile`, `hasTouch`, DPR 3, no element fullscreen, and the viewport tag served without
  `maximum-scale` / `user-scalable=no` so Chromium allows user zoom the way WebKit does. Real touches via CDP
  `Input.dispatchTouchEvent`. Covered: repeated rapid taps and double taps on the pad, A and B (A really lays a
  generator); two-finger pinches across the pad and the buttons; a toolbar collapse (874 x 360 -> 874 x 402) mid-match;
  landscape -> portrait -> landscape; a stuck zoom injected with `Emulation.setPageScaleFactor(1.6)` (counter-scaled
  match: A laid by a touch where it is drawn, the stick appears under the thumb and steers, then the zoom removed and the
  normal layout back with the match still playing); Safari `gesturestart` cancelled in play and not when paused. After
  each step: page scale, no scroll, no document overflow, the canvas exactly covers the visible area, every HUD block and
  control inside it, and A, B and the pad are the element under five points of their own drawn boxes. Plus an Android
  (Pixel UA, 915 x 412, the real viewport tag) regression of taps, a pinch and a rotation.
- Existing: `e2e/mobile-hud-fit.spec.ts`, `e2e/touch-layout.spec.ts`, `e2e/mobile.spec.ts`; the input, HUD, app and
  architecture unit tests.

What emulation cannot prove: Chromium is not WebKit. It honours `touch-action` across scroll containers, has no
`gesture*` events and keeps `window.innerWidth` at the layout width when zoomed. The WebKit-specific paths (gesture
cancel, scroller touch-action reset, innerWidth under zoom) are covered by unit tests and code review only.

## Remaining real-device risks

- WebKit may still start a zoom through a path not covered here (for example an accessibility zoom, or a future iOS
  change to touch-action handling); the counter-scale and the pause-menu escape are the safety net.
- The counter-scale assumes WebKit's `visualViewport.offsetLeft/Top` are relative to the same layout viewport that
  positions `position: fixed` (true per the spec and current WebKit); if not, the fitted match would sit offset.
- Pointer events and `touchend` ordering: the double-tap guard assumes WebKit dispatches pointer events before the touch
  event (current behaviour); if not, a rapid second tap on A/B could lose its `pointerup` (the press itself is never lost:
  it is taken on `pointerdown`).
- Late size reads stop 800 ms after the last event; a slower WebKit rotation would wait for the next resize.

To confirm on the iPhone 17: Safari and Chrome, a landscape Classic match and a City Rumble, hammer A/B with two thumbs,
double-tap the pad, pinch on the board, rotate twice, collapse the toolbar by swiping; the match must never enlarge. Then
zoom from a menu list (if possible), start a match: it must show whole; pause and pinch out: normal again.
