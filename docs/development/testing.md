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

## Test integrity

A failing test is a signal to investigate, not an obstacle to remove. Do not make
checks pass by deleting relevant tests, disabling tests, weakening assertions
without justification, suppressing lint/type/security rules without justification,
adding arbitrary retries for flaky tests, or changing expected behavior merely
to match the implementation.

If requirements changed and an existing expectation is now incorrect, update it
and explain why the previous expectation is no longer valid. Investigate the
underlying cause of flaky tests.

## Required checks

Run checks relevant to the changed code before declaring completion. The
[README verification section](../../README.md#verification) owns the exact
commands: canonical backend verification and the frontend install, lint,
typecheck, test, and build sequence. The frontend test script must remain CI-safe
and terminate without interactive watch mode.

Disclose required checks that could not run and their blockers in the PR. Never
claim an unexecuted or unsuccessful check passed. Follow the
[workflow handoff standard](workflow.md#verification-and-handoff); required CI
checks remain required even when local verification is limited.


The development-only motion playground also has real Chromium/WebKit landing
regressions. See [browser setup and evidence](motion-playground.md#repeatable-browser-verification)
for commands and physical Safari acceptance checks; component mocks alone cannot
verify animation continuity across React commits.

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
  Both exclude `*.test.{ts,tsx}`, `*.spec.{ts,tsx}`, declarations (`*.d.ts`) and
  `src/test/**` (test setup/helpers). CSS, images and type-only code have no
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
