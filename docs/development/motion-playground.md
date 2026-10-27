# Cozy Commander motion playground

An isolated experiment for #135 and the PO feedback on PR #136. This does **not**
change `docs/product/frontend-redesign.md` or implement #134. Production adoption
requires a separate PO decision/specification. No production routes, GameEditor,
game details, backend, authentication or persistence are involved.

## Open locally

```sh
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173/dev/lounge.html** (or the private forwarded Vite URL).
No backend/login is needed. The ordinary build imports/emits neither this HTML nor
its code/assets. `/dev/theme.html` remains separate. Do not add either to build inputs.

## Interaction implementation

- No new dependencies. MUI and the existing theme; exploratory CSS is imported only
  by the development entry.
- Only the grip has `touch-action: none` and pointer capture. Text/outside areas retain
  native touch scrolling. A 6px activation distance avoids converting taps to drags.
  Unchanged drops never notify the parent or reset confirmed selection.
- ResizeObserver measures unequal card dimensions. A fixed whole-card overlay tracks
  viewport coordinates; compacted-list midpoint thresholds determine insertion.
  CSS transforms preview reflow before drop, independent of animated DOM bounds.
- A valid release commits insertion immediately, but retains the same whole-card
  overlay for a 260ms measured landing. A layout effect records the new keyed DOM
  rectangles and inverts each intervening card's pre-commit visual displacement
  (including an unfinished live preview). Web Animations then glide those cards to
  zero displacement and move/derotate the overlay onto the exact measured target.
  The real dragged card stays hidden until the overlay finishes; there is no
  double visual, remount gap or list collapse. No new motion library is used.
- A new drag, keyboard action, changed order, actual scroll, resize, visibility
  change, blur, unmount or live reduced-motion change retires landing effects.
  Post-release interruptions retain the already committed order; cancellation
  before release still restores the original order. Reduced motion skips landing
  entirely. Keyboard alternatives retain their existing instant focus behavior.
- An active gesture owns one requestAnimationFrame edge-scroll loop. Within 80px of
  the visible viewport edge, a quadratic ramp increases to at most 480px/s. Actual
  elapsed time is capped at 32ms. Instant native scroll increments and live list
  bounds limit travel so the list edge cannot scroll past the held pointer.
  Horizontal excursions stop scrolling. Scroll remeasures targets while the overlay
  stays aligned to the finger. The visual viewport is used where available.
- Valid/invalid drop, Escape, pointercancel, lost capture, blur, visibility change,
  resize/rotation and unmount synchronously cancel the scheduled frame. Document
  scroll itself no longer cancels. Resize deliberately cancels rather than continuing
  with stale overlay dimensions; retry after rotation.
- Up/down buttons provide insertion semantics and live announcements. After React
  moves DOM nodes, focus is explicitly restored to that card's same direction; if it
  becomes disabled at a boundary, focus moves to the opposite direction. Native
  Chromium Space/Enter checks supplement JSDOM coverage.

## Materials and motion

- `LoungeWindow.tsx` contains original procedural SVG artwork. One continuous closed
  arch path paints walnut grain, brushed brass, subdued patina and bevel layers.
  A clip path bounds moonlit hills, trees, stars, glass grain/reflections, and at
  most one horizontal/vertical glazing bar. The caption is real HTML.
- Removing CSS `ridge` avoids separate edge/bevel rendering at curved joins. The
  precise cause of the reported iPhone defect remains unconfirmed without that
  device. The continuous replacement is inspected in Chromium; Safari still needs
  device verification.
- No downloaded/generated raster artwork or third-party materials: no external
  licenses or runtime assets. All patterns/paths are original source in the dev
  import graph; nothing is in Vite `public/`. The two chat boards were unavailable
  and were **not inspected**.
- Mobile uses 16px gutters and an actual window near 1.2:1 width:height. At
  320/375/390px it measures roughly 288×240 / 343×286 / 358×298 CSS px.
- Six independent exterior fireflies render **inside** the glass clip, behind glass
  reflections, mullions and frame. Two measured upper exterior pockets avoid the
  arch/rim, both glazing bars and the live HTML caption; insufficient space hides
  flies instead of allowing overlaps. ResizeObserver watches SVG and caption.
- Far/mid/near bands couple radius (.75/1.15/1.65 CSS px), brightness, halo and
  non-overlapping nominal screen-speed budgets (2–2.6 / 4.3–5.2 / 8–9.5 px/s).
  Individual curved legs ease into near-pauses and have independent destinations.
  Durations derive from measured CSS-pixel travel and the selected depth budget;
  short-leg safeguards avoid accidentally slow near flies. Instantaneous speeds
  naturally approach zero during pauses; the hierarchy is perceptual over flight.
  Separate irregular glow clocks include long bright holds and full fades.
- The existing room/glass/brass gradient composition, colors and placement are
  unchanged. A broad warm swell alternates irregular troughs/crests over roughly
  2.6–5.7s legs, combined with two smaller asynchronous .8–2.3s flicker envelopes
  and occasional modest peaks/falloffs. Only the existing intensity variables
  change. Dezent remains restrained, Deutlich compares the stronger pulse, and
  off hides every light surface. No flames, strobe or animated screen blur.
- Hidden tabs stop decorative scheduling. Disable/unmount cleans up frames,
  observers and listeners. Reduced motion, including a live OS change, removes
  fireflies and light updates, restoring static light even at strong intensity.
  Functional drag, edge scrolling, keyboard reorder and buttons remain usable.
- Performance: one bounded six-point loop plus layered light envelopes (CSS writes capped
  near 16Hz), only during enabled visible ambience. A separate scroll loop exists
  only during dragging. No React updates per decorative frame, animated viewport
  blur, particle engine, WebGL or remote requests. SVG patterns/shadows are static.

## Reviewer manual checklist

1. At 320/375/390px and desktop, inspect the entire arch (especially upper-right),
   materials, readable HTML caption, both intensity levels and no horizontal overflow.
   On iPhone Safari, inspect at native scale and after rotation/zoom.
2. Drag Mira past several unequal cards. **Before release**, see intervening cards
   reflow and a dashed whole-card insertion slot. Drop at both ends and repeat with
   the tallest card. This must insert/shift, rather than swap. Release while others
   are still reflowing: the whole dragged card should travel into its slot while
   intervening cards glide across the DOM commit. No flash, double card or ghost.
   Repeat quickly; scroll/rotate/hide or use keyboard during landing and check
   cleanup. These interruptions retain the order committed at release.
3. On a short phone viewport, hold at the bottom edge: progressive scrolling should
   reveal offscreen cards while the overlay follows the finger. Repeat upward.
   Drop and verify immediate stop. Release horizontally outside the list and verify
   rollback. Scroll normally from text/outside the grip. Repeat with mouse/real touch.
4. Cancel with Escape, pointer/OS interruption, capture loss, blur, tab hiding,
   resize/rotation and navigation/unmount. No overlay, continuing scroll or changed
   committed order. Retry immediately. Scroll remeasures; rotation cancels.
5. Tab to up/down and activate with Space/Enter, including moves to first/last.
   Focus stays on the same card's available direction; announcements identify position.
   Confirm selection then tap a grip: Spiel starten stays enabled. Reorder: confirmation
   resets. Test rapid mouse/touch/keyboard activation of both action styles and reset.
   No actual game is saved or request sent.
6. Watch 30+ seconds at all viewports: six points live in the exterior night scene,
   behind the glass, avoiding rim/bars/caption. Smaller/dimmer/tight-halo far points
   should move more slowly than larger/brighter/soft-halo near points, with natural
   pauses/holds/full fades. Resize preserves confinement. Compare Dezent/Deutlich.
   Look for visible organic light brightening/dimming over several seconds without
   a metronomic pulse. Compare off/static reduced motion; spatial gradients stay the same.
7. Change OS reduced motion **while open** at strong intensity: no decorative
   flight/fade/light updates; static light and instant functional states. Hide/reopen,
   toggle effects and navigate away/back; no duplicate loops.
8. Check `/dev/theme.html`; build production and confirm only ordinary index/assets,
   no lounge HTML, SVG material IDs or playground effects/text in `dist`.

Physical iPhone/Android touch, Safari rendering and screen-reader speech remain
unverified unless separately recorded. Chromium touch emulation is not a device
claim. Visual approval and independent review remain the PO's decisions.

## Current polish verification (2026-10-27)

- `npm ci --cache /tmp/mtg-npm-cache --no-audit --no-fund`: passed.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed. Existing production
  bundle size advisory remains.
- `npm test`: 765 passed / 32 files. `npm test -- src/playground`: 39 passed / 5 files.
- New regressions cover exterior confinement, coupled depth/speed budgets, bounded
  curved legs, observable yet bounded light intensity changes, post-commit landing,
  settled insertion state, live reduced motion and interruption/cleanup. The retired
  rail-specific tests were replaced because flies now inhabit the exterior scene.
- Chromium: real Web Animations measured a released overlay ~109px from its target,
  ~7.7px away at half-time and exactly aligned at completion; three intervening
  cards had FLIP effects. Final order/height matched committed insertion, with no
  remaining overlay/placeholder. Reduced motion bypassed landing.
- Chromium + CDP touch: retained offscreen first→last insertion, upward edge travel,
  cancel/stop behavior, native Space/Enter boundary focus and confirmed grip taps.
  Mouse cancellation/retry, live OS changes and decorative frame cleanup passed.
  Visibility/capture interruptions were simulated, not a physical-device claim.
- Final screenshots at 320/375/390/1280px: no document overflow; design/proportions
  retained. Twenty-second mobile motion sample: average far/mid/near travel roughly
  2.2 / 4.3 / 7.7 CSS px/s, zero rim/bar/caption intersections, flies inside the
  exterior clip. Observed light intensity ranged ~.35–.78 during a separate sample.
- `rg --files frontend/dist`: ordinary index/assets only. Search for playground
  identifiers/text (`fireflies`, `Bleib noch`, `window-art`, `exteriorRegions`,
  `settling-overlay`, `Cozy Commander`): no matches. Prototype assets remain excluded.
- WebKit is not installed. Physical iPhone/Android, Safari rendering and screen-reader
  speech remain unverified. Final-revision CI and new session-local screenshots/
  clips are recorded in PR #136 for another PO phone check and independent review.
