# Cozy Commander motion playground

An isolated experiment for #135 and the PO feedback on PR #136. This does **not**
change `docs/product/frontend-redesign.md` or implement #134. Production adoption
requires a separate PO decision/specification. No production routes, GameEditor,
game details, production backend or persistence changes are involved. The artwork experiment
added in #140 reuses the authenticated read-only lookup described below.

## Open locally

```sh
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173/dev/lounge.html** (or the private forwarded Vite URL).
Lounge and Mana work without a backend or login. Commander-Artwork requires the
regular application session and online lookup (see below). The ordinary build
imports/emits neither this HTML nor its code/assets. `/dev/theme.html` remains separate. Do not add either to build inputs.

In development, the authenticated Dashboard also links here via **Tech Playground
öffnen**. The signed-out **Open Tech Playground** link remains available; both
entries are hidden in production builds.

## Interaction implementation

- No new runtime dependencies. MUI and the existing theme; exploratory CSS is imported only
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
  The release pose is captured from the rendered CSS matrix before pointer-up
  coordinates update state. The filled animation endpoint remains until React
  reveals the real card; cancellation happens after that commit in a layout effect.
  One temporary requestAnimationFrame clock supplies native animation currentTime
  for the overlay and reflow together. It caps elapsed progress to 32ms per frame
  so a WebKit/main-thread stall cannot consume the visible landing. Native WAAPI
  still interpolates transforms/easing; the endpoint paints before React reveals
  the card. The nominal duration/easing remain 260ms/ease-out, extending naturally
  when frames stall. No new runtime motion library is used.
- Scroll and height-only window/visual-viewport changes retarget the overlay from
  its current displayed matrix to the new measured slot, without revealing the
  card early. Keyed list reordering opts out of browser scroll anchoring. Drop-zone
  bounds allow one CSS pixel for fractional native scroll rounding.
- A new drag, keyboard action, changed order, width change/rotation, visibility
  change, blur, unmount or live reduced-motion change retires landing effects.
  Stale pointer cancellation after release is ignored. Post-release interruptions
  retain the already committed order; cancellation
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
- The existing room/glass/brass gradients, colors, placement and CSS are unchanged.
  Firelight uses a persistent base, a wandering low-frequency baseline with no
  compulsory high/low alternation, two small smoothly interpolated flutter signals,
  and up to three overlapping flare events. Typical attacks take 150–350ms and
  releases 550–1200ms, with some shorter rounded releases. Variable waits allow
  clusters and quiet gaps. The two light variables share the same source signal.
- Dezent gently modulates the existing .4/.3 base. Deutlich uses a wider temporal
  excursion and reserves headroom for the existing 2.1× CSS gain: soft compression
  keeps room-layer A below .9765 opacity after gain, avoiding flattened clipped
  peaks. Changing intensity repaints the same phase without restarting clocks.
  Off hides every light surface. No flames, strobe or animated screen blur.
- Hidden tabs stop decorative scheduling. Disable/unmount cleans up frames,
  observers and listeners. Reduced motion, including a live OS change, removes
  fireflies and light updates, restoring static light even at strong intensity.
  Functional drag, edge scrolling, keyboard reorder and buttons remain usable.
- Performance: one bounded six-point loop plus layered light envelopes (CSS writes capped
  near 30Hz), only during enabled visible ambience. A separate scroll loop exists
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
   Repeat quickly, starting a new drag during landing. Scroll during landing: the
   card must continue from its displayed position to the moving slot. Rotate/hide
   or use keyboard during landing and check cleanup. Retain the committed order.
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
   a metronomic pulse. Watch 15–30s for persistent low glow, continuous small flutter
   and brief faster-rise/softer-decay flare moments. Switch intensity during a flare:
   phase should continue and Deutlich should not flatten at full opacity. Compare
   off/static reduced motion; spatial gradients stay the same.
7. Change OS reduced motion **while open** at strong intensity: no decorative
   flight/fade/light updates; static light and instant functional states. Hide/reopen,
   toggle effects and navigate away/back; no duplicate loops.
8. Check `/dev/theme.html`; build production and confirm only ordinary index/assets,
   no lounge HTML, SVG material IDs or playground effects/text in `dist`.

Physical iPhone/Android touch, Safari rendering and screen-reader speech remain
unverified unless separately recorded. Chromium touch emulation is not a device
claim. Visual approval and independent review remain the PO's decisions.

## Reference analysis and approved temporal model

The PO supplied `fireplace-reference-for-iphone.zip` in Codex chat. Its MP4 decoded
without errors: 25s, 640×360 H.264, 30fps, 750 frames. The reference remains in temporary
storage; **neither ZIP nor MP4 is committed, bundled, or added to the PR**.

Analysis used a timestamped overview throughout 0–24s, 10fps visual sequences at
4.2–5.8s and 11.8–13.6s, and a warm-pixel brightness proxy over all 750 frames.
The strong peak near 4.93s had a ~0.30s half-prominence rise and ~0.91s fall; the
12.67s peak was shorter and nearly symmetric. Activity was generally quieter at
16–25s. These observations informed distributions, not an exact waveform replay.
Camera exposure, flame motion/clipping and the crop prevent treating image
luminance as calibrated wall illuminance. Indirect lighting therefore retains a
positive floor and compresses the observed variations for a calm readable UI.

The findings and proposed model were presented before implementation. The PO then
explicitly approved implementation in Codex chat, following the gate in
[the PR handoff](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/136#issuecomment-6440134337).
`firelightModel.ts` implements that approved model; injected random input permits
repeatable tests. It reuses existing opacity variables with no new rendering
layers, dependencies or changes to fireflies or card interactions.

## Reference-model verification (2026-10-27)

- `npm ci --cache /tmp/mtg-npm-cache --no-audit --no-fund`: passed.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed (existing production
  bundle size advisory remains).
- `npm test`: 771 passed / 33 files. Focused playground suite: 45 passed / 6 files.
- Seeded regressions cover asymmetric flare envelopes, irregular event intervals,
  persistent glow, bounded frame changes, soft headroom after the 2.1 gain,
  phase-preserving intensity changes, hidden-time pause, disable/reduced-motion
  cleanup and listener retirement. The old large alternating-swell range test was
  replaced with a post-gain variation/headroom check for the newly approved model.
- Chromium: a 12s Dezent sample measured ~.372–.473 room-layer A opacity; a 25s
  Deutlich sample measured ~.602–.946 after gain, with no clipped plateau. Off hid
  all light surfaces. A live OS reduced-motion change stopped decorative scheduling
  and retained the unchanged static lighting. Fresh 320/375/390/1280px captures
  showed no horizontal overflow. The isolated firelight clip uses the existing
  firefly toggle to turn fireflies off for inspection; their implementation is unchanged.
- Gradient CSS, firefly modules and drag/drop modules have no diff in this follow-up.
  Only the Firelight intensity prop is added to the Lounge composition.
- Production output remains ordinary index/assets, with the same asset hashes and
  no playground/model identifiers. No reference or recording media is committed.
- Physical iPhone/Android, WebKit/Safari and screen-reader speech remain unverified.
  Final-revision CI and session-local screenshots/recording are in PR #136; PO
  phone visual approval and independent review remain required. No merge performed.


## Release continuity follow-up (2026-10-27)

The [latest PO feedback](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/136#issuecomment-6441180932)
is limited to release/landing; accepted fireplace, fireflies and design are unchanged.
Actual unpaused Chromium traces exposed three distinct discontinuities:

1. `move(pointerup)` could replace the last rendered overlay coordinates before
   the landing layout effect. Capture/freeze the actual rendered pose first.
2. Cancelling the filled Web Animation in its finish callback restored the release
   transform before React removed the overlay. A sampled last frame jumped back
   81–178 CSS px in the reproduced cases. Hold the endpoint through React's reveal
   commit, then cancel effects in the layout effect. Mocked or paused animations
   did not expose this frame; browser tests now require the last visible frame to
   be within 2 CSS px of the real card's final position.
3. At an upward edge-scroll stop, native pointer y=20 with list top=20.4375 was
   rejected as outside, reverting the order. A one-pixel measured-bound tolerance
   handles rounding. Real outside drops still cancel. Scroll/toolbar movement no
   longer cancels a committed landing; it retargets from the current rendered pose.

The persistent overlay follows the same ownership principle as
[dnd-kit DragOverlay](https://dndkit.com/react/components/drag-overlay/); measured
transform reflow follows the principle in
[Motion layout animations](https://motion.dev/docs/react-layout-animations).
Repairing the existing lifecycle is smaller than replacing the accepted pointer
sensor, live insertion and edge-scroll behavior. No runtime library was added.
The nominal 260ms ease-out is driven by rendered frames, with a 32ms maximum
progress step. Cold WebKit upward-edge captures repeatedly jumped from a release
sample to +215ms, already near the wall-clock endpoint; observer changes and a
compositing hint did not resolve this. The bounded clock preserves meaningful
intermediate motion after such gaps, for the overlay and surrounding cards
together. It pauses native WAAPI timelines and supplies currentTime without React
updates or geometry reads per frame. Extending duration alone would not fix the
state/cleanup races. The one clock exists only during landing and is retired on
every finish/interruption/unmount path.

### Repeatable browser verification

Test-only `@playwright/test` is pinned in the lockfile. From `frontend/`:

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm run test:browser
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` can use a locally installed
Chromium. The dedicated CI job runs Chromium and WebKit with real browser layout,
requestAnimationFrame and Web Animations. The test harness does not pause, seek
or mock them; it observes the production frame-driven clock.
CI uses the matching official Playwright container with preinstalled browsers/OS
libraries, avoiding the observed ~53-minute Ubuntu apt-mirror delay; the job has a
10-minute bound. It uploads HTML reports, frame-position JSON, failure traces/screenshots and videos
as `playground-browser-evidence` (14-day retention). Browser tests are separate from
Vitest and included in lint/typecheck. Existing frontend/backend checks still apply.

