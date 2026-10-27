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
- Six independent fireflies (three on phones) follow an arc-length rounded frame
  rail, avoiding fractional-power velocity spikes. Rounded top turns and small
  bottom corners keep trajectories outside the caption. Each leg eases to/from
  rest with independent destinations/durations. Brightness has a separate fade/hold
  clock, including long bright and fully dark holds. Warm 4px points/soft halos
  become 5px with clearer halos in Deutlich.
- Firelight has two independent random low-frequency channels, not a repeating
  cycle. Gentle 3–8s and 6.5–14s interpolation affects room gradients, glass and brass
  reflections. Dezent is restrained; Deutlich increases comparison intensity. Off
  hides all three reflected-light surfaces.
- Hidden tabs stop decorative scheduling. Disable/unmount cleans up frames,
  observers and listeners. Reduced motion, including a live OS change, removes
  fireflies and light updates, restoring static light even at strong intensity.
  Functional drag, edge scrolling, keyboard reorder and buttons remain usable.
- Performance: one bounded six-point loop plus two light channels (CSS writes capped
  near 12.5Hz), only during enabled visible ambience. A separate scroll loop exists
  only during dragging. No React updates per decorative frame, animated viewport
  blur, particle engine, WebGL or remote requests. SVG patterns/shadows are static.

## Reviewer manual checklist

1. At 320/375/390px and desktop, inspect the entire arch (especially upper-right),
   materials, readable HTML caption, both intensity levels and no horizontal overflow.
   On iPhone Safari, inspect at native scale and after rotation/zoom.
2. Drag Mira past several unequal cards. **Before release**, see intervening cards
   reflow and a dashed whole-card insertion slot. Drop at both ends and repeat with
   the tallest card. This must insert/shift, rather than swap.
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
6. Watch 30+ seconds: perceptible independent points near rails, no speed spikes,
   pauses/bright holds/full fades, no paths over text/buttons. Resize preserves anchors.
   Compare irregular firelight on brass/glass, Dezent/Deutlich and both off toggles.
7. Change OS reduced motion **while open** at strong intensity: no decorative
   flight/fade/light updates; static light and instant functional states. Hide/reopen,
   toggle effects and navigate away/back; no duplicate loops.
8. Check `/dev/theme.html`; build production and confirm only ordinary index/assets,
   no lounge HTML, SVG material IDs or playground effects/text in `dist`.

Physical iPhone/Android touch, Safari rendering and screen-reader speech remain
unverified unless separately recorded. Chromium touch emulation is not a device
claim. Visual approval and independent review remain the PO's decisions.

## Verification record (2026-10-27)

- `npm ci --cache /tmp/mtg-npm-cache --no-audit --no-fund`: passed.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed (existing production
  bundle size advisory remains).
- `npm test`: 750 passed / 31 files. `npm test -- src/playground`: 24 passed / 4 files.
- Chromium + CDP touch emulation: downward offscreen insertion first→last, upward
  edge travel, cancellation and immediate scroll retirement; live preview before
  drop; native Space/Enter boundary focus and confirmed grip tap passed.
- Chromium harness: live reduced-motion loop retirement, off-state reflections,
  mouse cancellation/retry for each exit, and scheduled-frame cleanup passed.
  Visibility interruptions were simulated; this is not a real-device/tab claim.
- Screenshots at 320/375/390 and 1280 CSS px: no document horizontal overflow;
  continuous arch inspected. Thirty-second mobile firefly sample: up to three
  visible points, including dark phases, no caption intersections.
- `rg --files frontend/dist`: only ordinary index/assets. Search for `fireflies`,
  `Bleib noch`, `window-art`, `glass-grain`, `edgeVelocity`, `Cozy Commander`: no
  matches. No prototype-only assets copied to output.
- WebKit launch attempted: executable not installed. Physical iPhone/Android,
  Safari's rendering of the replacement frame and screen-reader speech unverified.
  Final-revision GitHub CI results and session-local screenshots/clips are in PR #136.
