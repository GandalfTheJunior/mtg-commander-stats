# CI reliability investigation

| | |
| --- | --- |
| Investigation date | 14 November 2026 |
| Analyzed branch | `main` |
| Analyzed commit (baseline) | `88966b7cdb9ce3cade955cd0f2ab36298f9514f1` |
| Report status | **PARTIAL** — all five incidents investigated; historical review and some verification limited (see [E.6](#e6-work-not-completed)) |
| Tracking issue | [#314](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/314) |

> Snapshot investigation — findings reflect the analyzed commit and may be superseded by later fixes.

**Investigation submitted — documentation only. No CI fixes implemented.** Every
code change described here was applied only in a disposable worktree and is
preserved as a textual diff in the experimental patches
([Vitest and application candidates](ci-reliability/experimental-patches.md),
[browser diagnostics](ci-reliability/experimental-patches-browser.md)). The
Product Owner (PO) reviews these findings and separately authorizes any
implementation. `main` did not advance during the investigation.

| Section | Classification |
| --- | --- |
| [B.1 #312 Games History pagination (Vitest)](#b1-312--games-history-pagination-vitest) | CONFIRMED ROOT CAUSE — test double / synchronization |
| [B.2 #298 WebKit member-deck screenshot timeout](#b2-298--webkit-member-deck-screenshot-timeout) | CONFIRMED ROOT CAUSE — test helper; already corrected on `main` |
| [B.3 #306 Game Details](#b3-306--game-details-focus-and-scroll-restoration) — Vitest focus | CONFIRMED ROOT CAUSE — test synchronization on a passive focus effect |
| B.3 #306 Game Details — WebKit scroll | LIKELY ROOT CAUSE — WebKit defers focus scrolling; two links unproven |
| [B.4 #315 claim-dialog focus restoration](#b4-315--claim-dialog-focus-restoration) | CONFIRMED ROOT CAUSE — expired fixture timestamp exposes a product accessibility defect; not WebKit-specific |
| [B.5 #320 Chromium cross-tab account switch](#b5-320--chromium-cross-tab-account-switch) | CONFIRMED ROOT CAUSE — product defect (late focus on a visible form); no security impact shown |
| [B.6 New: `Invitation.test.tsx` focus assertion](#b6-additional-finding--invitationtesttsx-focus-assertion) | CONFIRMED ROOT CAUSE — same class as #306 Vitest |
| [B.7 Historical #268, #129, #142](#b7-historical-incidents) | Assessed from documents only; not re-run |

How to read the confidence labels: **CONFIRMED ROOT CAUSE** means the failure
was induced deterministically by an intervention aimed at the suspected
mechanism, the causal chain is explained, and a temporary correction removed
the induced failure under the same conditions while keeping the behavioral
assertions. **LIKELY ROOT CAUSE**, **HYPOTHESIS** and **UNRESOLVED** are used
when that standard is not met. Repetition results are always written as
“F failures in N runs”. A run of passes is statistical evidence only.

## A. Executive summary

1. **No incident is “just flaky”.** Each of the five has a concrete cause;
   four are confirmed by deterministic induction and correction, one half of
   #306 is likely. Two of them are genuine product defects that the tests
   detected correctly.
2. **One mechanism is shared by four failures** (#312, #306 Vitest, the new
   Invitation failure, #320): the UI becomes visible and usable in one React
   commit, and something the next step depends on — an observer, the initial
   focus, the router location — is completed by a *later* passive effect or
   lower-priority render. Tests (and, in #320, users) act in between.
   Delaying the React Scheduler's host callback turns each of these rare
   failures into 10-of-10 or 20-of-20.
3. **#315 is a time bomb, not a WebKit bug.** The claim fixture's expiry
   (`2026-11-13T18:45:00Z`) lies in the past since the evening of 13 November.
   The dialog therefore re-checks the invitation status at 0 s, +1 s, +2 s,
   +4 s …; every re-check disables the dialog's buttons while in flight, and a
   disabled button cannot keep focus — in Chromium and WebKit alike. Aligning
   a re-check with the Escape close fails 16 of 16 runs (8 per engine).
   Without any intervention it failed 16 of 39 WebKit runs on a loaded
   two-CPU container: this is currently the most frequent failure.
4. **#320 is a product defect.** After “Anderes Konto verwenden” the sign-in
   form is interactive 45–110 ms before the application focuses the email
   field. Typing that started in the password field is then redirected: the
   password lands, readable, in the email field and the form cannot be
   submitted. It reproduces unmodified in 8 of 110 Chromium runs and 10 of 10
   when induced. No unauthorized claim, accept request or identity mix-up was
   observed; the server-side `expectedAccountId` check and the client-side
   identity re-check are untouched by the candidate corrections.
5. **#298 is already corrected on `main`** (0 failures in 60 WebKit runs
   versus 3 in 3 with the original helper); only its closure is outstanding.
6. **#306 WebKit**: WebKit applies the scroll caused by `focus()` after
   `focus()` returns, Chromium inside it. With the CI-reported offset (227)
   and the baseline read before that deferred scroll, WebKit fails 10 of 10
   with exactly “expected 227, received 585”; Chromium 0 of 10. How the page
   came to rest at 227 in the CI run is not established, hence LIKELY.
7. **Evidence gap:** the CI Playwright traces exist until 26–28 November but
   could not be downloaded here ([E.5](#e5-missing-or-unavailable-evidence)).
   Conclusions rest on job logs and reproduction in the pinned CI image.

**Recommended order** (details in [D](#d-prioritized-implementation-plan)):
(1) relative expiry in the claim fixture — removes today's most frequent
failure; (2) the #312 observer mock; (3) the two small test synchronizations
for #320 and #306 Vitest; (4) PO decision on the three small product
corrections (focus in layout effects, background expiry check, sign-out
navigation), each as its own issue; (5) diagnostics and fixture guards.

**Remaining risks:** natural CI failure rates are unknown; the application
candidates were exercised only for the behavior under investigation; the
historical fixes were not re-verified; WebKit's job duration (14.0 of 15
minutes in the one log read) was not investigated.

## B. Individual incident investigations

### B.1 #312 — Games History pagination (Vitest)

**Classification: CONFIRMED ROOT CAUSE — test synchronization and test-double
fidelity. No application defect was found.**

#### Links and failure description

- Issue: [#312](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/312).
- CI: [run 43517535391](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43517535391),
  [frontend job 132203212259](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43517535391/job/132203212259),
  PR #311 at `7c5b5191d2e29704b26667d7d3cc014ff61985c9` (documentation-only PR).
- The job log was read in full for the failing step. It shows 1 failed and
  1,057 passed tests in 54 files (163.33 s). The failing test is
  `src/GamesHistory.test.tsx` › `loads 41 games in bounded server order and
  stops at the confirmed end`, at line 43
  (`waitFor(() => expect(screen.getAllByRole('article'))…)`), with
  `Unable to find role="article"` and a DOM that contains the alert
  “Die Anfrage wurde abgelehnt. … Die letzten Spiele konnten nicht geladen
  werden. Group access is confirmed. Refresh games to review server state
  before trying again.” and a `Refresh games` button.
- The log does not name the rejected request. It also prints test files
  without the `|parallel|` project prefix, which `vite.config.ts` adds only
  on runners with at most two CPUs. The job therefore ran the more-than-two-CPU
  configuration (5 s test timeout, parallel workers). This is an inference
  from the log format, checked locally with a two-CPU affinity mask.

#### Relevant code

- `frontend/src/GamesHistory.test.tsx` replaces `IntersectionObserver` with a
  class whose constructor overwrites a module-level `intersect` function.
  `observe()` and `disconnect()` do nothing, so the variable keeps pointing at
  an observer after the component disconnected it — even across tests.
- `frontend/src/GameManager.tsx` creates the observer in a `useEffect` that
  depends on `append`, `state` and `pageStatus`. `append` closes over the
  `state` of its render, including `state.nextCursor`.
- `frontend/src/test/gameFixtures.ts` (`gameApi`) answers each registered URL
  once. A request for `…/games/history?cursor=page20` with no remaining reply
  falls through to the generic `GET …/games/<id>` handler, which treats
  `history?cursor=page20` as an unknown game id and returns `404`.

#### Competing hypotheses

1. **Stale observer callback (test).** The test fires `intersect` before the
   observer for the new page exists.
2. **Application coordination defect.** `GameManager` itself issues a
   duplicate or wrong-cursor request (for example through `pagePending` or
   generation handling).
3. **Fixture exhaustion without a stale callback.** A legitimate second
   request for the same cursor consumes the queue.
4. **Cross-test leakage.** State from the preceding `count = 40` case reaches
   the `41` case.

#### Experiments and observations

All runs used the baseline commit in a disposable worktree; diagnostic files
and commands are in [E.3](#e3-exact-commands) and the
[patches](ci-reliability/experimental-patches.md).

**Timeline instrumentation.** A diagnostic copy of the `41` case logs observer
construction/disconnection, every `intersect()` call with the observer it
reaches, every request with its status, DOM commits, and each React Scheduler
host callback. A passing run shows the normal order:

```text
2432.07 immediate#3 ran 60.03ms          <- render + commit of page 2
2492.71 DOM commit observed: 40 articles
2536.93 immediate#4 ran 1.77ms           <- passive effects, a separate task
2538.66 observer#2 constructed
2538.76 waitFor(40) resolved; current intersect -> observer#2, live=2
2538.77 intersect() -> observer#2 live=true
2538.87 reply queued-hit ?cursor=page40
```

A naturally failing run of the same diagnostic (first occurrence appeared
without any intervention) shows the inverted order:

```text
466.13 fetch /games/history?cursor=page20 -> 200
583.54 waitFor(40) resolved; current intersect -> observer#1, live=
583.56 intersect() -> observer#1 live=false   <- disconnected observer fired
585.37 observer#2 constructed                 <- the real one arrives 2 ms later
686.78 fetch /games/history?cursor=page20 -> 404   <- duplicate cursor, fixture fallthrough
688.07 fetch  -> 200                               <- recover(): group access re-read
2137.26 FAILED: Unable to find role="article"
```

This establishes the complete chain for the CI signature:

1. The cards of page 2 are committed in one Scheduler task. React schedules
   the passive effects of that commit (which re-create the observer) as a
   separate Scheduler task, because the render exceeded the Scheduler's 5 ms
   slice. Under Node, the Scheduler's host callback is `setImmediate`.
2. `waitFor` observes the 40 cards in a microtask after the commit and then
   returns after a zero-delay timer.
3. If that timer fires before the next `setImmediate` callback, the test
   continues while `intersect` still refers to observer #1.
4. Observer #1's callback calls the `append` closure of the page-1 render,
   whose `state.nextCursor` is still `page20`. `pagePending` is already
   `false`, so the guard does not stop it.
5. The fixture has no reply left for `?cursor=page20` and returns the
   synthesized `404`.
6. `GameManager.append` treats `404` as an access failure and calls
   `recover()`, which removes the private rows, re-reads the group and shows
   the observed alert. This is the intended product behavior for a real `404`.

Only the `41` case needs a *second* observer, which is why CI reported that
case. Hypothesis 2 is not supported: in every recorded timeline the duplicate
request originates from a callback of a disconnected observer, which a real
browser never delivers. Hypothesis 3 did not occur without the stale callback.
Hypothesis 4 is real but produces a *different* symptom (below).

Explanatory model for step 3 (reasoned from Node.js and libuv timer semantics,
not isolated experimentally): the zero-delay timer is due at the next integer
millisecond, and timers are serviced before the next `setImmediate` phase.
The stale order therefore occurs whenever a millisecond boundary passes
between the end of `waitFor` and the end of the current loop iteration. That
makes the failure a low-probability event on an idle machine and more likely
when the process is preempted, which matches a parallel four-worker CI run.

**Second manifestation (cross-test).** When the *first* observer of a test is
late, `intersect` still points at the last observer of the previous test,
whose component is unmounted. Its stale `append` uses the current test's
`fetch` stub and consumes that test's reply. The current component never
receives an intersection. Observed naturally as
`append authorization failure 401 removes private rows before recovery`
failing with `Found multiple elements with the role "article"`.

**Silent false passes.** Under the forced ordering below, the three
`retired append response … cannot update a new lifetime` cases still pass,
although the stale callback means their component never issues the append
they are meant to retire. Their only assertion (no cards after unmount) holds
trivially. With the candidate correction they exercise the intended path.

#### Repeated-run results

Commit `88966b7cdb9ce3cade955cd0f2ab36298f9514f1`, Node 24.22.3, Vitest 5.0.0,
jsdom 30.0.1, one test file per invocation unless stated. “Delay” is the
experimental setup file that services Scheduler host callbacks through
`setTimeout` instead of `setImmediate`
([patch](ci-reliability/experimental-patches.md#scheduler-control-setup-312-306-invitation-finding)).

| # | Scope and conditions | Result | Failure signature |
| --- | --- | --- | --- |
| 1 | Unmodified `src/GamesHistory.test.tsx`, two-CPU affinity (`taskset -c 0,1`), isolated | **2 failures in 30 runs** | 1× the CI signature in the `41` case; 1× the `401` append case (`Found multiple elements with the role "article"`) |
| 2 | Unmodified file, all Scheduler callbacks delayed by 100 ms (`DELAY_IMMEDIATE=100`), four CPUs, isolated | **10 failures in 10 runs** | Each run fails the `21`, `40`, `41`, `401` and `403` cases |
| 3 | Candidate correction applied, same delay as row 2 | **0 failures in 10 runs** | — |
| 4 | Diagnostic `41` case, delay armed only from the first append on (`DELAY_IMMEDIATE=targeted`) | **20 failures in 20 runs** | Exact CI signature; 20 of 20 logs contain `history?cursor=page20 -> 404` |
| 5 | Same as row 4 plus “wait for exactly one observing observer” before firing | **0 failures in 20 runs** | — |
| 6 | Full suite, unmodified, `npm run test`, four CPUs (CI-equivalent command, not a CI runner) | **0 failures of this test in 10 runs**; 1 of the 10 runs failed in a different file | See [B.6](#b6-additional-finding--invitationtesttsx-focus-assertion) |

Rows 2–5 are deterministic causal evidence. Row 1 is a frequency estimate for
this machine only and says nothing reliable about the CI rate.

#### Temporary correction experiment

The [candidate test correction](ci-reliability/experimental-patches.md#312-candidate-test-correction)
changes only `GamesHistory.test.tsx`:

- the mock records observers in `observe()` and removes them in
  `disconnect()`;
- an `intersect(times)` helper first waits until exactly one observer is
  observing and then fires that observer inside `act`;
- every direct `intersect()` call uses the helper; the double fire that
  proves `pagePending` deduplication is kept (`intersect(2)`).

It keeps every assertion, including request counts, order and cursors. It
passes `tsc -b` and `eslint` in the worktree. It was not committed.

#### Recommended permanent correction

1. Apply the test correction above (small, test-only).
2. Make `gameApi` fail loudly for an unregistered history page instead of
   letting it match the generic game route — for example by recording
   unexpected requests and asserting that the list is empty, or by throwing
   for unknown `…/games/history?…` URLs. This turns the next occurrence of
   any duplicated or wrong-cursor request into a named request in the failure
   output. *Not yet exercised experimentally.*
3. No `GameManager` change is recommended. A disconnected real observer does
   not deliver callbacks, and “Erneut versuchen” always uses the current
   `append`.

Regression requirements to preserve: 0/1/20/21/40/41 boundaries, server
order, cursor correctness, deduplication, the terminal end state, 401/403
removal of private rows, stale-response fencing, and the exact request count.

#### Remaining uncertainties

- The CI run itself cannot be replayed; the match is by identical DOM,
  identical failing line and a mechanism that reproduces both.
- The natural frequency under real CI load is unknown.
- The millisecond-boundary model for the timer/`setImmediate` order is
  reasoned, not measured.

### B.2 #298 — WebKit member-deck screenshot timeout

**Classification: CONFIRMED ROOT CAUSE — test-helper synchronization error.
The correction is already on `main`; no product defect was found.**

#### Links and failure description

- Issue: [#298](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/298).
- CI: [run 43276883976](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43276883976),
  [WebKit job 131387541923](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43276883976/job/131387541923),
  PR #297 at `e748ed9e4530b2f3240619ecdc8cc2c333f74f03`: 3 failed, 114 passed,
  1 skipped. All three failures are `e2e/member-decks.pw.ts` at 320, 390 and
  1280 px with `page.evaluate: Test timeout of 30000ms exceeded` inside the
  `shot()` helper before the `member-decks-02a-long-list` screenshot.
  (Failure details are taken from the issue text; the job log and trace were
  not re-read — see [E.5](#e5-missing-or-unavailable-evidence).)

#### History that the issue does not record

PR #297 received a third commit, `befb4ed0fb7996342baf00822c601240d31a5b06`
(“test: wait only for visible artwork before member-deck screenshots”), 36
minutes after the issue was written. It was squash-merged with the PR as
`f558c58`. The baseline commit therefore already contains the changed helper:
it waits only for incomplete images inside the viewport, through `load`/`error`
events, bounded to five seconds. Issue #298 stayed open and its acceptance
criteria were never checked against that change.

#### Competing hypotheses

1. WebKit never settles `decode()` for lazy images that it has not requested.
2. An artwork request is routed but never fulfilled.
3. WebKit rejects or stalls on decoding the synthetic SVG artwork itself.

#### Experiments and observations

Environment: pinned CI image `mcr.microsoft.com/playwright:v1.64.1-noble`
(WebKit 27.2, Chromium 156.0.8078.4), Node 24.22.3, one worker, `CI=true`,
container limited to two CPUs. A diagnostic spec
([patch](ci-reliability/experimental-patches-browser.md#298--frontende2ediag-298pwts)) reuses the
original fixtures and stops at the `02a` step.

**Per-image probe (one run per width and engine).** For each of the 12
artwork images it records geometry, `complete`, the list of requested artwork
URLs and whether `decode()` settles within 3 s.

| Engine | Width | Artwork requested | `complete` before probe | `decode()` still pending after 3 s |
| --- | --- | --- | --- | --- |
| Chromium | 320 / 390 / 1280 | 12 of 12 | 12 of 12 | none |
| WebKit | 320 | 6 of 12 | 0 of 12 | the 6 images never requested |
| WebKit | 390 | 9 of 12 | 9 of 12 | the 3 images never requested |
| WebKit | 1280 | 8 of 12 | 8 of 12 | the 4 images never requested |

Every image is `loading="lazy"`. Chromium's lazy-loading distance covers the
whole clipped list, so all images are complete and the helper has nothing to
wait for. WebKit requests only images near the viewport; for the others
`decode()` neither resolves nor rejects. This supports hypothesis 1.
Hypothesis 2 is excluded for those images because no request was issued at
all. Hypothesis 3 is excluded for the images that did load.

Side observation, unexplained: in the first WebKit test of a fresh worker
(320 px), the six requested images reported `complete === false` and their
`decode()` rejected with `EncodingError` after about 1.5 s. A rejection is
harmless for both helper versions (the original caught it). It was not
investigated further.

**Induction and correction under identical conditions.**

| Helper under test | Engine | Result | Observation |
| --- | --- | --- | --- |
| Original (`decode()` for every incomplete image) | WebKit | **3 failures in 3 runs** (one per width) | `page.evaluate: Test timeout of 30000ms exceeded` — the CI signature |
| Original | Chromium | 0 failures in 3 runs | helper settled in 6–12 ms |
| Merged (viewport-only, `load`/`error`, 5 s bound) | WebKit | **0 failures in 60 runs** (20 per width) | longest helper wait 1,095 ms |
| Complete `e2e/member-decks.pw.ts` at the baseline | WebKit | 0 failures in 5 tests (one run) | |

#### Assessment of the merged correction

It removes the failure mechanism: the unbounded wait on images that the
engine will not load is gone. Two properties are worth knowing:

- The five-second bound means a visible image that never loads delays the
  screenshot but no longer fails the test. The screenshot is evidence, not an
  assertion, so this does not weaken a behavioral check. If artwork presence
  ever needs to be asserted, it should be an explicit expectation.
- The same `decode()` call exists in other browser specs
  (`claims.pw.ts`, `invitations.pw.ts`, `mana.pw.ts`, `mana-materials.pw.ts`),
  but only on images created in the test with an explicit `src` (never
  lazy), so the #298 mechanism does not apply to them.

#### Recommendation

No code change. Issue #298 can be closed by the PO once this verification is
accepted. Later CI runs on `main` were not surveyed for this section, and no
run was triggered for this investigation.

#### Remaining uncertainties

- The original trace was not inspected, so the per-image state in the failed
  CI run is inferred from the local reproduction.
- Whether WebKit's behavior is intended was not researched; the conclusion
  does not depend on it.

### B.3 #306 — Game Details focus and scroll restoration

The two failures recorded in #306 have **different causes**. Neither is
caused by the synthetic window `focus` event that both tests dispatch: in
every experiment the event itself changed neither focus nor scroll position
nor the number of protected reads.

#### B.3.1 Vitest: focus moves from the ManaBox link to the heading

**Classification: CONFIRMED ROOT CAUSE — test synchronization on a passive
focus effect. Same mechanism class as #312.**

- CI: [run 43575301645](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43575301645),
  [frontend job 132388123968](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43575301645/job/132388123968),
  PR #313 at `038e6573b3d6d8909245a39f6ffcb7cba9133e9f`: 1 failed, 1,062
  passed. `src/GameDetailsPage.test.tsx:719`, mode `details`: expected the
  Deck 1 ManaBox `<a>`, received `<h2>Spieldetails</h2>` (from the issue
  text; the job log was not re-read).
- Code: `GameDetailsPage.tsx` line 87 focuses the heading in a passive
  effect, `useEffect(() => { if (state.status === 'ready') heading.current?.focus() }, [state])`.
  The test awaits `findByRole('link', …)`, focuses the link, records
  `document.activeElement` as its baseline and later awaits an async `act`.

Competing hypotheses: (1) the heading effect of the *initial* load runs after
the test took its baseline; (2) the window focus event triggers a re-read
and a new `ready` state, re-running the effect; (3) a dialog or router focus
side effect.

Experiment: an instrumented copy of the test
([patch](ci-reliability/experimental-patches.md#306-vitest-diagnostics))
records every `focusin` and, with `DELAY_IMMEDIATE=gate`, parks the React
Scheduler task that follows the commit rendering the link (the passive
effects) until the test has focused the link. Recorded sequence:

```text
3080.7 link committed; passive effects parked
3161.5 findByRole(link) resolved; active=main
3173.2 focusin a                      <- test focuses the ManaBox link (baseline)
3173.3 parked host callbacks released (ManaBox link focused)
3176.1 focusin h2"Spieldetails"       <- initial heading focus arrives late
3179.9 assertion; baseline=a active=h2"Spieldetails"
```

The heading focus belongs to the initial load, there is no second read
(`api.calls` assertions unchanged), so hypotheses 2 and 3 are not needed.

| # | Conditions (Vitest 5.0.0, one test, four CPUs, baseline commit) | Result |
| --- | --- | --- |
| G1 | Gate, unmodified assertions | **10 failures in 10 runs**, each with baseline `<a>` and active `<h2>Spieldetails</h2>` |
| G2 | Gate, test first waits for the heading to have focus | **0 failures in 10 runs** |
| G3 | Gate, application focuses the heading in `useLayoutEffect`, test unmodified | **0 failures in 10 runs** |
| G4 | Application change of G3, complete `GameDetailsPage.test.tsx`, no gate | 89 of 89 tests passed (one run) |
| — | Unmodified, full suite `npm run test` | 0 failures of this test in 10 runs (one of the ten ran while this file was briefly replaced by its instrumented copy; see [E.2](#e2-deviations-from-ci)) |

A first version of the gate released the parked task after a fixed 2 ms; it
failed only 1 of 10 runs because the release raced the test on a fast
machine. It was replaced by the event-driven release above and is mentioned
only for completeness.

Recommended correction (either is sufficient; both keep the assertion that a
window refocus does not move focus):

- Test-only: after `findByRole('link', …)`, wait for the initial focus,
  `await waitFor(() => expect(screen.getByRole('heading', { name: 'Spieldetails' })).toHaveFocus())`,
  before taking the baseline. This also asserts the initial-focus
  accessibility behavior that must be preserved.
- Application: move the initial focus to `useLayoutEffect`
  ([candidate](ci-reliability/experimental-patches.md#306-candidate-application-correction-initial-focus-in-a-layout-effect)),
  as `DeckEditor.tsx` already does. Focus is then applied in the commit that
  shows the content. See [slice 6](#d2-product-corrections-that-need-a-po-decision).

Remaining uncertainty: the natural frequency was not measured in isolation.

#### B.3.2 WebKit: scroll position 227 becomes 585

**Classification: LIKELY ROOT CAUSE — WebKit applies focus scrolling after
`focus()` returns; the test reads its baseline immediately. Not a product
defect on the available evidence.**

- CI: [run 43335069814](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43335069814),
  [WebKit job 131589075380](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43335069814/job/131589075380),
  PR #305 at `d8559a5c416582bd9dc6630f51cd05933e2944d7`: 1 failed, 155
  passed, 1 skipped. `e2e/game-details.pw.ts`, “normal details at 1280px”,
  in `refocus()` right after `await manaBox.focus()`: expected `227`,
  received `585` (from the issue text).

Competing hypotheses: (1) WebKit scrolls for `focus()` asynchronously and
the baseline is premature; (2) dialog focus restoration or MUI's scroll lock
moves the page; (3) the window focus event or an application effect scrolls.

Observations in the pinned image (WebKit 27.2, Chromium 156; viewport
1280×900; diagnostic specs in the
[browser patches](ci-reliability/experimental-patches-browser.md#306--frontende2ediag-306pwts)):

- **Geometry.** The document's maximum scroll offset is 585. Document
  positions: winner button 1039–1083, Companion button 1083–1127, ManaBox
  link 1151–1195. **227 = 1127 − 900**: the smallest offset at which the
  Companion button is fully visible. At 227 the ManaBox link is still below
  the viewport.
- **Normal timeline (both engines).** The first `winner.focus()` moves the
  page from 0 to 585 and it stays there through both dialogs and the ManaBox
  step. In a normal run the ManaBox focus therefore cannot scroll at all;
  body `overflow: hidden` from MUI's scroll lock never changed the offset.
- **Engine difference** (`diag-306b`, one run per engine and variant):

  | Engine | `scrollY` before `focus()` | immediately after | after a microtask | after `setTimeout(0)` |
  | --- | --- | --- | --- | --- |
  | Chromium | 0 | 585 | 585 | 585 |
  | WebKit | 0 | **0** | **0** | 585 |

  WebKit defers the scroll that reveals a focused element; Chromium
  performs it inside `focus()`. The same result was obtained with body
  `overflow: hidden` set in the same task.

| # | Conditions (“normal details at 1280px”, one worker, `CI=true`) | Result |
| --- | --- | --- |
| N | Unmodified sequence with timeline logging, WebKit, container on two CPUs shared with another WebKit container | **0 failures in 60 runs**; offset 585 at every step |
| P | Page forced to offset 0 before the Companion tap, otherwise unmodified, WebKit | 0 failures in 20 runs; in **1 of 20** the page rested at 227 from the tap until the ManaBox focus (the state the CI log implies) and the deferred scroll had completed before the baseline was read |
| Q1 | Offset set to 227 before the ManaBox step; baseline read in the same task as `focus()` | WebKit: **10 failures in 10 runs**, each `Expected: 227, Received: 585`; Chromium: **0 failures in 10 runs** (baseline already 585) |
| Q2 | Offset 227; unmodified baseline (separate protocol call after `focus()`), WebKit | 0 failures in 30 runs (baseline 585 every time) |
| Q3 | Offset 227; candidate “let the scroll settle, then read the baseline”, WebKit | 0 failures in 30 runs |

What this establishes: given the offset the CI log reports, WebKit's
deferred focus scroll produces exactly the reported numbers whenever the
baseline is read first, and Chromium cannot fail this way. Hypothesis 3 is
not supported; hypothesis 2 is not needed for the numbers.

What it does not establish, and why the classification is not CONFIRMED:

1. Why the page was at 227 instead of 585 in the failed run. An earlier
   deferred scroll (for the winner button) must not have been applied before
   Playwright scrolled minimally for the tap. That state was seen once (row
   P) but could not be forced: activating the winner button in the same task
   as focusing it still ended at 585 in WebKit.
2. That a separate protocol round trip can overtake the deferred scroll. It
   never did locally (rows Q2 and N).
3. Row Q3 cannot fail by construction, so the candidate was not shown to
   remove an induced failure under identical conditions.

Recommended correction (test-only, lower confidence): after `manaBox.focus()`
wait until the link is inside the viewport and `scrollY` is unchanged for two
animation frames, then call `refocus()` unchanged. The invariant “a window
focus event does not scroll” keeps its meaning and gets a stable baseline.
The same applies to the other `locator.focus()` calls of this spec that are
followed by a position read. Trace-level confirmation from artifact
`13997780889` would close gap 1.

### B.4 #315 — claim-dialog focus restoration

**Classification: CONFIRMED ROOT CAUSE — a hard-coded fixture timestamp that
has expired activates the dialog's expiry re-check, and that re-check exposes
a product accessibility defect. The failure is not WebKit-specific and is
independent of #306.**

#### Links and failure description

- Issue: [#315](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/315).
- CI: [run 43575301645](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43575301645),
  [WebKit job 132388123986](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43575301645/job/132388123986),
  PR #313 at `038e6573b3d6d8909245a39f6ffcb7cba9133e9f`, finished
  14 November 2026 08:34 UTC. The log tail was read: 1 failed, 1 skipped,
  160 passed in 14.0 minutes (job limit: 15 minutes). The failure detail is
  taken from the issue: `claims.pw.ts:192`, after Escape closes “Einladung
  ersetzen?”, `Neue Einladung erstellen` is `inactive` for five seconds.

#### Relevant code

- `e2e/claims.pw.ts` line 25: the mock reports `expiresAt: '2026-11-13T18:45:00Z'`
  for every active invitation. The spec reached `main` on 13 November 2026
  at 21:40 UTC, about three hours after that instant.
- `ProfileClaimDialog.tsx`: when the device clock reaches `expiresAt`, the
  dialog performs a read-only status GET and, while the server still reports
  the invitation active, repeats it with backoff (immediately, then after
  1 s, 2 s, 4 s … up to once a minute). Every request goes through `run()`,
  which sets `busy`. While `busy`, all action buttons are `disabled`, and the
  confirmation's `onClose` is `undefined`.
- MUI's focus trap restores focus to the element that had focus when the
  nested dialog opened, and re-focuses its own container when it finds
  focus on `<body>`.

#### Competing hypotheses

1. A race between the nested and the parent MUI focus trap.
2. WebKit does not focus buttons on click, so there is nothing to restore.
3. The restored button loses focus afterwards for a reason outside MUI.

#### Experiments and observations

All runs: pinned image, 1280×844, one worker, `CI=true`; diagnostic specs in
the [browser patches](ci-reliability/experimental-patches-browser.md#315--frontende2ediag-315pwts).

**Natural reproduction with a focus log (no intervention).** In every run,
passing or failing, the click focuses the button, the nested dialog takes
focus with the button as the element to restore, and Escape restores focus
to the button. Hypotheses 1 and 2 are therefore not what fails. In failing
runs the log continues:

```text
9341ms focusin  target=button"Neue Einladung erstellen"        <- restored correctly
9350ms keyup(Escape) target=button"Neue Einladung erstellen"
9388ms focusout target=button"Neue Einladung erstellen" related=null
         BLUR-TO-NOTHING connected=true disabled=true stack=    <- browser-initiated, button is disabled
9391ms MARK after Escape: active=body
9554ms focusin  target=div[role=presentation].MuiDialog-container  <- parent trap picks up focus
```

The button is disabled at the moment it loses focus, and no script is on the
stack. Final focus is the parent dialog's container in all failing runs.

**Second symptom, same cause.** One run failed earlier, at
`expect(replace).toHaveCount(0)`: Escape arrived while a re-check was in
flight, and the confirmation ignores Escape while `busy`.

**Not engine-specific** (`diag-315b`: focus the button, observe 4.5 s):

| Engine | Fixture expiry | Status re-checks | Focus after 4.5 s |
| --- | --- | --- | --- |
| Chromium | past (as on `main`) | at about 1 s and 3 s | **lost**: `focusout` at the first re-check, then `<body>`, then the dialog container |
| WebKit | past | at about 1 s and 3 s (buttons disabled for 7–9 ms each) | kept in this run |
| Chromium / WebKit | 45 minutes in the future | none | kept |

Chromium drops focus the instant the button is disabled. WebKit needs the
disabled state to last through a rendering update, which is why it shows up
under load. Chromium's faster test run simply tends to finish the step
between two re-checks.

#### Repeated-run results

| # | Conditions | Result |
| --- | --- | --- |
| R1 | Unmodified steps with logging, WebKit, container on two CPUs shared with a second WebKit container | **17 failures in 40 runs**: 16× button `inactive` (the CI signature), 1× confirmation not closed |
| R2 | Same, WebKit, container on one CPU, nothing else running | 1 failure in 12 runs (CI signature) |
| I1 | Reopened dialog learns an expiry 9 s ahead; Escape pressed 150 ms before it; status GET delayed 150 ms | **16 failures in 16 runs** (8 Chromium, 8 WebKit), all `Received: inactive`, focus on the parent dialog container |
| C1 | Fixture expiry 45 minutes after the real clock, same steps and latency, no alignment possible because no re-check occurs | **0 failures in 16 runs** (8 per engine) |
| C2 | Application candidate (background expiry check does not set `busy`), same alignment and latency as I1 | **0 failures in 16 runs** (8 per engine); `ProfileClaim.test.tsx` 57 of 57 passed |

During an unrelated run of the complete, unmodified `claims.pw.ts` and
`invitations.pw.ts` in both engines, this test failed once more at 1280 px
in WebKit (1 failed, 81 passed).

#### Root cause chain

1. The fixture's expiry is an absolute instant that has passed.
2. From dialog open on, the status is re-read at 0 s, +1 s, +2 s, +4 s ….
3. Each re-read disables every action button for the duration of the GET.
4. If that happens while a button holds focus, the browser removes focus.
   Nothing restores it to the button; MUI's trap later focuses the dialog
   container.
5. The test's close-and-check step takes about 250 ms; at 1280 px in WebKit
   it tends to coincide with the re-check about 3 s after the dialog opened.
   Slower runs hit it more often.

Why it appeared on 14 November in a PR that did not touch these files: the
trigger is the calendar, not a code change.

#### Product defect (independent of the test)

Severity low, accessibility: once an invitation's expiry instant has passed
while the issuer dialog is open, each background re-check (at most once a
minute after backoff) removes keyboard focus from a focused action button
and ignores Escape on an open confirmation while it is in flight. It never
sends a mutation; the security contract of #247 is unaffected.

#### Recommended permanent correction

1. **Test (immediate, small):** derive the fixture expiry from the real
   clock (for example 45 minutes ahead) in `claims.pw.ts`. Keep the
   dedicated scenario “a device clock past the expiry never hides an active
   invitation” with an explicitly past expiry. The assertion on the
   `Gültig bis dd.mm., hh:mm Uhr` format is unaffected.
2. **Application (needs a PO decision and its own issue):** a background,
   read-only expiry check must not disable controls or swallow Escape. The
   [candidate](ci-reliability/experimental-patches.md#315-candidate-application-correction-background-expiry-check-does-not-disable-controls)
   demonstrates the focus behavior only; what a user action does while the
   check is in flight still needs to be designed and tested.
3. Regression requirements: cancel paths send no mutation; replacement and
   revocation keep their confirmations; expiry stays server-authoritative.

#### Remaining uncertainties

- The CI trace was not inspected; the match is by signature, focus
  destination and timing.
- Three other fixtures use absolute timestamps from the same evening
  (`e2e/invitations.pw.ts`, `Invitation.test.tsx`, `ProfileClaim.test.tsx`).
  Only `ProfileClaimDialog` has an expiry re-check, and no failure was traced
  to them, but they were not examined individually.

### B.5 #320 — Chromium cross-tab account switch

**Classification: CONFIRMED ROOT CAUSE — product defect: the sign-in form is
interactive before the application applies its focus, so input is
redirected. Independent of #315. No security impact was observed.**

#### Links and failure description

- Recorded in [#314](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/314);
  [PR #320](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/320)
  at `75effb13743d0ede47093fe52ef4d4c93a3c3b32`,
  [run 43589525560](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43589525560),
  [Chromium job 132431097031](https://github.com/GandalfTheJunior/mtg-commander-stats/actions/runs/43589525560/job/132431097031):
  1 failed, 166 passed. `e2e/claims.pw.ts:332`; at line 348 the second tab
  never shows `Frodo` after the sign-in was submitted (from the tracker
  text; log and trace not read). PR #320 does not touch the claim or
  session code.

#### Relevant code

- `App.tsx` `logOut(resume)`: after the DELETE succeeds it sets
  `sessionStatus` to `signed-out` and calls `navigate(claimReturn, { state: { inviteAuth: 'login' } })`.
  The router publishes a navigation as a React transition, so the status
  change commits first and the new location in a later render.
- `App.tsx` (effect near line 82): a passive effect focuses `#auth-login-email` once
  `inviteAuth` is known. `submitLogin` computes the post-login destination
  from the `location` of its render.

#### Competing hypotheses

1. The shared mock's `state.user` is changed by the first tab.
2. The login response is discarded by a session-version change.
3. The form is submitted too early and the user is sent elsewhere.
4. The form is never submitted.

#### Experiments and observations

Pinned image, Chromium 156, 390×844, one worker, `CI=true`, baseline commit;
spec `diag-320`
([patch](ci-reliability/experimental-patches-browser.md#320--frontende2ediag-320pwts)).

**Natural reproduction.** The unmodified steps failed in 8 of 110 runs
(3 of 30, 4 of 40, 1 of 40). Every failing run that was instrumented shows
the same state: the second tab is still on the sign-in screen at the claim
URL, **no `POST /api/session` was sent**, the email field holds 39
characters and the password field none. 39 is the email (18) plus the
password (21). The requests end with `DELETE /api/session`; hypotheses 1 and
2 require a login request and are excluded. The first tab sent nothing.

**Who moved the focus.** With `HTMLElement.prototype.focus` wrapped:

```text
 997.9ms history.replaceState(/claim/…) usr={"inviteAuth":"login"}
1054.0ms A: sign-in form appeared
1113.0ms input #auth-login-email valueLength=18          <- email filled
1163.1ms focus() on email by script: at src/App.tsx:104  <- the detour effect, 109 ms after the form appeared
1169.9ms input #auth-login-email valueLength=39          <- password text lands in the email field
1238.2ms invalid #auth-login-email / #auth-login-password <- native validation blocks the submit
```

In passing runs the same effect runs 45–58 ms after the form appears,
before the first input. The browser's `insertText` goes to whichever element
has focus, exactly as keyboard input does.

**Stale destination, same gap.** If the form is submitted before the
location commit, the login succeeds but `submitLogin` still sees the old
location and navigates to `/dashboard` instead of the claim link (1 of 1
when submitted at first appearance; `/claim/…` when submitted after the
effect). With a 6× CPU throttle on the second tab the unmodified steps
ended on `/dashboard` in **15 of 15 runs** (the name `Frodo` is visible
there, so the CI assertion does not detect this variant).

#### Repeated-run results

| # | Conditions | Result |
| --- | --- | --- |
| N | Unmodified steps | **8 failures in 110 runs**, CI signature |
| S1 | In-page user model: enter the email and focus the password field when the form appears, type the password 400 ms later into the focused element, click “Sign in” | **10 failures in 10 runs**; password typed into `#auth-login-email`, no login request |
| S2 | Test correction: wait until the email field has focus, then the unmodified steps | **0 failures in 40 runs** |
| S3 | Rejected application attempt (`flushSync` navigation before the status change, focus in a layout effect), same as S1 | 10 failures in 10 runs — ineffective; also still `/dashboard` in 10 of 10 throttled runs |
| T3 | Application candidate (status change published in the same transition as the navigation, focus in a layout effect), same as S1 | **0 failures in 10 runs**; focus is applied before the form is observable |
| T5 | Same candidate, unmodified steps, 6× CPU throttle | 10 of 10 runs end on the claim link |
| — | Same candidate: `ProfileClaim`, `Invitation`, `Logout`, `App`, `AuthPresentation` Vitest files | 200 of 200 tests passed (one run) |

#### Assessment

- **Not a security vulnerability on this evidence.** In every run
  `api.accepts` stayed 0; nothing was claimed, and no request carried a
  wrong identity. The failure occurs before the invariant is exercised, so
  the invariant was simply not tested in those runs.
- **A real usability and privacy defect, low to medium severity.** For
  45–110 ms on test hardware — hundreds of milliseconds under a 6× throttle
  — a visible, enabled form accepts input and then has its focus moved.
  Consequences: password characters readable in the email field, a blocked
  submit, or a sign-in that lands on the Dashboard instead of the claim
  link. A person rarely types that quickly; scripted input, assistive input
  tools and slow devices can.

#### Recommended permanent correction

1. **Application (own issue, PO decision):** publish the signed-out state
   and the return navigation in one render and focus the field in a layout
   effect
   ([candidate](ci-reliability/experimental-patches.md#320-candidate-application-correction-publish-the-signed-out-state-with-the-navigation)).
   It removes both the misdirected input and the stale destination. Other
   callers of the same effect (registration detour, invitation links) need
   the same check.
2. **Test (small, immediate, also valid after 1):**
   `await expect(login.getByLabel('Email')).toBeFocused()` before filling
   the form. It synchronizes on documented behavior instead of a delay.
3. Preserve the client-side identity re-check before the accept and the
   server-side `expectedAccountId` mismatch protection; neither candidate
   touches them. After a fix, the complete cross-tab test must run to its
   `api.accepts === 0` assertion.

#### Remaining uncertainties

- The CI artifact was not inspected. The CI signature (no `Frodo` in the
  second tab) matches; the field contents in CI are inferred.
- The candidate was not run against the complete browser suites.

### B.6 Additional finding — `Invitation.test.tsx` focus assertion

**Classification: CONFIRMED ROOT CAUSE — same class as B.3.1. Not yet
tracked in any issue.**

Observed without intervention in run 6 of the ten full-suite baseline runs
(`npm run test`, four CPUs, baseline commit): `src/Invitation.test.tsx:401`,
`an already active member gets the distinct notice without a second join`,
`expect(await screen.findByRole('heading', { name: 'Du bist bereits Mitglied' })).toHaveFocus()`
— expected the `<h2>`, received `<body>`. `InvitationPage.tsx` line 97
focuses that heading in a passive effect; the assertion checks once, as soon
as the heading exists.

| Conditions (one test, baseline commit) | Result |
| --- | --- |
| Unmodified, all Scheduler host callbacks delayed 100 ms | **5 failures in 5 runs**, expected `<h2>`, received `<body>` |
| `InvitationPage` focuses in `useLayoutEffect`, same delay | **0 failures in 5 runs**; complete file 35 of 35 passed without delay |
| Unmodified, full suite | 1 failure in 10 runs |

The same one-shot pattern, `expect(await …findBy…).toHaveFocus()`, occurs at
eight places (`ProfileClaim.test.tsx` 6, `GameDetailsPage.test.tsx` 1,
`Invitation.test.tsx` 1). Five components move focus in passive effects
(`ClaimPage`, `GameDetailsPage`, `GameEditorPage`, `InvitationPage`,
`ProfileClaimDialog`); `DeckEditor` and `GameEditor` already use layout
effects.

### B.7 Historical incidents

These were assessed **from issue and PR texts and the current code only**.
No historical commit was checked out and no test was re-run, so each
assessment is the fourth category of the assignment unless stated.

| Issue | Delivered change | Assessment |
| --- | --- | --- |
| #129 native Back/discard (PR #132) | The PR reports direct instrumentation: the old test clicked a button of an *exiting* MUI dialog, and a stale Discard handler could run with nothing pending. Closing buttons are now disabled immediately, Discard requires a pending navigation, and the test waits for dialog removal plus restored URL, index, draft and focus. | **Eliminated a demonstrated mechanism and corrected test synchronization** (categories 1 and 2), on the PR's own evidence. The PR also discloses unexplained local failures in other tests (a 5 s timeout, slow initial loads) that were never explained. In this investigation the native-Back test did not fail in 10 full-suite runs. |
| #142 Vitest runtime and stability (PR #154) | Visible on `main`: runners with at most two CPUs get a 15 s test timeout, one worker and serialized “interactive” suites; others keep 5 s and full parallelism. | **Cannot be evaluated conclusively.** The PR text was not read. The larger timeout on small runners is a resource accommodation rather than a cause removal, and the CI log read for #312 used the other configuration, so it did not influence the failures examined here. None of the current failures is a timeout. |
| #268 WebKit playground (PRs #295, #301) | Per the closure comment: `hall.pw.ts` no longer asserts a minimum random amplitude in a short window but actual repaint progress; `landing.pw.ts` got explicit preconditions and diagnostics. | **Corrected test instrumentation** for the hall case (category 2): a threshold on a random signal is a test-design cause, and it was removed. **Not evaluable** for the landing case; the closure itself records an unreproduced 1.46 px deviation. Neither test was re-run here. |
| #268 comment: `statistics.pw.ts` strict-mode violation | Two “Erneut versuchen” buttons after a cross-feature change. | On `main` the click is scoped (`alert.getByRole(…)`). A deterministic locator ambiguity, not a flake; resolved in the code. |

Common thread with the active incidents: #129 was also “the test acted on
something that was visible but not settled” (an exiting dialog). The fix
pattern that worked there — assert the completed state before the next
action, and make the product ignore stale interactions — is the one
recommended here.

## C. Cross-incident analysis

### C.1 Shared mechanism supported by experiments: visible before settled

| Failure | What became visible | What settled later | How it was shown |
| --- | --- | --- | --- |
| #312 | 40 game cards | the `IntersectionObserver` for the next page (passive effect) | Scheduler delay: 20 of 20, 10 of 10 |
| #306 Vitest | the ManaBox link | initial heading focus (passive effect) | Scheduler gate: 10 of 10 |
| Invitation (new) | the “already member” heading | its focus (passive effect) | Scheduler delay: 5 of 5 |
| #320 | the sign-in form | router location and email focus (transition render, then passive effect) | user model in the page: 10 of 10; natural 8 of 110 |

In all four, one intervention — letting the test or user act between a
commit and the work React schedules after it — produces the CI signature,
and settling first removes it. React Testing Library's `waitFor`/`findBy…`
and Playwright's visibility checks both return on DOM state; neither waits
for passive effects or pending transitions. In the first three the product
is unaffected in practice and the test is wrong; in #320 a user can be hit.

### C.2 Independent causes

- **#298** — WebKit never settles `decode()` for unrequested lazy images.
  Shares nothing with the others beyond “WebKit”.
- **#315** — calendar-dependent fixture plus a `busy` flag that disables
  controls during a background read. Engine-independent. It is **not**
  related to #306 although both mention focus and WebKit, and **not**
  related to #320 although both live in `claims.pw.ts`.
- **#306 WebKit** — engine difference in when `focus()` scrolls (likely).
  Independent of the #306 Vitest failure.

### C.3 Hypotheses from the issues that the evidence does not support

- #306: “a window refocus changes focus, scroll or reads” — not observed in
  any run; the synthetic event was never the cause.
- #315: “a race between nested MUI focus traps” and “WebKit-only” — focus
  restoration works; the button is disabled afterwards, in both engines.
- #312: “application pagination or recovery coordination” — the duplicate
  request comes only from a disconnected mock observer.
- #314 on #320: “browser-context-wide session mocking / session epochs” —
  no login request is sent at all in the failing runs.

### C.4 Systemic weaknesses

1. **Focus management in passive effects.** Five components and `App` move
   focus in `useEffect`; eight assertions check focus once.
2. **Permissive test doubles.** A mock observer that fires after
   `disconnect()`; an API fixture that answers unknown URLs with a plausible
   `404`. Both turned an instrumentation error into apparent product behavior.
3. **Absolute timestamps in fixtures.** Four fixtures use instants from the
   evening they were written. One of them changed product behavior once it
   passed. Such tests are green when written and fail later without a diff.
4. **One flag for two purposes.** `busy` both prevents double submission and
   marks background reads, so a read disables the UI.
5. **Engine timing assumed.** A test assumed that `focus()` has finished
   scrolling when it returns; a helper assumed every image will load.
6. **Thin failure evidence.** Logs show the assertion but not the focused
   element, scroll offset or request list at failure. Each of those would
   have identified #315, #320 and #312 from the first CI log. The artifacts
   that contain them are about 300 MB each (video for every test) and were
   not retrievable in this environment.
7. **WebKit job headroom.** The one WebKit log read ran 14.0 minutes against
   a 15-minute job limit. A cancellation recorded in #314 (PR #313, run
   43523640217) is consistent with that limit but was **not verified**.

Correlated but not shown to be causal: most incidents surfaced in WebKit
jobs. For #315 this is timing (slower run, wider disabled window), for #306
and #298 engine behavior, and #312, #320 and the Invitation failure do not
involve WebKit at all.

## D. Prioritized implementation plan

Each slice is meant to be its own small PR. None is authorized by this
report. Interaction with initiative #172: no slice touches files changed by
the open PR #320 (`FullCardView.tsx`, `api.ts`, token tests); slices 5–7
change production components that #172 work may also edit, so they should
be rebased on whatever `main` is at implementation time and re-verified with
the commands in [E.3](#e3-exact-commands).

### D.1 High-confidence targeted corrections (test-only)

**Slice 1 — #315: clock-relative expiry in the claim fixture.**
Objective: stop the expiry re-checks that currently run through every
issuer-dialog scenario. Scope: `frontend/e2e/claims.pw.ts` (mock
`expiresAt`), keeping the explicit past-expiry scenario. Evidence: B.4 rows
I1/C1 (CONFIRMED). Verification: repeat row R1's conditions (loaded two-CPU
container, at least 40 WebKit runs of the 1280 px scenario) and both browser
suites. Risk: low. Expected impact: removes today's most frequent failure.
New issue: no (#315). Preserve: every assertion of the spec, including the
`Gültig bis` format and the no-mutation checks.

**Slice 2 — #312: deterministic observer mock.**
Scope: `frontend/src/GamesHistory.test.tsx` only;
[candidate](ci-reliability/experimental-patches.md#312-candidate-test-correction).
Evidence: B.1 rows 2–5 (CONFIRMED). Verification: rows 2–5 again with the
experimental delay (expected 0 failures), unmodified full suite, lint,
typecheck. Risk: low. Also makes the three “retired append response” tests
meaningful. New issue: no (#312).

**Slice 3 — #320: synchronize the cross-tab test on the detour focus.**
Scope: `frontend/e2e/claims.pw.ts` — wait for the email field to be focused
before filling the form in the cross-tab test and in
`Anderes Konto verwenden returns to the same link…`. Evidence: B.5 row S2
(CONFIRMED mechanism; the test change itself is supported statistically,
0 in 40 against 8 in 110). Risk: low; it hides nothing, because the product
defect is tracked by slice 5. New issue: yes, a focused issue for #320
covering slices 3 and 5.

**Slice 4 — #306 Vitest and the one-shot focus assertions.**
Scope: `GameDetailsPage.test.tsx` (wait for the initial heading focus before
the baseline) and the eight `expect(await …findBy…).toHaveFocus()` sites
(`waitFor` around the focus expectation). Evidence: B.3.1, B.6 (CONFIRMED).
Not needed if slice 6 is implemented first; the PO chooses one of the two
or both. New issue: reuse #306 for Game Details; the Invitation occurrence
needs a short new issue or a note in #314.

### D.2 Product corrections that need a PO decision

**Slice 5 — #320: sign-out return without an interactive gap.**
Objective: the sign-in form must not be usable before its location and focus
are final. Scope: `frontend/src/App.tsx` (`logOut`, the detour focus
effect); check the registration and invitation detours too.
[Candidate](ci-reliability/experimental-patches.md#320-candidate-application-correction-publish-the-signed-out-state-with-the-navigation)
(CONFIRMED under induction, B.5 rows T3/T5); a `flushSync` variant was tried
and rejected. Verification: `diag-320` variants `induce-steal` and throttled
`natural`, the complete browser suites, Vitest `App`, `Logout`,
`Invitation`, `ProfileClaim`, `AuthPresentation`, plus a regression test for
the stale destination. Risk: medium — session state transitions are
security-relevant; the identity re-check and `expectedAccountId` protection
must stay untouched and covered. New issue: yes.

**Slice 6 — initial focus in layout effects.**
Scope: the focus effects in `GameDetailsPage`, `InvitationPage`, `ClaimPage`,
`GameEditorPage`, `ProfileClaimDialog` (as in `DeckEditor`). Evidence: B.3.1
row G3, B.6 (CONFIRMED for the two components exercised; the other three
are the same pattern, not exercised). Verification: the gate and delay
experiments, full Vitest and browser suites. Risk: low; focus moves at most
one frame earlier. Addresses the #306 Vitest failure, the Invitation failure and the class
behind the eight one-shot assertions. New issue: yes (one, covering the five
components).

**Slice 7 — #315: background expiry check must not disable the dialog.**
Scope: `frontend/src/ProfileClaimDialog.tsx`. The
[candidate](ci-reliability/experimental-patches.md#315-candidate-application-correction-background-expiry-check-does-not-disable-controls)
shows the focus behavior only (B.4 row C2). Open design question for the
PO or an Issue Refiner: what happens to a user action that starts while the
check is in flight. Verification: `diag-315` with `DIAG_ALIGN`, `diag-315b`
in both engines, `ProfileClaim.test.tsx`, a regression test for focus and
Escape during a re-check. Risk: medium (write paths share `run()`); the
no-duplicate-write guarantee must be preserved. New issue: yes (accessibility
defect, low severity).

### D.3 Shared test infrastructure

**Slice 8 — strict history routing in `gameApi`.** An unregistered
`…/games/history?…` request is reported by name instead of answered with a
synthesized `404`. Scope: `frontend/src/test/gameFixtures.ts` and any test
that relies on the fallback. Confidence: argued, not measured. Risk: other
suites may depend on the fallback; fix their expectations explicitly.

**Slice 9 — no calendar-dependent fixtures.** Replace the four absolute
expiry timestamps with clock-relative values or an explicit comment when a
past value is the point of the test; consider a small lint or grep check for
ISO timestamps in test fixtures. Confidence: the risk is demonstrated by
#315; the guard is a proposal.

### D.4 Diagnostic improvements

**Slice 10 — failure context in the log.** On failure, print (Playwright:
attach and log) the focused element, scroll offset and the last API
requests; in Vitest fixtures, list unexpected requests. Each would have
named the cause of #315, #320 and #312 in the first CI log. Test-support
code only; no assertion changes.

**Slice 11 — evidence that can be retrieved.** Measure first: artifact size
and WebKit job duration with video kept only for failing tests. That is a
reporting setting, not a check; required jobs and assertions stay as they
are. Decide only with numbers.

### D.5 Lower-confidence items that need more evidence

- **#306 WebKit:** settle the focus scroll before the baseline in
  `game-details.pw.ts` (test-only helper, B.3.2). LIKELY cause; the trace in
  artifact `13997780889` should be read first.
- **WebKit job duration versus its 15-minute limit**, and whether the
  cancelled run in #314 was that limit (HYPOTHESIS; job metadata not read).
- **#298 side observation:** `EncodingError` from `decode()` in the first
  WebKit test of a worker (UNRESOLVED, harmless so far).
- **Historical residue:** the unexplained slow initial loads reported in
  PR #132 (UNRESOLVED; not seen in 10 full-suite runs here).

## E. Reproducibility appendix

### E.1 Environment

| | Investigation environment | GitHub Actions (from `.github/workflows/ci.yaml`) |
| --- | --- | --- |
| OS | Ubuntu 24.04.5 LTS, kernel 6.18.44 (virtual machine), x86_64 | `ubuntu-latest`; browser jobs inside `mcr.microsoft.com/playwright:v1.64.1-noble` |
| CPU / memory | 4 logical CPUs, 15 GiB RAM, no cgroup CPU or memory limit | Not recorded in the logs read; the frontend log format implies more than two CPUs |
| Node.js | 24.22.3 (npm 11.19.1) | `actions/setup-node` with `node-version: '24'` (exact patch not recorded) |
| Vitest | 5.0.0, jsdom 30.0.1, React 19.3.0, React Testing Library 16.3.3, `@testing-library/dom` 10.4.1 | Same lockfile |
| Playwright | `@playwright/test` 1.64.1 | Same |
| Chromium | 156.0.8078.4 (revision 1248) inside the pinned image | Same image |
| WebKit | 27.2 (revision 2370) inside the pinned image | Same image |
| MUI / router | `@mui/material` 9.5.0, `react-router` 8.4.0 | Same lockfile |
| Vitest settings | `vite.config.ts` unchanged except where a table says otherwise: more than two CPUs → 5 s test timeout, `maxWorkers: '100%'`; at most two CPUs → 15 s, one worker, `parallel`/`interactive` projects | Same file |
| Playwright settings | `playwright.config.ts` unchanged: one worker, zero retries, `CI=true` (video on, trace on failure), 30 s test timeout, 5 s expect timeout | Same file; job `timeout-minutes: 15` |
| Container runtime | Docker 29.9.2, `--ipc=host`, `--cpuset-cpus` as stated, image id `2f05f8a73450` | GitHub job container |

No secrets or non-default environment variables influenced the runs; the
variables used are the `DIAG_*`, `DELAY_IMMEDIATE` and `CI` values shown in
the commands.

### E.2 Deviations from CI

- Not a GitHub-hosted runner: different CPU model, disk and scheduler.
- Browser runs execute single spec files or diagnostic specs, usually with
  `--repeat-each`, `--reporter=line` and a separate `--output` directory,
  in a container pinned to the stated CPUs. CI runs the whole project per
  engine in one job. These runs are **not CI-equivalent**.
- Node 24 is mounted into the container from the host (the image ships Node
  26.13.0); CI installs Node 24 inside the container.
- Vitest runs marked “two-CPU affinity” select the low-CPU configuration of
  `vite.config.ts`; the failing CI job used the other configuration.
- Some browser repetitions ran while a second container used other CPUs;
  this is stated in the tables because load changes the #315 rate.
- **Full-suite baseline, run 6:** while it ran, the worktree's
  `GameDetailsPage.test.tsx` was replaced by its instrumented copy for about
  20 seconds (inert without `DELAY_IMMEDIATE`). The failure in that run is in
  a different, untouched file (`Invitation.test.tsx`), but the run is not a
  clean sample for `GameDetailsPage.test.tsx`. A diagnostic test file was
  also copied into `src/` for under a second during run 3; all ten runs
  report 54 files, so it was not picked up.
- No GitHub Actions run or rerun was triggered for this investigation.

### E.3 Exact commands

Setup (disposable worktree `wt` at the baseline, dependencies from `npm ci`):

```bash
git worktree add --detach wt 88966b7cdb9ce3cade955cd0f2ab36298f9514f1
cd wt/frontend && npm ci
```

Vitest, from `wt/frontend` (apply the setup patch first; repetition is a
shell loop around the command, with the count from the tables):

```bash
# #312
taskset -c 0,1 npx vitest run src/GamesHistory.test.tsx                 # B.1 row 1, 30 times
DELAY_IMMEDIATE=100 npx vitest run src/GamesHistory.test.tsx             # rows 2-3 (original, then corrected file)
DIAG_OUT=/tmp/diag312.log DELAY_IMMEDIATE=targeted npx vitest run src/GamesHistory.diag.test.tsx   # row 4
DIAG_FIX=1 DELAY_IMMEDIATE=targeted npx vitest run src/GamesHistory.diag.test.tsx                  # row 5
DIAG_OUT=/tmp/diag312.log DELAY_IMMEDIATE=trace npx vitest run src/GamesHistory.diag.test.tsx      # timeline
npm run test                                                             # row 6 and B.6, 10 times
# #306 Vitest (instrumented GameDetailsPage.test.tsx applied)
DIAG_OUT=/tmp/diag306v.log DELAY_IMMEDIATE=gate npx vitest run src/GameDetailsPage.test.tsx -t "loaded details view"   # G1
DIAG_FIX=1 DELAY_IMMEDIATE=gate npx vitest run src/GameDetailsPage.test.tsx -t "loaded details view"                  # G2
# G3: apply the layout-effect candidate, then the G1 command; G4: npx vitest run src/GameDetailsPage.test.tsx
# Invitation finding
DELAY_IMMEDIATE=100 npx vitest run src/Invitation.test.tsx -t "already active member"   # with and without the candidate
```

Browser runs, from the directory that contains `wt`:

```bash
pw() {  # pw <cpuset> <playwright arguments>; extra container environment in $PW_ENV
  local cpus=$1; shift
  docker run --rm --ipc=host --cpuset-cpus="$cpus" -e CI=true $PW_ENV \
    -v /opt/mtg-claude-cloud/node:/opt/node24:ro \
    -e PATH=/opt/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    -v "$PWD/wt":/work -w /work/frontend \
    mcr.microsoft.com/playwright:v1.64.1-noble npx playwright test "$@"
}
L="--reporter=line"
# #298
PW_ENV="-e DIAG_OUT=/work/d298.log -e DIAG_MODE=probe"    pw 2,3 e2e/diag-298.pw.ts $L
PW_ENV="-e DIAG_OUT=/work/d298.log -e DIAG_MODE=original" pw 2,3 e2e/diag-298.pw.ts $L
PW_ENV="-e DIAG_OUT=/work/d298.log -e DIAG_MODE=merged"   pw 2,3 e2e/diag-298.pw.ts --project=webkit --repeat-each=20 $L
pw 2,3 e2e/member-decks.pw.ts --project=webkit --reporter=list
# #306 WebKit
PW_ENV="-e DIAG_OUT=/work/d306.log -e DIAG_MODE=natural" pw 0,1 e2e/diag-306.pw.ts --project=webkit --grep "diag306 normal details at 1280" --repeat-each=60 $L   # row N
PW_ENV="-e DIAG_OUT=/work/d306b.log -e DIAG_VARIANT=plain" pw 0-3 e2e/diag-306b.pw.ts $L          # engine difference (also DIAG_VARIANT=lock)
G='--grep "diag306c normal details at 1280"'
PW_ENV="-e DIAG_OUT=/work/d306c.log -e DIAG_MODE=natural -e DIAG_PRE=top"     pw 0-3 e2e/diag-306c.pw.ts --project=webkit --repeat-each=20 $L ...  # row P
PW_ENV="-e DIAG_OUT=/work/d306c.log -e DIAG_MODE=induce -e DIAG_PRE=at227"    pw 0-3 e2e/diag-306c.pw.ts --repeat-each=10 $L ...                   # row Q1
PW_ENV="-e DIAG_OUT=/work/d306c.log -e DIAG_MODE=natural -e DIAG_PRE=at227"   pw 0-3 e2e/diag-306c.pw.ts --project=webkit --repeat-each=30 $L ...  # row Q2
PW_ENV="-e DIAG_OUT=/work/d306c.log -e DIAG_MODE=corrected -e DIAG_PRE=at227" pw 0-3 e2e/diag-306c.pw.ts --project=webkit --repeat-each=30 $L ...  # row Q3
#   (… = --grep "diag306c normal details at 1280"; rows P–Q also set -e DIAG_WINNER=atomic, which had no effect in WebKit)
# #315
E="-e DIAG_OUT=/work/d315.log -e DIAG_SHORT=1 -e DIAG_VARIANT=natural"
PW_ENV="$E" pw 2,3 e2e/diag-315.pw.ts --project=webkit --repeat-each=40 $L        # R1, while row N ran on CPUs 0,1
PW_ENV="$E" pw 3   e2e/diag-315.pw.ts --project=webkit --repeat-each=12 $L        # R2
PW_ENV="$E -e DIAG_ALIGN=150 -e DIAG_STATUS_DELAY=150" pw 0-3 e2e/diag-315.pw.ts --repeat-each=8 $L     # I1; C2 with the application candidate applied
PW_ENV="$E -e DIAG_EXPIRY=future -e DIAG_STATUS_DELAY=150" pw 0-3 e2e/diag-315.pw.ts --repeat-each=8 $L # C1
PW_ENV="-e DIAG_OUT=/work/d315b.log" pw 0-3 e2e/diag-315b.pw.ts $L                                      # both engines, past and future expiry
# #320 (Chromium)
V() { PW_ENV="-e DIAG_OUT=/work/d320.log -e DIAG_VARIANT=$1 $2" pw 0-3 e2e/diag-320.pw.ts --project=chromium $L "${@:3}"; }
V measure ""; V induce ""; V induce-after-B ""
V natural "" --repeat-each=30        # plus two runs with --repeat-each=40: row N
V natural "-e DIAG_THROTTLE=6" --repeat-each=15
V induce-steal "" --repeat-each=10   # S1; S3 and T3 with the respective application patch applied
V corrected "" --repeat-each=40      # S2
V natural "-e DIAG_THROTTLE=6" --repeat-each=10   # T5 with the application candidate applied
```

`/opt/mtg-claude-cloud/node` is the Node 24 installation of the cloud
environment; any Node 24 directory works. Each diagnostic spec appends its
observations to the file named by `DIAG_OUT`.

### E.4 Experimental modifications

All diffs are in the two patch documents linked at the top. The browser
patch document is larger than a single GitHub comment; if it is ever copied
into the tracker, post it per spec. Raw logs of the runs stayed in the
session's scratch directory and are not part of the repository; the tables
and excerpts in section B are the preserved evidence.

### E.5 Missing or unavailable evidence

- **Playwright evidence artifacts were not inspected.** All four exist and
  were unexpired on 14 November 2026: `13970998464` (#298, WebKit),
  `13997780889` (#306, WebKit), `14106570592` (#315, WebKit, expires
  28 November 2026) and `14112630073` (#320, Chromium). The environment's
  network policy first refused their storage hosts; after the PO approved
  four exact hosts, the session's command-permission layer refused the
  download itself, and it was not attempted a third time. No trace, video
  or screenshot from CI was opened.
- Job logs read: the failing step of the #312 frontend job in full; the last
  110 lines of the #315 WebKit job. For #298, #306 and #320 the failure
  details come from the issue texts.
- PR texts read: #132 and the commit list of #297. PRs #154, #295 and #301
  were not read; #268 was assessed from its body and comments.
- GitHub-hosted runner CPU counts and exact Node patch versions are not in
  the logs that were read.

### E.6 Work not completed

- Historical incidents were not re-run or bisected ([B.7](#b7-historical-incidents)).
- #306 WebKit remains LIKELY: the origin of offset 227 in CI and a natural
  local failure are missing.
- Natural-rate comparisons after the test-only candidates were run only for
  #320 (0 in 40). For #312, #315 and #306 the candidates were verified under
  induced conditions, not by long natural repetition.
- Application candidates were not run against the complete Vitest and
  browser suites, lint or build.
- `gameApi` strict routing, the fixture-timestamp guard and all diagnostic
  proposals are designs only.
- The WebKit job duration and the cancelled run in #314 were not examined.
- CI-equivalence: nothing here ran on a GitHub-hosted runner.

### E.7 Requested Product Owner follow-up

1. Decide on #298: it can be closed on the evidence in
   [B.2](#b2-298--webkit-member-deck-screenshot-timeout).
2. Authorize slice 1 soon: #315 currently fails at a high rate and will keep
   doing so on every branch.
3. Decide whether the three product corrections (slices 5–7) become issues,
   and whether slice 4 or slice 6 (or both) handles the focus assertions.
4. Create focused issues for the #320 defect and for the Invitation finding,
   or record them in #314; no issue was created or edited by this
   investigation.
5. If trace-level confirmation is wanted (mainly for #306 WebKit), download
   the artifacts in [E.5](#e5-missing-or-unavailable-evidence) before they
   expire and attach the relevant `trace.zip` files to the issues, or permit
   that download in a follow-up session.
6. Update the tracker's index: #315 is not WebKit-specific; #320 has a
   confirmed cause; the Invitation failure is new.