The suite checks upward/downward edge scrolling, unequal heights, exact release
pose, surrounding-card continuity across DOM reorder and intermediate movement,
unchanged insertion, stale pointer cancellation, scrolling during landing,
rapid consecutive drags, an actual 180ms main-thread stall, outside/Escape rollback, native keyboard focus and
reduced motion. Chromium additionally uses continuous native CDP touch input;
WebKit runs the pointer/layout cases. The upward-edge setup wait derives from
measured travel at the 270px/s edge ramp, allowing two travel periods plus 2s
for cold WebKit rendering/poll overhead; the default 5s expired just before the
list reached the edge in a recorded run. Landing position assertions are unchanged. Final-coordinate and stale-cancel scenarios
synthesize only their terminal input; animation/layout remain native. This is not
physical iPhone evidence. Local WebKit download was blocked by the session's
network allowlist; GitHub's browser job provides the separate WebKit run.

### Physical iPhone Safari acceptance

1. Open this branch's `/dev/lounge.html` with OS reduced motion disabled. Drag
   Mira down and Fenn up, keeping the card under your finger; release in the
   middle of a slot and immediately after edge scrolling stops.
2. Watch the whole card through finger-up: no teleport at release, no flash back
   at the endpoint, no early reveal. Surrounding cards must continue from their
   current preview positions into their slots. Repeat with unequal heights,
   unchanged placement, immediate release mid-preview and rapid consecutive drags.
