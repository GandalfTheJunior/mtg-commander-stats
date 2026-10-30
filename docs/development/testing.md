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

The existing `backend` and `frontend` jobs publish `backend-coverage`,
`frontend-app-coverage` and `frontend-playground-coverage` artifacts for 14 days.
Extract an artifact and open `index.html` for file-level details. Both jobs print
counts and percentages in the log and GitHub job summary. Upload steps run even
when earlier steps fail, if reports exist. Vitest reports on test failure;
Maven's verify-phase JaCoCo report may be absent when tests fail before verify.
A missing report is not zero coverage or a successful test run.

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
