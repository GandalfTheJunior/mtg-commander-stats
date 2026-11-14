# CI reliability investigation

| | |
| --- | --- |
| Investigation date | 14 November 2026 |
| Analyzed branch | `main` |
| Analyzed commit (baseline) | `88966b7cdb9ce3cade955cd0f2ab36298f9514f1` |
| Report status | **IN PROGRESS** |
| Tracking issue | [#314](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/314) |

> Snapshot investigation — findings reflect the analyzed commit and may be superseded by later fixes.

**Investigation submitted — documentation only. No CI fixes implemented.** Every
code change described here was applied only in a disposable worktree and is
preserved as a textual diff in
[experimental patches](ci-reliability/experimental-patches.md). The Product
Owner (PO) reviews these findings and separately authorizes any implementation.

Section status at this checkpoint:

| Section | Status |
| --- | --- |
| [#312 Games History pagination (Vitest)](#b1-312--games-history-pagination-vitest) | Complete — CONFIRMED ROOT CAUSE |
| [#298 WebKit member-deck screenshot timeout](#b2-298--webkit-member-deck-screenshot-timeout) | Complete — CONFIRMED ROOT CAUSE, fix already on `main` |
| #306 Game Details focus and scroll | In progress — treat as UNRESOLVED until its section is published |
| #315 WebKit claim-dialog focus restoration | In progress — treat as UNRESOLVED until its section is published |
| #320 Chromium cross-tab account switch | In progress — treat as UNRESOLVED until its section is published |
| Historical #268, #129, #142 | Not started |
| Cross-incident analysis, implementation plan | Preliminary; completed with the remaining sections |

How to read the confidence labels: **CONFIRMED ROOT CAUSE** means the failure
was induced deterministically by an intervention aimed at the suspected
mechanism, the causal chain is explained, and a temporary correction removed
the induced failure under the same conditions while keeping the behavioral
assertions. **LIKELY ROOT CAUSE**, **HYPOTHESIS** and **UNRESOLVED** are used
when that standard is not met. Repetition results are always written as
“F failures in N runs”. A run of passes is statistical evidence only.

## A. Executive summary

*Preliminary — covers the two completed incidents; it is rewritten when the
remaining sections are published.*

- **#312 is a test-instrumentation race, not an application defect
  (CONFIRMED).** `GamesHistory.test.tsx` fires a module-level `intersect`
  callback as soon as the expected cards are in the DOM. The
  `IntersectionObserver` for the next page is created by a React passive
  effect, which React flushes in a *later* event-loop task than the commit
  that renders the cards, and React Testing Library's `waitFor` can return in
  between. The test then fires the previous, already disconnected observer;
  its stale closure re-requests a cursor whose fixture reply was already
  consumed; the fixture's generic game route answers `404`; `GameManager`
  correctly enters its access-recovery state. Forcing that ordering fails
  20 of 20 runs with the exact CI signature; waiting for a live observer
  under the same forced ordering fails 0 of 20.
- The same race affects **seven more tests in that file**: four fail with a
  different symptom under the forced ordering, and three “retired append
  response” tests keep passing without exercising the code path they are
  named after.
- **#298 is a test-helper defect that is already corrected on `main`
  (CONFIRMED).** In WebKit, `decode()` on a `loading="lazy"` image that was
  never requested stays pending indefinitely; Chromium requests every image
  of this page eagerly. The original helper awaited `decode()` for every
  image. Restoring it fails 3 of 3 WebKit runs with the CI signature; the
  helper merged with PR #297 fails 0 of 60. The issue is still open only
  because its closure was never verified.
- **Evidence gap:** the Playwright trace artifacts of the four browser
  incidents exist until 26–28 November 2026 but could not be downloaded from
  this environment (see [E.5](#e5-missing-or-unavailable-evidence)). All
  browser findings therefore rest on job logs plus local reproduction in the
  pinned CI container image, not on the original traces.
- **Highest-priority recommendation so far:** apply the small, test-only #312
  correction (model `observe()`/`disconnect()` in the observer mock and wait
  for the live observer) and make the game fixture reject unknown history
  requests instead of synthesizing a `404`.

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
([patch](ci-reliability/experimental-patches.md#312-diagnostics)).

| # | Scope and conditions | Result | Failure signature |
| --- | --- | --- | --- |
| 1 | Unmodified `src/GamesHistory.test.tsx`, two-CPU affinity (`taskset -c 0,1`), isolated | **2 failures in 30 runs** | 1× the CI signature in the `41` case; 1× the `401` append case (`Found multiple elements with the role "article"`) |
| 2 | Unmodified file, all Scheduler callbacks delayed by 100 ms (`DELAY_IMMEDIATE=100`), four CPUs, isolated | **10 failures in 10 runs** | Each run fails the `21`, `40`, `41`, `401` and `403` cases |
| 3 | Candidate correction applied, same delay as row 2 | **0 failures in 10 runs** | — |
| 4 | Diagnostic `41` case, delay armed only from the first append on (`DELAY_IMMEDIATE=targeted`) | **20 failures in 20 runs** | Exact CI signature; 20 of 20 logs contain `history?cursor=page20 -> 404` |
| 5 | Same as row 4 plus “wait for exactly one observing observer” before firing | **0 failures in 20 runs** | — |
| 6 | Full suite, unmodified, `npm run test`, four CPUs | *Pending — see the next checkpoint* | |

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
([patch](ci-reliability/experimental-patches.md#298-diagnostics)) reuses the
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

No code change. Close #298 once the PO accepts this verification. Later CI
runs on `main` were not surveyed for this section, and no run was triggered
for this investigation.

#### Remaining uncertainties

- The original trace was not inspected, so the per-image state in the failed
  CI run is inferred from the local reproduction.
- Whether WebKit's behavior is intended was not researched; the conclusion
  does not depend on it.

### B.3 #306 — Game Details focus and scroll restoration

*In progress. Treat as UNRESOLVED until this section is published.*

### B.4 #315 — WebKit claim-dialog focus restoration

*In progress. Treat as UNRESOLVED until this section is published.*

### B.5 #320 — Chromium cross-tab account switch

*In progress. Treat as UNRESOLVED until this section is published.*

### B.6 Historical incidents (#268, #129, #142)

*Not started.*

## C. Cross-incident analysis

*Preliminary; completed with the remaining sections.*

- #312 and #298 have **independent causes**. They share only a general
  shape: a test helper waited on a condition that is not the condition the
  next step depends on (DOM content instead of the observer; every image
  instead of the images in the screenshot).
- **Systemic weakness 1 — DOM-visible is not effect-complete.** React
  commits DOM changes before it runs passive effects, and
  `waitFor`/`findBy…` can return between the two. Any test that, right after
  such a wait, relies on something a `useEffect` sets up (an observer, a
  listener, initial focus) carries the #312 race.
- **Systemic weakness 2 — permissive test doubles.** A mock observer that
  can be fired after `disconnect()` and an API fixture that answers unknown
  URLs with a plausible status turn an instrumentation error into what looks
  like application behavior.

## D. Prioritized implementation plan

*Preliminary; slices for the remaining incidents follow.*

### D.1 High-confidence targeted corrections

**Slice 1 — #312: deterministic observer mock in `GamesHistory.test.tsx`.**

- Objective: remove the stale-observer race from all tests of the file.
- Scope: `frontend/src/GamesHistory.test.tsx` only.
- Suggested correction: the
  [candidate patch](ci-reliability/experimental-patches.md#312-candidate-test-correction).
- Verification: repeat rows 2–5 of the [#312 table](#repeated-run-results)
  with the experimental delay (expected 0 failures), run the unmodified
  full suite, lint and typecheck. Keep all existing assertions.
- Risks: low; test-only. Interaction with #172: none known.
- New issue needed: no, #312 covers it.

### D.2 Shared test infrastructure improvements

**Slice 2 — #312: strict history routing in `gameApi`.**

- Objective: an unregistered `…/games/history?…` request must be reported by
  name instead of being answered with a synthesized `404`.
- Scope: `frontend/src/test/gameFixtures.ts` and the tests that rely on the
  permissive fallback (to be determined by running the suite).
- Risk: other suites may currently depend on the fallback; fix those
  expectations explicitly rather than keeping the fallback.
- Confidence: the diagnostic value is argued, not yet measured.

### D.3 Diagnostic improvements

*To be completed.*

### D.4 Lower-confidence investigations

*To be completed.*

## E. Reproducibility appendix

### E.1 Environment

| | Investigation environment | GitHub Actions (from `.github/workflows/ci.yaml`) |
| --- | --- | --- |
| OS | Ubuntu 24.04.5 LTS, kernel 6.18.44 (virtual machine), x86_64 | `ubuntu-latest`; browser jobs inside `mcr.microsoft.com/playwright:v1.64.1-noble` |
| CPU / memory | 4 logical CPUs, 15 GiB RAM, no cgroup CPU or memory limit | Not recorded in the logs; the frontend log format implies more than two CPUs |
| Node.js | 24.22.3 (npm 11.19.1) | `actions/setup-node` with `node-version: '24'` (exact patch not recorded) |
| Vitest | 5.0.0, jsdom 30.0.1, React 19.3.0, React Testing Library 16.3.3, `@testing-library/dom` 10.4.1 | Same lockfile |
| Playwright | `@playwright/test` 1.64.1 | Same |
| Chromium | 156.0.8078.4 (revision 1248) inside the pinned image | Same image |
| WebKit | 27.2 (revision 2370) inside the pinned image | Same image |
| MUI / router | `@mui/material` 9.5.0, `react-router` 8.4.0 | Same lockfile |
| Vitest settings | `vite.config.ts` unchanged except where a table says otherwise: more than two CPUs → 5 s test timeout, `maxWorkers: '100%'`; at most two CPUs → 15 s, one worker, `parallel`/`interactive` projects | Same file |
| Playwright settings | `playwright.config.ts` unchanged: one worker, zero retries, `CI=true` (video on, trace on failure) | Same file; job `timeout-minutes: 15` |
| Container runtime | Docker 29.9.2, `--ipc=host`, `--cpuset-cpus` as stated per experiment, image id `2f05f8a73450` | GitHub job container |

### E.2 Deviations from CI

- Not a GitHub-hosted runner: different CPU model, disk and scheduler.
- Browser runs execute single spec files or diagnostic specs, often with
  `--repeat-each`, inside a container pinned to two CPUs; CI runs the whole
  project in one job. Results from these runs are **not CI-equivalent**.
- Node 24 is mounted into the container from the host (the image itself
  ships Node 26.13.0); CI installs Node 24 inside the container.
- Vitest runs marked “two-CPU affinity” select the low-CPU configuration of
  `vite.config.ts`; the failing CI job used the other configuration.
- Some experiments ran while another experiment used the remaining CPUs.
  Where that could matter, the CPU set is stated.
- No GitHub Actions run or rerun was triggered for this investigation.

### E.3 Exact commands

Setup (disposable worktree `wt` at the baseline, dependencies from `npm ci`):

```bash
git worktree add --detach wt 88966b7cdb9ce3cade955cd0f2ab36298f9514f1
cd wt/frontend && npm ci
```

Vitest (#312), run from `wt/frontend`:

```bash
# Row 1: unmodified file, two CPUs, 30 repetitions
for i in $(seq 30); do taskset -c 0,1 npx vitest run src/GamesHistory.test.tsx; done
# Rows 2-3: all Scheduler host callbacks delayed (original, then corrected file), 10 repetitions each
DELAY_IMMEDIATE=100 npx vitest run src/GamesHistory.test.tsx
# Rows 4-5: targeted delay in the diagnostic case, 20 repetitions each
DIAG_OUT=/tmp/diag312.log DELAY_IMMEDIATE=targeted npx vitest run src/GamesHistory.diag.test.tsx
DIAG_FIX=1 DELAY_IMMEDIATE=targeted npx vitest run src/GamesHistory.diag.test.tsx
# Timeline of a normal run
DIAG_OUT=/tmp/diag312.log DELAY_IMMEDIATE=trace npx vitest run src/GamesHistory.diag.test.tsx
```

Browser runs (#298), from the directory that contains `wt`:

```bash
pw() {  # pw <playwright arguments>; extra container environment in $PW_ENV
  docker run --rm --ipc=host --cpuset-cpus=2,3 -e CI=true $PW_ENV \
    -v /opt/mtg-claude-cloud/node:/opt/node24:ro \
    -e PATH=/opt/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    -v "$PWD/wt":/work -w /work/frontend \
    mcr.microsoft.com/playwright:v1.64.1-noble npx playwright test "$@"
}
PW_ENV="-e DIAG_OUT=/work/diag298.log -e DIAG_MODE=probe"    pw e2e/diag-298.pw.ts --reporter=line
PW_ENV="-e DIAG_OUT=/work/diag298.log -e DIAG_MODE=original" pw e2e/diag-298.pw.ts --reporter=line
PW_ENV="-e DIAG_OUT=/work/diag298.log -e DIAG_MODE=merged"   pw e2e/diag-298.pw.ts --project=webkit --repeat-each=20 --reporter=line
pw e2e/member-decks.pw.ts --project=webkit --reporter=list
```

`/opt/mtg-claude-cloud/node` is the Node 24 installation of the cloud
environment; any Node 24 directory works.

### E.4 Experimental modifications

All diffs are in [experimental patches](ci-reliability/experimental-patches.md).
To reproduce after the worktree is gone: create the worktree as above, save a
diff block to a file and apply it with `git apply` from the repository root.

### E.5 Missing or unavailable evidence

- **Playwright evidence artifacts were not inspected.** All four exist and
  are not expired: `13970998464` (#298, WebKit), `13997780889` (#306,
  WebKit), `14106570592` (#315, WebKit, expires 28 November 2026) and
  `14112630073` (#320, Chromium). The environment's network policy first
  refused their storage hosts. After the PO approved four exact hosts, the
  session's command-permission layer refused the download itself. No trace,
  video or screenshot from CI was therefore opened. Statements about CI
  failures come from the issue texts and, where stated, from job logs.
- Job logs were read for the #312 frontend job (failing step in full) and the
  tail of the #315 WebKit job.
- GitHub-hosted runner CPU counts and exact Node patch versions are not in
  the logs that were read.

### E.6 Work not completed

See the section status table at the top. This list is finalized in the last
checkpoint.

### E.7 Requested Product Owner follow-up

1. Decide whether to close #298 based on [B.2](#b2-298--webkit-member-deck-screenshot-timeout).
2. If trace-level confirmation is wanted for the browser incidents, download
   the four artifacts listed in [E.5](#e5-missing-or-unavailable-evidence)
   before they expire and attach the relevant `trace.zip` files to the
   issues, or permit that download in a follow-up session.
3. Further items follow with the remaining sections.