3. While a landing is running, scroll or collapse/expand Safari's toolbar. The
   overlay must follow the moving slot without disappearing. Rotate, hide/reopen
   the page or use keyboard controls: no leftover overlay or continued scrolling.
4. Release clearly outside the list, cancel an active gesture and retry. Original
   order remains for cancellation; a valid committed drop retains its new order.
5. Turn reduced motion on, including a live change: landing is instantaneous.
   Confirm selection, tap/return to the same position: Spiel starten stays enabled.
   Test VoiceOver announcements and keyboard focus independently where available.

Physical iPhone visual acceptance remains with the PO; do not merge this PR.

### Local verification of the landing follow-up

- Clean `npm ci --cache /tmp/mtg-npm-cache --no-audit --no-fund`: passed.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed. The existing
  production chunk-size advisory remains; production JS/CSS hashes are unchanged
  and no lounge/geometry/effect code is emitted.
- Before the final clock refinement, `npm test`: 773 passed / 34 files.
- Final focused `npm test -- src/playground`: 49 passed / 8 files, including
  bounded progression after a 200ms frame gap and frame cancellation on retirement.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser -- --project=chromium`:
  Chromium landing regressions passed with real layout/application animation. Intermediate/finish samples
  verify continuity and reveal. Recording follows the overlay lifecycle through
  handoff, including consecutive releases. A former 700ms window clipped evidence
  when cold WebKit stalled and the bounded clock extended wall time to ~1041ms;
  it no longer truncates the actual landing. Observation
  stays inside the browser during landing. Removing repeated locator/trace DOM
  snapshots did not resolve the cold WebKit upward-edge failure; it is not treated
  as a proven sampling-only issue. Position assertions still require intermediate
  movement, an exact start and final slot.
- `node --test tools/demo/*.test.mjs`: 22 passed;
  `node --test .devcontainer/seed-demo.test.mjs`: 7 passed.
- Rendered desktop/mobile captures and native-touch/desktop recordings were taken
  after the last UI change. Observed release-to-animation displacement was below
  .02 CSS px; final visible positions reached the target within .02 CSS px in the
  sampled up/down/touch/unchanged cases. Shared-workspace artifacts and exact
  final-revision CI outcomes are linked in PR #136.
- Local backend verification was not run: this environment has JDK 21 rather
  than the repository's JDK 25. The required backend CI remains mandatory.

## Mana statistics experiment (#138)

Choose **Die Farben des Manas** in the experiment switch at `/dev/lounge.html`.
The original lounge remains the default; switching experiments unmounts the old
view, retires its effects and resets its temporary demo state when reopened.
`/dev/theme.html` and production entry points are unchanged.

- `manaData.ts` owns synthetic aggregate snapshots for exactly 2–6 participants.
  All is their sum, percentages use integer HALF_UP rounding, and the existing
  `rankedColors` comparator orders by exact ratio, games, then WUBRGC. These are
  overlapping deck/color appearances, not distinct matches or live records.
- Six keyed rows retain identity. Before changing a filter, the current visual
  rectangles (including interrupted transforms) are captured. A layout effect
  inverts the new positions with WAAPI, then eases to the final order over 550ms.
- One temporary RAF clock interpolates every numeric percentage and fluid width
  with the same cubic ease-out over nominally 550ms. The existing bounded landing
  clock also drives paused WAAPI row animations: a frame gap advances at most
  32ms, extending wall time under stalls rather than skipping visible motion.
  Browser tests follow actual progress/endpoints rather than a fixed sampling
  window (cold WebKit can delay its first frame beyond 220ms). Interruptions start from the last
  painted values. Source data is never interpolated. Missing data has no fluid
  and is never announced as measured zero. Accessible text exposes final values;
  only the concise filter status is live, not the frame-by-frame counter.
- Three small independently phased CSS bubbles per channel are clipped inside
  the changing fluid width. No React frame updates, new dependency, external
  assets, API calls or storage. Six shallow width updates cause bounded local
  layout; bubbles use transforms/opacity. This is not a real-device FPS claim.
- Reduced motion (including live changes) immediately paints final values/order
  and disables bubbles. Hidden tabs finalize/cancel transitions and disable
  bubbles; switching experiments or unmount cancels scheduled work.
- Warm parchment/brass, burgundy controls, semantic Mana tokens and explicit
  letter/name identifiers follow the kickoff reference. The narrowest phones
  use a 3×2 radio layout; other widths use six columns. Native radios support
  arrow-key navigation and retain focus during row reordering.

Repeatable checks: `npm test -- src/playground`, and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser` with
`--project=chromium` for the system browser, or the normal browser command for
installed Chromium/WebKit. `e2e/mana.pw.ts` samples actual browser frames for
up/down interpolation, interruption and reorder continuity; also checks all
filters, exact results, reduced motion, cleanup, 320/375/390/1280px overflow,
keyboard focus and captures screenshots. CI retains browser videos/screenshots
in the `playground-browser-evidence` artifact.

For PO iPhone review: open the branch in the development environment, forward the
Vite port privately, then visit `/dev/lounge.html` and select the Mana experiment.
Try Alle → 2 → 3 quickly, 5 (measured white zero), and 6 (missing white/black).
Watch bubbles, shrinking/growing counters and entire-row movement; scroll and
rotate, hide/reopen Safari, enable OS reduced motion, and check VoiceOver.
Physical iPhone/Safari rendering, thermal performance and speech require device
acceptance; desktop Chromium and CI WebKit do not substitute for that decision.


## Commander artwork on parchment (#140)

Choose **Commander-Artwork** in the experiment switch. Search uses the existing
`CommanderSearch` (two characters, 300 ms debounce, bounded backend suggestions,
loading/empty/error/retry feedback). Selecting a result calls `listArtworks` with
its complete gameplay selection reference, including `gameplayFaceIndex` when
present. Native radios show available illustrations; the first usable artwork
is selected automatically, including a single-artwork response. Change the search
or illustration as often as needed. Leaving the experiment discards all state.

### Real online lookup and authentication

1. Run the regular backend and its database using the normal development setup.
   Vite forwards `/api` to `localhost:8080`; keep the app and playground on the
   **same browser origin** so their existing session cookie is shared.
2. Sign in through the **regular application**, then open `/dev/lounge.html`
   (the development Dashboard links to it). No separate playground login exists.
   Without a session, live lookups return `401`; the experiment links to the main
   app in another tab and offers an explicit retry after sign-in.
3. The backend needs real HTTPS access to `api.scryfall.com`. The browser needs
   HTTPS image access to `cards.scryfall.io` and source-link access to
   `scryfall.com`. Offline fixture/demo mode cannot establish live Scryfall
   availability. Browser component/route mocks are deterministic tests, not proof
   of live authentication or upstream availability.

Only existing same-origin **GET** endpoints are called. There are no deck writes,
new endpoints, auth/security changes, stored images, persistent preferences, or
runtime dependencies. Requests abort on replacement/unmount; retired promises
cannot restore previous choices or surface a late `401`. Each artwork retry
starts a fresh request lifetime. Empty or unsafe imagery produces a retryable
empty state; backend/network/503 errors show the existing Scryfall message.
Failed or blocked images retain attribution and offer an image retry.

The parchment uses a small experiment-local static material tile, soft uneven
edge shading, and brass/burgundy accents (see the texture follow-up below).
The original Scryfall art crop is displayed at its natural aspect ratio, without filters, conversion, processing or animation.
Previews reuse `CommanderArtwork`; URLs and optional authoritative source links
use `safeArtworkUrl`. Artist metadata and copyright remain readable HTML.

### PO visual review

- At **320 / 375 / 390 px and desktop**, search and select a Commander, then choose
  another illustration using touch or radio arrow keys. Check visible focus,
  selection, legible artist/source text, natural image proportions and no
  horizontal overflow. Try one illustration and a Commander with many options.
- Change Commander repeatedly while responses are pending. The old preview must
  disappear immediately; no late result may replace the current selection.
- Sign out through the main app, trigger a lookup, inspect the sign-in guidance,
  sign in there again, then retry here. Exercise unavailable lookup/503, no
  matches, no usable art and browser-blocked/broken images with retry.
- Switch to Lounge and Mana: both remain offline-capable; returning to artwork
  starts with a blank temporary selection. Inspect the normal production build:
  no `Commander-Artwork`, `art-parchment`, `commander-illustration` or dev HTML.
- Judge whether unchanged original art on aged parchment suits the magical
  chronicle identity and whether attribution feels balanced. Sepia/ink conversion
  or drawing animation requires a separate future experiment and PO decision.

Repeatable behavior coverage: `npm test -- src/playground/CommanderArt.test.tsx`.
Browser checks: `npm run test:browser -- e2e/commander-art.pw.ts` (Chromium/WebKit;
use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` for a system Chromium).
Browser layout tests use explicitly synthetic image responses and mocked read-only
application routes; screenshots from those tests are layout evidence only. Live
provider images for PO visual evidence load directly in the browser and are never
bundled or saved as separate image assets. Physical iPhone/Safari rendering and
screen-reader speech still require device review. Visual approval remains with
the PO; this experiment does not approve the Visual Identity Charter.


### Parchment texture refinement (PR #145 PO feedback)

The [PO visual feedback](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/145#issuecomment-6475637557)
requests lighter, more natural material. `assets/parchment-grain.svg` replaces the
regular CSS stripes. It is an original procedural SVG authored for this repository,
not a download or derivative of the linked style-reference photographs. It
contains no third-party material or additional third-party license. The references
remain style guidance; none of their bytes are included.

The ~7.4 KB, 384×384 tile combines fixed-seed, stitched multiscale noise with fine
irregular short fibres. Its transparent marks sit over a pale warm base; broad
uneven edge shading stays separate from the grain. The browser renders/caches
one small static image. No script, animation, extra dependency or remote texture
request is involved. The SVG has no external resources. It is referenced only
from the development experiment's CSS and does not enter the production bundle.
All material layers paint behind the figure contents: the Scryfall image remains
in its original colours, without an overlay, blend mode or image filter. Native
focus, attribution, responsive layout and all lookup/error behavior are retained.

For visual acceptance compare the before/after empty surface and selected-artwork
composition at 320/375/390 px and desktop. Automated browser tests use a clearly
marked synthetic artwork swatch and mocked application endpoints. Separate visual
captures can load original Scryfall images directly in the browser with normal TLS
verification; they assess the real artwork composition, while mocked metadata
does not establish a live authenticated-backend flow. WebKit regression checks
complement Chromium; physical iPhone Safari and PO visual acceptance still need
device review.
