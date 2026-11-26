# Testing and verification

Every behavioral change should have appropriate automated coverage. Choose the
test level based on the risk being tested; security-sensitive behavior must be
tested.

## Test levels

- **Unit:** isolated business logic that can be tested meaningfully without
  Spring or external infrastructure. Do not build large mock-heavy tests merely
  to call them unit tests. If most setup mocks repositories or framework behavior,
  consider whether integration coverage would provide more value.
- **Integration:** collaboration involving Spring configuration, Spring Security,
  JPA mappings, transactions, repositories, Flyway migrations, or PostgreSQL
  behavior. Database integration tests must use PostgreSQL through Testcontainers,
  not H2. Match Compose's PostgreSQL major version (currently 18).
- **API integration:** prefer the application boundary for important application
  flows and authorization rules when that provides meaningful additional confidence.
- **Frontend:** verify observable user behavior rather than internal component
  implementation details.

The current backend context test exercises the actual datasource, JPA, and Flyway
infrastructure. Consult relevant existing tests and configuration when extending
coverage rather than assuming a feature or test infrastructure already exists.

## Shared PostgreSQL integration-test infrastructure

Spring integration-test contexts use a single PostgreSQL 18 Testcontainer per
test JVM. Each freshly constructed Spring application context gets a uniquely
named database inside that container, with its own datasource and Flyway
migration history. Cached contexts keep their own database; separate contexts
cannot observe or clean up one another's test records. Tests that intentionally
start disposable PostgreSQL containers themselves, such as
`FlywayResourceAvailabilityTest`, remain independent.
Each context's Hikari pool allows at most four connections and keeps no minimum
idle connections. The shared server allows 150 connections, leaving capacity for
all 32 cached contexts plus database creation and independently managed tests.

The canonical backend verification command remains `cd backend && ./mvnw
verify` without a Spring context-cache override, including in CI. Avoid
`spring.test.context.cache.maxSize` overrides as a substitute for test
isolation; if resource constraints force a deviation during investigation,
disclose it as not CI-equivalent under [Required checks](#required-checks).

## Test integrity

A failing test is a signal to investigate, not an obstacle to remove. Do not make
checks pass by deleting relevant tests, disabling tests, weakening assertions
without justification, suppressing lint/type/security rules without justification,
adding arbitrary retries for flaky tests, or changing expected behavior merely
to match the implementation. The only sanctioned way to take a test out of the
PR checks before its cause is fixed is the time-boxed
[quarantine](#quarantine-for-known-flaky-tests).

If requirements changed and an existing expectation is now incorrect, update it
and explain why the previous expectation is no longer valid. Investigate the
underlying cause of flaky tests.

## Required checks

Run checks relevant to the changed code before declaring completion. The
[README verification section](../../README.md#verification) owns the exact
commands: canonical backend verification and the frontend install, lint,
typecheck, test, and build sequence. The frontend test script must remain CI-safe
and terminate without interactive watch mode.

Run the canonical commands unchanged where possible. If a local verification
run deviates from the canonical command for any reason, whether forced by local
constraints or chosen deliberately (for example extra flags or properties, a
reduced Spring test context cache, test filters, fewer workers or environment
changes), report the exact deviation in the PR and label that result as not
CI-equivalent.
Such deviations can change test behavior, such as resetting shared application
state between test classes, so only the unchanged canonical command or the
required CI job verifies the check.

Disclose required checks that could not run and their blockers in the PR. Never
claim an unexecuted or unsuccessful check passed. Follow the
[workflow handoff standard](workflow.md#verification-and-handoff); required CI
checks remain required even when local verification is limited.

The development-only motion playground also has real Chromium/WebKit landing
regressions. See [browser setup and evidence](motion-playground.md#repeatable-browser-verification)
for commands and physical Safari acceptance checks; component mocks alone cannot
verify animation continuity across React commits.

## Quarantine for known flaky tests

A test that fails intermittently on unrelated changes blocks every PR until its
cause is found. The PO accepted (16 November 2026) that such a test may leave
the PR checks for a limited time while the investigation runs. Quarantine is not
a retry and not a fix: the test keeps running every night in the
[soak run](#nightly-soak-run), and its tracking issue stays open.

`frontend/test-quarantine.json` is the registry. Each entry names one test:

```json
{
  "runner": "playwright",
  "file": "e2e/example.pw.ts",
  "test": "describe title › exact test title",
  "issue": "https://github.com/GandalfTheJunior/mtg-commander-stats/issues/123",
  "since": "2026-11-16",
  "until": "2026-11-30"
}
```

- `runner` is `vitest` or `playwright`; `file` is relative to `frontend/`. A
  Playwright entry applies to both engines.
- `test` is the full title path below the file: every enclosing `describe`
  title and the test title, joined by ` › `, as `npx playwright test --list`
  prints it after the file name. A top-level test is just its title. The match
  is exact, so a test whose title merely contains the quarantined title, or
  adds an inline `@tag` to it, stays in the PR checks. Inline `@tag` text is
  part of the title. Specs that declare tags with Playwright's `tag` option
  cannot be matched exactly and are rejected by the registry validation. Vitest
  cases that share one title path (for example from `it.each` with a fixed
  title) are quarantined together.
- `issue` is the tracking issue, labeled `Quarantine`. It records the failing
  runs, the entry and its end date, and owns the root-cause fix.
- `since` and `until` are the first and last quarantined day (UTC), at most 14
  days apart. After `until` the entry stops applying by itself and the test
  gates PRs again. Extending it is a new reviewed change to the registry.
- Adding or extending an entry needs explicit PO approval. Use it for tests
  with recorded intermittent failures on unrelated changes, never for a test
  that fails deterministically or that the same PR adds or changes.

A quarantined test returns to the PR checks only after its fix is confirmed.
The PO decided (17 November 2026) on one rule for test and product fixes alike,
because a single PR run or burn-in cannot rule out a rare failure:

1. The fix PR references the tracking issue (`Refs #123`) but leaves the
   registry entry in place.
2. After the fix is merged, the entry stays until the test is **green on three
   consecutive nights** in every soak job that runs it: `vitest soak`, or both
   `browser soak` engines for a Playwright test. A night is green only when
   every expected repetition ran and passed; a red, incomplete or not-run
   night restarts the count.
3. A separate small PR then removes the entry and closes the tracking issue
   (`Closes #123`).
4. If `until` arrives first, the PO decides whether to extend the quarantine
   (a new entry with new approval) or let it lapse so the test gates PRs again.

Review quarantine weekly: open the latest soak run's summary and the
[quarantine board](#quarantine-board), and decide for each entry whether it is
still under investigation, ready to return or close to its end date.

While an entry is in force, `npm run test` reports the Vitest test as skipped
with its end date and issue, and `npm run test:browser` leaves the Playwright
test out. Set `RUN_QUARANTINED=1` to run quarantined tests locally. The
`frontend` job validates the registry (`node --test tools/ci/*.test.mjs`).

### Quarantine board

The [quarantine board](https://github.com/users/GandalfTheJunior/projects/3/views/1)
(a GitHub project) follows every tracking issue through the rules above:

| Status | Meaning | Set |
| --- | --- | --- |
| To do | The test is quarantined; nobody works on its cause yet. | Automatically when an issue gets the `Quarantine` label. |
| In progress | The cause is being investigated or a fix PR is open. | Manually. |
| Verifying | The fix is merged; green soak nights are being counted. | Manually. |
| Done | The entry is removed and the tracking issue is closed. | Automatically when the issue closes. |

The `Quarantine` label is added only after the PO approved the entry, so To do
always means quarantined. Only the PR that removes the registry entry closes
the tracking issue, with a closing keyword such as `Closes #123`. The PR that
adds the entry and the fix PR use `Refs #123`, and nobody links them in the
issue's Development sidebar: a closing keyword or such a link closes the issue
when the PR merges, which would skip the green nights and move the item to
Done.

### Recognizing quarantine candidates

When a CI job fails on a test, whoever investigates the failure classifies it
before proposing a rerun, a fix or a quarantine. A failing test is a
**quarantine candidate** only when all of these hold:

1. **Unrelated to the change.** The PR or commit changes neither the test, its
   helpers or fixtures, nor the code the test exercises. Name the files checked.
2. **Not deterministic.** The test passes on the base revision, in other runs or
   in repeated local runs. A green CI rerun alone is not evidence.
3. **Recurring.** The same signature (test, failing line and assertion) failed
   at least twice, on two different commits that do not touch it. Attempts on
   one commit count once. Look in open `Quarantine` issues, the CI reliability
   tracker [#314](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/314),
   soak summaries and CI history.
4. **No evident small fix.** If the code shows the mechanism and the fix is
   small, for example an assertion made before a passive React effect ran
   ([#339](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/339)),
   propose the fix instead.
5. **Not plausibly worsened by the change.** If the failure has so far appeared
   only on the current PR, investigate whether the change causes or provokes it,
   for example through added load, before calling it unrelated.

Report one classification with its evidence in the PR's Reviewer Context and
in the final response. Check the classifications in this order; the first that
applies is the result. Earlier recorded occurrences never override evidence
that the change causes the failure or that a small fix is evident.

1. **Change-related:** the change causes or provokes the failure (criterion 1
   or 5 fails), or the test fails deterministically (criterion 2 fails). Fix it
   within the task's scope or report the CI failure.
2. **Fix instead of quarantine:** criterion 4 fails. Describe the mechanism and
   the proposed fix, even when the signature is already tracked in an issue.
3. **Already quarantined:** an open `Quarantine` issue tracks the signature.
   Record the occurrence there (see below); no further proposal.
4. **New candidate:** all five criteria hold, including for a signature that
   is so far only recorded in #314 or another issue. Propose the quarantine to
   the PO with the occurrences and a draft registry entry. Creating the
   tracking issue, adding the `Quarantine` label and editing the registry need
   PO approval.
5. **Insufficient evidence:** none of the above, for example a first
   occurrence, or a failure whose relation to the change or whose
   intermittency is not yet established. Report the failure with its
   signature, run, job and evidence links; state that the cause is unknown.
   Do not assert a cause and do not propose quarantine.

Independently of the classification, note whether the signature is already
tracked: in an open `Quarantine` issue, in
[#314](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/314) or in
another issue. The PO decided (17 November 2026) that agents may add a new
occurrence to an open `Quarantine` issue as a comment without asking: PR,
commit, run, job, signature, evidence links and whether the change touches the
test. For signatures tracked elsewhere or not at all, report the occurrence
without writing anywhere, so the PO can record it.

A failure of a quarantined test in the soak run is expected until its fix is
confirmed and is not a new candidate.

## Nightly soak run

The [Soak workflow](../../.github/workflows/soak.yaml) runs on the default branch
every night at 01:23 UTC and via manual dispatch. It measures intermittent
failures away from PRs: the complete Vitest suite five times, and every
Playwright spec three times per engine (`--repeat-each=3`), with quarantined
tests included. Its jobs (`vitest soak`, `browser soak (chromium|webkit)`) are
not PR checks and cannot satisfy `frontend` or the browser jobs.

Each job summary lists every test that failed at least once with its failure
count, runs, quarantine end date and first error line; a job fails when any
repetition failed. Parametrized Vitest cases that share a title path are counted
separately, labeled by their position in the file. **Errors outside tests**
lists failures that are not attributed to a test, such as a throwing
`beforeAll` or a spec that fails to load; the affected tests may not have run.
A **Quarantine status** section then lists every entry in force for that job's
runner, green or not: its result that night, failed and run repetitions out of
the expected ones and days left. The expected repetitions come from the run
plan in the workflow (`VITEST_RUNS`, `PLAYWRIGHT_REPEATS`), not from the reports
that exist, so a repetition that crashed before writing its report still
counts and is listed as an error outside tests. `incomplete` means some
repetitions did not execute the test; `not run` means none did, usually because
of an error outside tests or a renamed test whose entry must be corrected.

The `vitest-soak-results` and `browser-soak-results-<engine>` artifacts keep the
JSON reports and, for browser failures, traces, error context and Playwright's
failure screenshots for 14 days. Screenshots that tests write to their own
output directory are not uploaded; the trace records every step of a failed
test. Use these counts to prioritize investigations and to count the green
nights before removing a quarantine entry. A newly added workflow may not
be dispatchable until it exists on the default branch; an unrun soak is not
evidence of stability.

## Invitation request quota isolation

Group HTTP integration tests use real loopback connections and shared Spring
contexts. Their `InvitationLimitIsolation` test listener clears only the limiter's
peer cache through a package-private `clear()` before each test method, so
unrelated fixtures cannot exhaust one another's quota. The production limit is
neither increased nor disabled. An ordered HTTP regression verifies both the real 120-request limit within a method
and fresh quota in the next method using the same context. Limiter unit tests
cover expiry, capacity eviction and IPv6 /64 aggregation. Use the
[required checks](#required-checks) for complete-suite verification.

## Coverage baseline (no minimum thresholds)

Coverage reports measure code executed by tests, not correctness or useful
assertions. They supplement the integration and browser regressions; they do not
replace them. Low percentages never fail CI; real test, lint, typecheck and build
failures still do. No external coverage service or additional required job is used.

### Local commands and report scope

- Backend: `cd backend && ./mvnw verify` runs all existing Maven tests with
  JaCoCo 0.8.14 (Java 25 support). Open `target/site/jacoco/index.html`; the
  machine-readable report is `target/site/jacoco/jacoco.xml`. The denominator is
  all compiled classes in `src/main/java`, including classes with no test hits,
  without feature/package exclusions. Test/demo fixtures in `src/test` and
  dependency classes are outside it. JaCoCo's standard compiler-generated-code
  filters apply. The agent observes the Maven test JVM, not separately launched
  demo Java processes. Run from a clean workspace for a fresh baseline.
- Frontend: `cd frontend && npm ci && npm run test:coverage`. This is one complete,
  noninteractive Vitest run with V8 enabled. Coverage runs test files serially
  to avoid instrumented UI flows competing for CPU and exceeding their existing
  time budgets; test isolation, assertions and timeouts are unchanged. Its coverage map is partitioned into
  `coverage/app/` and `coverage/playground/`, each containing `index.html`,
  `coverage-final.json` (per-file counters) and `coverage-summary.json` (totals
  and per-file percentages). There is no combined frontend headline percentage.
- App means `src/**/*.{ts,tsx}` outside `src/playground/`; Playground means
  `src/playground/**/*.{ts,tsx}`. Explicit inclusion makes unimported executable
  modules appear as uncovered, including entry points and theme fixtures.
  Both exclude `*.test.{ts,tsx}`, `*.spec.{ts,tsx}`, Storybook stories
  (`*.stories.{ts,tsx}`), declarations (`*.d.ts`) and `src/test/**` (test
  setup/helpers). CSS, images and type-only code have no
  executable JavaScript counters; generated output and dependencies are outside
  `src/`. No application module is excluded merely because it lacks tests.
- `npm run test:coverage-reporter` checks partitioning and the zero-hit denominator
  with small synthetic covered/uncovered modules. The real baseline also includes
  unimported entry modules; inspect them in the per-file reports.
- `npm run test` remains the uninstrumented standard suite, including the
  performance comparisons from #142. Coverage adds V8 collection, source mapping
  and HTML generation overhead; do not compare its duration to an uninstrumented
  baseline. No second app/playground test run is needed.

### CI and interpretation

PRs to `main` and pushes to `main` run the required `frontend` job with
`npm run test`: the complete, uninstrumented Vitest suite, after install,
lint and typecheck and before build. Demo tooling and Codespaces safety checks
remain in that job. The required `backend` job (including JaCoCo), Windows
tooling checks and Chromium/WebKit browser jobs remain unchanged. A failing
test fails its job; coverage does not replace or conditionally skip these gates.

**PR checks no longer produce frontend coverage artifacts.** The separate
[Frontend coverage workflow](../../.github/workflows/frontend-coverage.yaml)
runs on the default branch every Monday at 03:00 UTC (`0 3 * * 1`) and via
manual dispatch on the default branch. It checks out that branch explicitly,
runs `npm ci`, `npm run test:coverage-reporter` and the same complete, serial
`npm run test:coverage` used locally. Its distinct `frontend-coverage` job is
not a PR check or branch-protection prerequisite and cannot satisfy `frontend`.
Reporter/test failures propagate normally; there are no percentage thresholds.

The latest scheduled/manual run is the frontend coverage source of record;
check its commit SHA because it may lag behind a PR's code. The coverage workflow
publishes `frontend-app-coverage` and `frontend-playground-coverage`; regular
backend verification publishes `backend-coverage`. All three artifacts are kept
for 14 days. Extract an artifact and open `index.html` for file-level details;
frontend artifacts also contain `coverage-final.json` and
`coverage-summary.json`. Coverage jobs print counts and percentages in the log
and GitHub job summary.

Upload steps use `if: always()` to attempt publication even when earlier steps
fail, if reports exist. This does not mask a failed reporter/test step. Vitest
reports on test failure; a setup failure or interrupted run can leave no report.
Maven's verify-phase JaCoCo report may be absent when tests fail before verify.
A missing report is not zero coverage or a successful test run.

A newly added workflow may not be manually dispatchable until it exists on the
default branch. After merge, open **Actions → Frontend coverage → Run workflow**,
select the default branch and run it once. Confirm the reporter check and complete
coverage suite succeed, the summary has both scopes, and both artifacts contain
HTML and JSON reports. Inspect the existing reporter checks for failure handling
and verify that reporter/test steps have no `continue-on-error` and uploads retain
`if: always()`; a failed step must leave the job failed. Do not treat an unrun
scheduled/manual workflow as verified.


Line coverage counts executable source lines, branch coverage counts instrumented
alternatives, and function (frontend) / method (backend) coverage counts invoked
functions/methods. Their denominators differ. JaCoCo and V8 use different language,
compiler and instrumentation rules, so backend/frontend percentages are not
directly comparable. A covered line or branch need not have a meaningful
assertion. Playwright's `playground-browser` job and its evidence remain separate
and are not incorporated into Vitest coverage.

The implementation PR records the first actual baseline with its commit SHA,
exact commands, counts, percentages and measurement limits. Later CI summaries
and downloadable artifacts are the source of subsequent measurements; do not
interpret the original baseline as a permanent quality target.
